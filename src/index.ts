import express from 'express';
import { syncGithubProjectForIssue } from './utils/sync-gh-project.js';
import { Webhooks } from '@octokit/webhooks';
import bodyParser from 'body-parser';

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

const port = parseInt(process.env.PORT || '8080', 10);
const app = express();

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send(`This is a webhook server for syncing Github issues with Github projects. 
Point the webhook to the /webhook endpoint.`);
});

app.post('/webhook', (req, res) => {
  const webhookSecret = process.env.GH_WEBHOOK_SECRET;
  const githubToken = process.env.GH_TOKEN;
  const projectId = process.env.GH_PROJECT_ID;

  if (!projectId || !githubToken || !webhookSecret) {
    res
      .status(500)
      .send('GH_PROJECT_ID, GH_TOKEN, or GH_WEBHOOK_SECRET not set');
    return;
  }

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

    syncGithubProjectForIssue(githubToken, {
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
  }
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
