import { graphql } from '@octokit/graphql';
import { setFieldsOnProjectItem } from './utils/updateProjectItem.js';

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
    }[];
  };
}

interface IssueWithSubIssues extends IssueWithDetails {
  subIssues: {
    nodes: IssueWithDetails[];
  };
}

/**
 * This function is triggered when an issue is edited.
 * If the issue is of issueType Goal / Sub-Goal / Project, we want to:
 * 1. Pick all sub issues (recursively)
 * 2. And update their Goal / Sub-Goal / Project fields based on the title of the edited issue
 */
export async function syncGithubProjectOfChildIssues(
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

  const issue = await getSubIssues(graphqlWithAuth, issueId);

  console.log(
    `Fetched GitHub issue "${issue.title}" with issue Type "${issue.issueType?.name}"`,
  );

  const projectItem = issue.projectItems.nodes.find(
    (node) => node.project.id === projectId,
  );

  if (!projectItem) {
    return { status: 'Issue is not in specified project, skipping...' };
  }

  // First check: We only care about Goal, Sub-Goal and Project issues.
  const issueTypes = ['Goal', 'Sub-Goal', 'Project'];

  const issueType = issue.issueType?.name;
  if (!issueTypes.includes(issueType!)) {
    console.log(
      `We only update child issues for issues of types ${issueTypes.join(', ')}, but this has ${issueType}`,
    );
    return { status: 'Skipped because of issue type' };
  }

  const isGoal = issueType === 'Goal';
  const isSubGoal = issueType === 'Sub-Goal';
  const isProject = issueType === 'Project';

  // We only set the names we want to update, leave the others undefined
  // undefined fields will not be updated
  const goalName = isGoal ? issue.title : undefined;
  const subGoalName = isSubGoal ? issue.title : undefined;
  const projectName = isProject ? issue.title : undefined;

  return updateChildIssues(graphqlWithAuth, issue, {
    projectId,
    goalName,
    subGoalName,
    projectName,
  });
}

async function getSubIssues(graphqlWithAuth: typeof graphql, issueId: string) {
  const res = await graphqlWithAuth<{
    node: IssueWithSubIssues;
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
          }
        }
      }

      query getSubIssues($issueId: ID!) {
        node(id: $issueId) {
          ... on Issue {
            ...IssueWithDetails

            subIssues(first: 50) {
              nodes {
                ...IssueWithDetails
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

  return res.node;
}

async function updateChildIssues(
  graphqlWithAuth: typeof graphql,
  issue: IssueWithSubIssues,
  {
    projectId,
    goalName,
    subGoalName,
    projectName,
  }: {
    projectId: string;
    goalName?: string;
    subGoalName?: string;
    projectName?: string;
  },
) {
  if (!issue.subIssues.nodes.length) {
    console.log(
      `No child issues found for issue "${issue.title}", skipping...`,
    );
    return { status: 'OK' };
  }

  console.log(
    `Updating child issues for issue "${issue.title}" (${issue.id})...`,
  );

  for (const subIssue of issue.subIssues.nodes) {
    await updateProjectItemForIssue(graphqlWithAuth, subIssue, {
      projectId,
      projectName,
      goalName,
      subGoalName,
    });

    // Recursively call this for child issues
    const subSubIssues = await getSubIssues(graphqlWithAuth, subIssue.id);
    await updateChildIssues(graphqlWithAuth, subSubIssues, {
      projectId,
      projectName,
      goalName,
      subGoalName,
    });
  }

  return { status: 'OK' };
}

function updateProjectItemForIssue(
  graphqlWithAuth: typeof graphql,
  issue: IssueWithDetails,
  {
    projectId,
    goalName,
    subGoalName,
    projectName,
  }: {
    projectId: string;
    goalName?: string;
    subGoalName?: string;
    projectName?: string;
  },
) {
  const projectItem = issue.projectItems.nodes.find(
    (node) => node.project.id === projectId,
  );

  if (!projectItem) {
    console.log(`Issue ${issue.id} is not in specified project, skipping...`);
    // TODO: Should we add the issue to the project?
    return;
  }

  const itemId = projectItem.id;
  console.log(
    `Updating fields on the project: Goal="${goalName || '<none>'}", Sub-Goal="${subGoalName || '<none>'}", Project="${projectName || '<none>'}"`,
  );
  return setFieldsOnProjectItem(graphqlWithAuth, {
    projectId,
    itemId,
    goalName,
    subGoalName,
    projectName,
  });
}
