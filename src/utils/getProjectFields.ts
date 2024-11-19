import { graphql } from '@octokit/graphql';

export async function getProjectFields(
  graphqlWithAuth: typeof graphql,
  { projectId }: { projectId: string },
) {
  const res = await graphqlWithAuth<{
    node: {
      id: string;
      title: string;
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
            goalField: field(name: "Goal") {
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
    teams: res.node?.teams,
    goalFieldId: res.node?.goalField.id,
    subGoalFieldId: res.node?.subGoalField.id,
    projectFieldId: res.node?.projectField.id,
  };
}
