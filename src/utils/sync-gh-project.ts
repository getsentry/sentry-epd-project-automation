import { graphql } from '@octokit/graphql';

interface IssueWithDetails {
  id: string;
  title: string;
  number: number;
  issueType?: {
    id: string;
    name: string;
  };
  projectItems: {
    nodes: {
      id: string;
      project: {
        id: string;
        title: string;
      };
      goal: {
        id: string;
        name: string;
        optionId: string;
      } | null;
      team: {
        id: string;
        name: string;
        optionId: string;
      } | null;
    }[];
  };
  parent: IssueWithDetails | null;
}

const RepoToTeamMap: Record<string, string> = {
  'getsentry/sentry-javascript': 'Web Frontend SDKs',
  'getsentry/sentry-python': 'Web Backend SDKs',
};

export async function syncGithubProjectForIssue(
  githubToken: string,
  {
    projectId,
    issueId,
  }: {
    projectId: string;
    issueId: string;
  },
): Promise<{ status: string }> {
  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${githubToken}`,
      'GraphQL-Features': 'sub_issues,issue_types',
    },
  });

  const res = await graphqlWithAuth<{
    node: IssueWithDetails & {
      repository: {
        nameWithOwner: string;
      };
    };
  }>(
    /* GraphQL */ `
      fragment IssueWithDetails on Issue {
        id
        title
        number

        issueType {
          id
          name
        }

        projectItems(first: 50) {
          nodes {
            id
            project {
              id
              title
            }
            goal: fieldValueByName(name: "Goal") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                id
                name
                optionId
              }
            }
            team: fieldValueByName(name: "Team") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                id
                name
                optionId
              }
            }
          }
        }
      }

      query getParentIssue($issueId: ID!) {
        node(id: $issueId) {
          ... on Issue {
            ...IssueWithDetails
            repository {
              nameWithOwner
            }
            parent {
              ...IssueWithDetails
              parent {
                ...IssueWithDetails
                parent {
                  ...IssueWithDetails
                  parent {
                    ...IssueWithDetails
                    parent {
                      ...IssueWithDetails
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      issueId,
    },
  );

  // e.g. getsentry/projects
  const issueFullRepository = res.node.repository.nameWithOwner;

  const teamName = RepoToTeamMap[issueFullRepository];

  const goalIssue = findParentByType(res.node, 'Goal');
  const subGoalIssue = findParentByType(res.node, 'Sub-Goal');
  const projectIssue = findParentByType(res.node, 'Project');

  const issue = res.node;

  if (!goalIssue) {
    return { status: 'Goal issue not found, skipping...' };
  }

  if (goalIssue === issue) {
    return { status: 'Issue is goal issue, skipping...' };
  }

  const goalIssueProjectItem = goalIssue.projectItems.nodes.find(
    (node) => node.project.id === projectId,
  );

  if (!goalIssueProjectItem) {
    return { status: 'Root issue is not in specified project, skipping...' };
  }

  const goalName = goalIssue.title;
  const subGoalName = subGoalIssue?.title;
  const projectName = projectIssue?.title;

  // Scenario 1: Issue is not yet in project
  const issueProjectItem = issue.projectItems.nodes.find(
    (node) => node.project.id === projectId,
  );

  if (!issueProjectItem) {
    console.log(
      `Issue with ID ${issue.id} is not in EPD Projects, adding it...`,
    );
    // Add it to the project
    await addProjectToIssue(graphqlWithAuth, {
      projectId,
      issueId: issue.id,
      goalName,
      teamName,
      subGoalName,
      projectName,
    });
    return { status: 'Issue added to project' };
  }

  // Scenario 2: Issue is in project - check if goal is correct
  const goal = issueProjectItem.goal;

  if (!goal || goal.name !== goalName) {
    console.log(
      `Issue with ID ${issue.id} is in EPD Projects but has incorrect goal, updating...`,
    );
    await setGoalOnProjectItem(graphqlWithAuth, {
      projectId,
      itemId: issueProjectItem.id,
      goalName,
    });
    console.log('Project goal updated!');
  }

  const team = issueProjectItem.team;

  if (teamName && (!team || team.name !== teamName)) {
    console.log(
      `Issue with ID ${issue.id} is in EPD Projects but has incorrect team, updating...`,
    );
    await setTeamOnProjectItem(graphqlWithAuth, {
      projectId,
      itemId: issueProjectItem.id,
      teamName,
    });
    console.log('Project team updated!');
  }

  // Update remaining fields
  console.log(
    `Updating fields on the project: Goal="${goalName || '<none>'}", Sub-Goal="${subGoalName || '<none>'}", Project="${projectName || '<none>'}"`,
  );
  await setFieldsOnProjectItem(graphqlWithAuth, {
    projectId,
    itemId: issueProjectItem.id,
    goalName,
    subGoalName,
    projectName,
  });

  return { status: 'Issue project item is up-to-date' };
}

function findParentByType(
  issue: IssueWithDetails,
  issueType: string,
): IssueWithDetails | null {
  if (issue.issueType?.name === issueType) {
    return issue;
  }

  if (!issue.parent) {
    return null;
  }

  return findParentByType(issue.parent, issueType);
}

async function getProjectFields(
  graphqlWithAuth: typeof graphql,
  { projectId }: { projectId: string },
) {
  const res = await graphqlWithAuth<{
    node: {
      id: string;
      title: string;
      goals: {
        id: string;
        name: string;
        options: { id: string; name: string }[];
      };
      teams: {
        id: string;
        name: string;
        options: { id: string; name: string }[];
      };
      goalField: { id: string; name: string };
      subGoalField: { id: string; name: string };
      projectField: { id: string; name: string };
    } | null;
  }>(
    /* GraphQL */ `
      query getProject($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
            goals: field(name: "Goal") {
              ... on ProjectV2SingleSelectField {
                name
                id
                options {
                  id
                  name
                }
              }
            }
            teams: field(name: "Team") {
              ... on ProjectV2SingleSelectField {
                name
                id
                options {
                  id
                  name
                }
              }
            }
            goalField: field(name: "Goal (v2)") {
              ... on ProjectV2Field {
                name
                id
              }
            }
            subGoalField: field(name: "Sub-Goal") {
              ... on ProjectV2Field {
                name
                id
              }
            }
            projectField: field(name: "Project") {
              ... on ProjectV2Field {
                name
                id
              }
            }
          }
        }
      }
    `,
    {
      projectId,
    },
  );

  return {
    goals: res.node?.goals,
    teams: res.node?.teams,
    goalFieldId: res.node?.goalField.id,
    subGoalFieldId: res.node?.subGoalField.id,
    projectFieldId: res.node?.projectField.id,
  };
}

async function addProjectToIssue(
  graphqlWithAuth: typeof graphql,
  {
    projectId,
    issueId,
    goalName,
    teamName,
    subGoalName,
    // NOTE: This is not the name of the project, but the project field
    projectName,
  }: {
    projectId: string;
    issueId: string;
    goalName: string;
    teamName?: string;
    subGoalName?: string;
    projectName?: string;
  },
) {
  // Add project to issue
  const res = await graphqlWithAuth<{
    addProjectV2ItemById: {
      item: {
        id: string;
        project: {
          goals: {
            id: string;
            name: string;
            options: { id: string; name: string }[];
          };
        };
      };
    };
  }>(
    /* GraphQL */ `
      mutation addProjectToIssue($projectId: ID!, $issueId: ID!) {
        addProjectV2ItemById(
          input: { projectId: $projectId, contentId: $issueId }
        ) {
          item {
            id
          }
        }
      }
    `,
    {
      issueId,
      projectId,
    },
  );

  const itemId = res.addProjectV2ItemById.item.id;

  // Update the "Goal" field
  console.log(`Updating goal for issue ${issueId} to ${goalName}...`);
  await setGoalOnProjectItem(graphqlWithAuth, {
    projectId,
    itemId,
    goalName,
  });

  // Update the "Team" field, if we found a match
  if (teamName) {
    console.log(`Updating team for issue ${issueId} to ${teamName}...`);
    await setTeamOnProjectItem(graphqlWithAuth, {
      projectId,
      itemId,
      teamName,
    });
  }

  console.log(
    `Updating fields on the project: Goal=${goalName || '<none>'}, Sub-Goal=${subGoalName || '<none>'}, Project=${projectName || '<none>'}`,
  );
  await setFieldsOnProjectItem(graphqlWithAuth, {
    projectId,
    itemId,
    goalName,
    subGoalName,
    projectName,
  });
}

/** LEGACY - old "Goals" field, eventually remove this. */
async function setGoalOnProjectItem(
  graphqlWithAuth: typeof graphql,
  {
    projectId,
    itemId,
    goalName,
  }: {
    projectId: string;
    itemId: string;
    goalName: string;
  },
) {
  const { goals } = await getProjectFields(graphqlWithAuth, {
    projectId,
  });

  const fieldId = goals?.id;
  const optionId = goals?.options.find(
    (option) => option.name === goalName,
  )?.id;

  if (!fieldId || !optionId) {
    console.log(`Goal with name ${goalName} not found in project, skipping...`);
    return;
  }

  await setOptionFieldOnProjectItem(graphqlWithAuth, {
    projectId,
    itemId,
    fieldId,
    optionId,
  });
}

async function setTeamOnProjectItem(
  graphqlWithAuth: typeof graphql,
  {
    projectId,
    itemId,
    teamName,
  }: {
    projectId: string;
    itemId: string;
    teamName: string;
  },
) {
  const { teams } = await getProjectFields(graphqlWithAuth, {
    projectId,
  });

  const fieldId = teams?.id;
  const optionId = teams?.options.find(
    (option) => option.name === teamName,
  )?.id;

  if (!fieldId || !optionId) {
    console.log(`Team with name ${teamName} not found in project, skipping...`);
    return;
  }

  await setOptionFieldOnProjectItem(graphqlWithAuth, {
    projectId,
    itemId,
    fieldId,
    optionId,
  });
}

async function setOptionFieldOnProjectItem(
  graphqlWithAuth: typeof graphql,
  {
    projectId,
    itemId,
    fieldId,
    optionId,
  }: {
    projectId: string;
    itemId: string;
    fieldId: string;
    optionId: string;
  },
) {
  await graphqlWithAuth(
    /* GraphQL */ `
      mutation updateOptionFieldOnProjectItem(
        $projectId: ID!
        $fieldId: ID!
        $itemId: ID!
        $optionId: String!
      ) {
        updateProjectV2ItemFieldValue(
          input: {
            fieldId: $fieldId
            itemId: $itemId
            projectId: $projectId
            value: { singleSelectOptionId: $optionId }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `,
    {
      fieldId,
      projectId,
      optionId,
      itemId,
    },
  );
}

async function setTextFieldOnProjectItem(
  graphqlWithAuth: typeof graphql,
  {
    projectId,
    itemId,
    fieldId,
    fieldText,
  }: {
    projectId: string;
    itemId: string;
    fieldId: string;
    fieldText: string;
  },
) {
  await graphqlWithAuth(
    /* GraphQL */ `
      mutation updateOptionFieldOnProjectItem(
        $projectId: ID!
        $fieldId: ID!
        $itemId: ID!
        $fieldText: String!
      ) {
        updateProjectV2ItemFieldValue(
          input: {
            fieldId: $fieldId
            itemId: $itemId
            projectId: $projectId
            value: { text: $fieldText }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `,
    {
      fieldId,
      projectId,
      fieldText,
      itemId,
    },
  );
}

async function setFieldsOnProjectItem(
  graphqlWithAuth: typeof graphql,
  {
    projectId,
    itemId,
    goalName,
    subGoalName,
    projectName,
  }: {
    projectId: string;
    itemId: string;
    goalName: string;
    subGoalName?: string;
    projectName?: string;
  },
) {
  const { goalFieldId, subGoalFieldId, projectFieldId } =
    await getProjectFields(graphqlWithAuth, {
      projectId,
    });

  if (goalFieldId && goalName) {
    await setTextFieldOnProjectItem(graphqlWithAuth, {
      fieldId: goalFieldId,
      projectId,
      itemId,
      fieldText: goalName,
    });
  }

  if (subGoalFieldId && subGoalName) {
    await setTextFieldOnProjectItem(graphqlWithAuth, {
      fieldId: subGoalFieldId,
      projectId,
      itemId,
      fieldText: subGoalName,
    });
  }

  if (projectFieldId && projectName) {
    await setTextFieldOnProjectItem(graphqlWithAuth, {
      fieldId: projectFieldId,
      projectId,
      itemId,
      fieldText: projectName,
    });
  }
}
