import { graphql } from '@octokit/graphql';
import { getProjectFields } from './getProjectFields.js';

/**
 * Update fields on the provided project item.
 * Only fields that are provided will be updated.
 */
export async function setFieldsOnProjectItem(
  graphqlWithAuth: typeof graphql,
  {
    projectId,
    itemId,
    goalName,
    subGoalName,
    projectName,
    teamName,
  }: {
    projectId: string;
    itemId: string;
    goalName?: string;
    subGoalName?: string;
    projectName?: string;
    teamName?: string;
  },
) {
  const { teams, goalFieldId, subGoalFieldId, projectFieldId } =
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

  if (teamName && teams) {
    const fieldId = teams.id;
    const optionId = teams.options.find(
      (option) => option.name === teamName,
    )?.id;

    if (fieldId && optionId) {
      await setOptionFieldOnProjectItem(graphqlWithAuth, {
        projectId,
        itemId,
        fieldId,
        optionId,
      });
    } else {
      console.log(
        `Team with name ${teamName} not found in project, skipping...`,
      );
    }
  }
}

export async function setOptionFieldOnProjectItem(
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

export async function setTextFieldOnProjectItem(
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
