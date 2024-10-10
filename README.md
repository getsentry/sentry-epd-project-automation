# sentry-project-automation

This is a simple node app that can be used to process Github Webhooks for project automation.

## Running this with GitHub Webhooks

1. Run this server somewhere, e.g. on https://my-web-hook.com
2. Create a Webhook in a GitHub repository pointing to `https://my-web-hook.com/webhook`. Make sure to send the `sub_issues` and `issues` events there.
3. Make sure to provide a secret to the Webhook - this is required for this to work!

## Configuring the Server

You need to provide some env. vars for the server:

- `GH_WEBHOOK_SECRET`: The same secret that was used when setting up the webhook. Must be the same for any webhook sending data to this server!
- `GH_PROJECT_ID`: The GitHub Project (node) ID of the Board. This is `PVT_kwDOABVQ184AoBEL` for the EPD Projects board.
  - We make certain assumptions about the project. Mainly, that it has `Goal` and `Team` fields that are select fields.
- `GH_TOKEN`: A classic GitHub token that has access to the organization (make sure to setup SSO for the token!), issues and projects.

## Running this locally

You can get this to run locally and send Webhook events to your local server via https://smee.io/:

1. Create a new proxy on https://smee.io/
2. Provide this URL as Webhook URL (See above)
3. Install dependencies locally with `yarn`
4. Start your server locally
   a. You'll need to set the required env. vars in `.env`
   b. Run `yarn dev` to start the dev server on http://localhost:8080
5. Run `yarn smee --url https://smee.io/YOUR_SMEE_URL --path /webhook --port 8080` in another terminal window to proxy events
