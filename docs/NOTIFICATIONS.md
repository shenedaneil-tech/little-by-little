# Task and commitment notifications

The GitHub Pages app supports Web Push. On iPhone/iPad, add the website to the Home Screen from Safari, open that icon, sign in, and use **My rhythm → Notifications → Enable notifications**. Permission is requested only after a tap. The test button sends a real push through the server. A user must authorize delivery on each device.

Reminders use scheduled task times and fixed commitment start times from the last account save. Each device chooses at-time or 5/10/15/30 minutes before. A server job checks every minute, using the device's last reported IANA timezone. Notifications can arrive with the app closed; network connectivity, OS notification settings, and Focus modes affect delivery. Unsaved/offline edits cannot change background reminders until they sync.

## Components

- `pages/manifest.webmanifest`, PNG icons, and `pages/sw.js`: installable app and push receiver. The worker does not intercept/cache page or API requests. Notification clicks open only the app's own scope.
- `planner/src/06a-push.js`: device setup, permission, unsubscribe, lead time, and test controls. Logging out unsubscribes the browser before ending the session.
- `pages/transport.js`: sends the current verified-session token to the separate `notifications` function.
- `supabase/functions/notifications`: verifies user JWTs through Auth, handles subscriptions and tests, and dispatches background reminders. Only known Apple, Google, and Mozilla push hosts are accepted; redirects are disabled. Payloads use standard Web Push encryption and VAPID through pinned `web-push@3.6.7`.
- `supabase/migrations/20261022161802_push_notifications.sql`: per-account subscription RLS, server-only delivery leases, secret-access ACLs, and a minute scheduler. Completed tasks are excluded. Leases avoid concurrent duplicates; successful deliveries are deduplicated by device, item, and scheduled instant. Failed sends may retry inside a five-minute freshness window. Expired subscriptions are removed. Provider-level delivery after a timeout can still produce an occasional duplicate.

## Deployment

Apply the schema to the target project and deploy the `notifications` Edge Function with `verify_jwt=false`: the handler verifies user tokens itself and separately authenticates the scheduler. Built-in Supabase server environment keys stay server-side. The existing `planner` function is unchanged.

Provision one JSON credential object in Supabase Vault under the name `lbl_push_config` with `publicKey`, `privateKey`, and a cryptographically random `cronSecret`. Generate a P-256 VAPID keypair once. Never commit the private key or scheduler secret. The browser receives only the public VAPID key. The minute job resolves its secret from Vault at execution time and makes no function call when there are no enabled devices. Use the same keys across deployments so existing subscriptions remain valid.

The configured project has the schema, credentials, active notification function, and active `lbl-push-reminders` schedule. New migrations must preserve these credentials and ACLs.

## Verification

Automated tests cover iPhone installation guidance, denied permission, subscription registration, timing changes, test requests, logout unsubscribe, worker display/click behavior, origin and identity checks, own-account writes, scheduler authentication, and push host/key validation. The existing planner suite also passes (35 tests total). TypeScript and framework/Pages builds pass.

Database verification used transaction-rolled-back fixtures to check due task/event selection, completed-task exclusion, retry leases, sent deduplication, timezone conversion, malformed dates, cross-account isolation, and secret/scheduler access restrictions. No test device or test planner changes were retained. A live authenticated scheduler invocation returned HTTP 200 with zero pending sends.

Actual iPhone permission and end-to-end delivery require the user to enable the Home Screen app and tap **Send test notification**; this cannot be verified without that device consent. Browser QA is unavailable under this environment's browser policy.
