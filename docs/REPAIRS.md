# Little by Little repairs — October 22, 2026

Based on `refactor-planner` at `7557ca0` (the newest GitHub branch), retaining the configured Supabase connection, pinned SDK, and database policies from `main`.

| Issue | Result |
| --- | --- |
| Production planner load returned 404 | Edge routing accepts both public URLs and gateway-rewritten URLs for planner, search, and travel APIs. The original failure was present in October 22 function logs. |
| Newer branch removed deployment configuration | Restored the existing public connection values and backend configuration. |
| An appointment already in progress blocked planning | Reserves the remaining appointment time and schedules later tasks. |
| Pinned task before planning hours went unflagged | Displays an out-of-day warning. |
| One fixed-time conflict disabled all manual planning | Manual preview can be applied with visible warnings; automatic updates still preserve the current plan on conflicts. |
| Applying a stale preview could overwrite newer changes | Checks the current tasks, commitments, and date again when applying. |
| GPS denial prevented planning despite a saved Home | Uses the saved starting address and labels that origin explicitly. Future days also use the saved address. |
| Travel blocks and estimates survived changed/deleted tasks | Invalidates route details for the affected day. |
| Deleted tasks could reappear during sync | Newer account revisions remain authoritative; pending local edits are kept in recovery. |
| A rerender hid conflicts or failed saves | Keeps the actionable conflict/retry status visible. |
| Duplicate load requests could race | Allows only one initial/retry load in flight. |
| Focus pause/resume reset elapsed time | Resumes the same task's timer; switching tasks resets it. |
| Lighter-day action moved fixed-time tasks | Keeps pinned tasks on their chosen day. |
| Adding commitments allowed overlaps | Checks existing commitments and pinned tasks before saving. |
| Overnight use kept yesterday as today | Advances the date at midnight when viewing today. |
| Invalid backup could break rendering or all subsequent saves | Checks IDs, duplicate IDs, valid dates, duration, hours, coordinates, and server limits before restore. Explains that restore replaces synced account data. |
| Imported IDs containing quotes broke action buttons | Escapes JavaScript arguments inside HTML attributes. |
| Different store branches shared remembered hours | Keys hours by the full location label. Home selection triggers the normal place-selection handling. |
| Long brain-dump entries blocked sync | Rejects entries over server limits while retaining the original notes. |
| Framework build mistook static Pages scripts for routes | Restricts framework page extensions to TypeScript/TSX. Separates Deno functions from framework TypeScript checking. |

## Verification

- `node scripts/build-edge.mjs`
- `node scripts/embed-planner.mjs`
- `node standalone/build.mjs`
- `node --test tests/*.mjs tests/*.cjs standalone/server.test.mjs` — 28 passing tests.
- `node node_modules/typescript/bin/tsc --noEmit` — passed.
- `REQUIRE_PAGES_CONFIG=1 node scripts/build-pages.mjs` — passed.
- `npm run build` — passed.
- GitHub Pages workflow now runs the dependency-free regression suite before deployment.

Browser interaction was blocked by the execution environment's browser policy. Tests cover routing, scheduling, persistence, account isolation, conflicts, restore validation, and focus behavior with controlled fixtures. An authenticated end-to-end run on the deployed iPhone app remains unverified.

Existing product limits: store hours are entered manually, driving estimates exclude live traffic, calendar integration uses ICS files, and nearby planning/reminders require the page to remain open. These repairs do not add background location tracking or a live Google Calendar connection.
