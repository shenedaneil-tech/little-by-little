# Free GitHub Pages + Supabase deployment

The website runs on GitHub Pages. Supabase Free provides Auth, Postgres and the authenticated Edge Function for saving, address search, and driving estimates. No Render service is required. The current free tier includes database and function limits; free Supabase projects can pause after a week of low activity. See https://supabase.com/pricing and https://supabase.com/docs/guides/platform/free-project-pausing.

## Provision on the Free plan

1. Connect Supabase and choose a Free-plan organization/project. Never upgrade or create paid resources for this deployment.
2. Apply `supabase/migrations/202610170001_planner.sql`. It creates per-user planner rows with row-level security and a compare-and-swap save function. Anonymous users cannot read or write planners. Authenticated users can select their own row and call a save function that uses `auth.uid()` internally; they cannot supply another account's ID.
3. Run `node scripts/build-edge.mjs`. Deploy `supabase/functions/planner/index.ts` and its `adapter.mjs` as the `planner` Edge Function, with gateway `verify_jwt=false`. The function itself verifies every access token through Supabase Auth `getUser`, then uses that caller's token for all database access. Never use a service-role key in this function or in the public site.
4. Set the function secret `APP_ORIGIN=https://shenedaneil-tech.github.io`. The function accepts browser requests only from this origin and supports authenticated CORS requests. Standard hosted-project `SUPABASE_URL` and `SUPABASE_ANON_KEY` runtime values are also required.
5. Configure Auth Site URL and allowed redirect URL as `https://shenedaneil-tech.github.io/little-by-little/`. Keep email confirmation enabled. Configure an email provider for public signup/recovery: Supabase's default SMTP only sends to project team members and is suitable for owner testing. Do not disable email confirmation to work around delivery restrictions. Documentation: https://supabase.com/docs/guides/auth/auth-smtp.
6. Put the project URL and **publishable/anon key only** in `pages/config.json`, or GitHub repository variables `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`. These public values identify the project; JWT verification and database policies enforce privacy. Never put a secret/service-role key here. The build rejects service-role JWTs and secret key formats.
7. GitHub repository Settings → Pages → Source must be **GitHub Actions**. The `pages.yml` workflow publishes only `pages-dist`, which contains the frontend. It runs checks first and skips publication while database configuration is absent. Once public configuration is committed or variables set, push or manually run **Publish free planner to GitHub Pages**.
8. Verify signup/email confirmation/sign-in, save a task, reload, sign in on another device, and confirm the same task appears. Confirm a second account sees an empty planner. Test location permissions on mobile.

## Existing tasks

The GitHub repository contains source, not your existing private planner entries. In the original app use **My rhythm → Your little safety net → Download backup**. After signing in on the new site, use **Restore backup** in the same section, review the replacement confirmation, wait for saved status and reload to verify. Keep your backup and original site until transfer is confirmed. Permissions must be granted again on the new domain.

## Development checks

```sh
node scripts/build-edge.mjs
node scripts/build-pages.mjs
node --test tests/pages.test.mjs tests/route-engine.test.mjs
```

Tests use mocked Supabase responses to check token forwarding, account-switch protection, server-side token verification, CORS restrictions, account isolation, state validation and stale-revision conflicts. Actual Supabase database policies, email delivery and the deployed website must also be verified after provisioning.

Existing planner limits remain: store hours are entered manually; OSRM road estimates exclude traffic; Google Calendar uses .ics import/export; nearby replanning and notifications require an open page. Frontend source remains in `planner/`; the Pages build adds an explicit authenticated API transport without changing the original Sites deployment.
