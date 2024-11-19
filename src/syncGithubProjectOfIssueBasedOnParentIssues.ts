import { graphql } from '@octokit/graphql';
import { setFieldsOnProjectItem } from './utils/updateProjectItem.js';
import { getTeamForFullRepo } from './utils/getTeamForRepo.js';

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

/**
 * This function is triggered when an issue has its parent issue updated.
 * We want to pick the parent issue(s) recursively, find the ones with issueType = Goal / Sub-Goal / Project,
 * and:
 * 1. Add the issue to the project if it's not already there
 * 2. Ensure that the goal, sub-goal, project, and team fields are set correctly for the sub-issue
 */
export async function syncGithubProjectOfIssueBasedOnParentIssues(
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

  const teamName = getTeamForFullRepo(issueFullRepository);

  const goalIssue = findParentByType(res.node, 'Goal');
  const subGoalIssue = findParentByType(res.node, 'Sub-Goal');
  const projectIssue = findParentByType(res.node, 'Project');

  const issue = res.node;

  console.log(
    `Fetched GitHub issue "${issue.title}" from repo "${issueFullRepository}"`,
  );

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
  const team = issueProjectItem.team;

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
    // If the team name has not changed, we don't need to update it
    teamName:
      teamName && (!team || team.name !== teamName) ? teamName : undefined,
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

  console.log(
    `Updating fields on the project: Goal=${goalName || '<none>'}, Sub-Goal=${subGoalName || '<none>'}, Project=${projectName || '<none>'}, Team=${teamName || '<none>'}`,
  );
  await setFieldsOnProjectItem(graphqlWithAuth, {
    projectId,
    itemId,
    goalName,
    subGoalName,
    projectName,
    teamName,
  });
}
