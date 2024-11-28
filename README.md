# sentry-project-automation

This is a simple node app that can be used to process Github Webhooks for project automation.

## Running this with GitHub Webhooks

1. Deploy this as a Google Cloud Run Function
2. Create a Webhook in a GitHub repository pointing to the GC Function URL `https://my-web-hook.com/webhook`. Make sure to send the `sub_issues` and `issues` events there.
3. Make sure to provide a secret to the Webhook - this is required for this to work!

## Configuring the Google Cloud Run Function

Make sure to configure the Cloud Run Function like this:

1. Entry point: `githubEpdProjectAutomation`
2. Node.js 22

You need to provide some env. vars for the server:

- `GH_WEBHOOK_SECRET`: The same secret that was used when setting up the webhook. Must be the same for any webhook sending data to this server!
- `GH_PROJECT_ID`: The GitHub Project (node) ID of the Board. This is `PVT_kwDOABVQ184AoBEL` for the EPD Projects board.
  - We make certain assumptions about the project. Mainly, that it has `Goal` and `Team` fields that are select fields.
- `GH_APP_ID`: The ID of a Github App used for authentication.
- `GH_APP_INSTALLATION_ID`: The installation ID of the App used for authentication.
- `GH_APP_RRIVATE_KEY`: The private key of the App used for authentication.