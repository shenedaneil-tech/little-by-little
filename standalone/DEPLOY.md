# Independent hosting from GitHub

This deployment runs the full planner on Node 24 with a persistent SQLite database. It does not use ChatGPT hosting, ChatGPT sign-in, D1, or Sites identity headers. The original deployment files remain available for the existing site.

## Deploy on Render

1. Connect your Render account and the `shenedaneil-tech/little-by-little` repository. Create a Blueprint using the repository's `render.yaml`.
2. Review the paid `starter` web service and 1 GB persistent disk before confirming creation. Render's free services do not support the persistent disk this app requires. Keep one instance; SQLite lives at `/data/planner.sqlite`. Do not remove the disk or move `DB_PATH` outside it.
3. Create a GitHub **OAuth App** at https://github.com/settings/developers. Set its homepage to your Render app's HTTPS URL and its authorization callback to `https://YOUR-RENDER-HOST/auth/callback`. If you change the hostname, update the OAuth App too.
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Render's environment settings. Never commit the client secret. The Blueprint prompts for these values. If your final hostname isn't available yet, finish configuring its exact OAuth callback before trying sign-in.
5. Deploy. Render builds `standalone/Dockerfile` directly; no pnpm install is needed. `RENDER_EXTERNAL_HOSTNAME` supplies the app's canonical origin. For a custom domain, set `APP_ORIGIN=https://your-domain.example` and update the GitHub OAuth callback.
6. Visit `/healthz` and the home page, sign in, save a test task, restart the service, then confirm the task returns. Test location permission on your phone over HTTPS.

GitHub is used only for sign-in with a public profile, not repository access. Each account's numeric GitHub ID owns a separate planner. OAuth uses one-use state, PKCE, and HttpOnly session cookies. Provider access tokens are not saved. Sessions last 30 days and sign-out revokes the current session.

## Bring your existing tasks

Your current tasks are in the original site's private database; they are not in the GitHub repository. They cannot be fetched by this new deployment automatically.

1. Open the original planner while signed in to your original account.
2. Under **Find your rhythm → Your little safety net**, select **Download backup**.
3. Sign in on the new website with GitHub. In the same settings section select **Restore backup** and choose the JSON file. Review the confirmation: restoring replaces the planner currently loaded in that account.
4. Wait for the saved status, reload, and check tasks, commitments, times, locations, and your starting address. Keep the backup and the original site until verified.

Browser location and notification permissions must be granted again for the new domain. Existing ChatGPT accounts and sessions cannot be transferred to GitHub sign-in. Backup files contain personal tasks and locations; keep them private.

## Run and verify locally

From the repository root, with Node 24:

```sh
node standalone/build.mjs
node --test standalone/server.test.mjs tests/route-engine.test.mjs
node standalone/start.mjs
```

Local defaults are `http://localhost:3000` and `standalone/data/planner.sqlite`. To exercise real local sign-in, configure a separate GitHub OAuth App with callback `http://localhost:3000/auth/callback` and supply `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` as environment variables. Production requires HTTPS. Never expose the local HTTP setup on the internet.

The build compiles the existing TypeScript API handlers using Node's type stripping. The SQLite adapter preserves the original input validation, per-account queries, and optimistic revision conflicts. It serves the same planner HTML, JavaScript, animations, storage wrapper, and route engine as the original app. The deployment test exercises OAuth with mocked GitHub responses, login-state replay rejection, identity-header spoof rejection, account isolation, CSRF checks, save conflicts, session revocation, and persistence across server restarts.

## Existing feature limits

The move does not add live traffic, automatic store opening-hour lookup, Google Calendar account sync, or closed-page reminders. Address search uses Photon; road durations use OSRM. Enter business hours manually. Location changes and reminders require the page to be open. These features have the same limits as the original app.

## Recovery

Use the planner's JSON download regularly. The database and session tables live on the persistent disk. Render documents disk snapshots and restore operations at https://render.com/docs/disks. Never deploy this service with ephemeral storage for real planner data. To roll back application code, redeploy a previous GitHub commit while retaining the disk. This migration introduces new standalone files and does not change the original site's database schema or delete its data.
