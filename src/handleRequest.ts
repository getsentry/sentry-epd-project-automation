import type { Request, Response } from 'express';
import { Webhooks } from '@octokit/webhooks';
import { createAppAuth } from '@octokit/auth-app';
import { syncGithubProjectOfIssueBasedOnParentIssues } from './syncGithubProjectOfIssueBasedOnParentIssues.js';
import { syncGithubProjectOfChildIssues } from './syncGithubProjectOfChildIssues.js';

interface GithubWebhookRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  has_projects: boolean;
  owner: {
    login: string;
    id: number;
  };
}

interface GithubWebhookIssue {
  id: number;
  node_id: string;
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string;
}

async function authenticateApp({
  appId,
  privateKey,
  installationId,
}: {
  appId: string | number;
  privateKey: string;
  installationId: string | number;
}) {
  const auth = createAppAuth({
    appId,
    privateKey,
  });

  const data = await auth({ type: 'installation', installationId });
  return data.token;
}

export async function handleRequest(req: Request, res: Response) {
  const webhookSecret = process.env.GH_WEBHOOK_SECRET;
  const projectId = process.env.GH_PROJECT_ID;
  const ghAppId = process.env.GH_APP_ID;
  const ghAppInstallationId = process.env.GH_APP_INSTALLATION_ID;
  const ghAppPrivateKey = process.env.GH_APP_PRIVATE_KEY;

  if (
    !projectId ||
    !ghAppId ||
    !ghAppInstallationId ||
    !ghAppPrivateKey ||
    !webhookSecret
  ) {
    res
      .status(500)
      .send(
        'GH_PROJECT_ID, GH_WEBHOOK_SECRET, GH_APP_ID, GH_APP_INSTALLATION_ID, or GH_APP_PRIVATE_KEY  not set',
      );
    return;
  }

  const githubToken = await authenticateApp({
    appId: ghAppId,
    privateKey: ghAppPrivateKey,
    installationId: ghAppInstallationId,
  });

  const eventType = req.headers['x-github-event'];
  const signature = req.headers['x-hub-signature-256'] as string;
  const body = req.body;

  if (!webhookSecret) {
    res.status(500).send('GH_WEBHOOK_SECRET not set');
    return;
  }

  const webhooks = new Webhooks({
    secret: webhookSecret,
  });

  webhooks.verify(JSON.stringify(body), signature).then((isValid) => {
    if (!isValid) {
      res.status(401).send('Unauthorized');
      return;
    }
  });

  // This event occurs when there is activity relating to sub-issues.
  if (eventType === 'sub_issues') {
    const payload = req.body as {
      action:
        | 'parent_issue_added'
        | 'parent_issue_removed'
        | 'sub_issue_added'
        | 'sub_issue_removed';

      parent_issue_id: number;
      parent_issue: GithubWebhookIssue;
      sub_issue: GithubWebhookIssue;
      sub_issue_id: number;
      parent_issue_repo?: GithubWebhookRepository;
      sub_issue_repo?: GithubWebhookRepository;
      repository?: GithubWebhookRepository;
    };

    console.log(`sub_issues event with action "${payload.action}" received`);

    const issueId = payload.sub_issue.node_id;

    if (!issueId) {
      res.status(400).send('sub_issue_id not found');
      return;
    }

    console.log(`Syncing Github project for issue ${issueId}`);

    syncGithubProjectOfIssueBasedOnParentIssues(githubToken, {
      issueId,
      projectId,
    })
      .then(({ status }) => {
        console.log(status);
        res.send({ success: true, status });
      })
      .catch((error) => {
        console.error(error);
        res.status(400).send({ success: false, error: `${error}` });
      });
    return;
  }

  // This event occurs when an issue is updated
  if (eventType === 'issues') {
    const payload = req.body as {
      action: 'edited' | 'opened' | string;
      issue: GithubWebhookIssue;
      repository: GithubWebhookRepository;
    };

    console.log(`issues event with action "${payload.action}" received`);

    if (payload.action !== 'edited') {
      res.send(
        `nothing to do (issues action is ${JSON.stringify(payload.action)})`,
      );
      return;
    }

    const issueId = payload.issue.node_id;

    if (!issueId) {
      res.status(400).send('issue_id not found');
      return;
    }

    console.log(`Syncing Github project for issue ${issueId}`);
    syncGithubProjectOfChildIssues(githubToken, {
      issueId,
      projectId,
    })
      .then(({ status }) => {
        console.log(status);
        res.send({ success: true, status });
      })
      .catch((error) => {
        console.error(error);
        res.status(400).send({ success: false, error: `${error}` });
      });
    return;
  }

  res.send('nothing to do');
}
