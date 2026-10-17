# Little by Little 🌱

A personal daily planner that helps you choose the next task and connect errands into a practical route.

Live site: https://little-by-little-planner.shenedawatson1.chatgpt.site

## Features

- Tasks with priorities, duration estimates, fixed times, deadlines, and notes.
- Opening hours in one tap: choose Any time, Set hours (with quick presets), or Closed today. Hours are remembered per place and suggested the next time you pick it.
- A daily timeline with appointments, opening-hour constraints, and driving blocks.
- Store-name and address search with OpenStreetMap / Photon.
- Automatic drive estimates from your current location.
- Stops planned from the previous stop, without an automatic return home.
- Optional nearby replanning while the page is visible; fixed appointments stay protected.
- Private, account-scoped D1 storage with optimistic revision checks and a recovery copy.
- Brain dump, focus controls, easy rescheduling, and Undo.
- Responsive mobile layout, purple botanical theme, and optional animations.
- Calendar .ics import/export, JSON backup/restore, and open-page reminders.

## Current limits

Driving estimates use OSRM and exclude live traffic. OpenStreetMap does not list every business. Business hours are not looked up; enter them for the visit day (remembered hours are only a suggestion, since stores change their hours). Google Calendar live synchronization, closed-page notifications, and background location tracking are not implemented.

Tasks and locations are stored separately in the hosted database or browser; this repository contains source code, not personal planner entries.

## Stack and source layout

- Vinext / Vite, React, TypeScript, Cloudflare Workers, D1, and Drizzle.
- `planner/index.html` — interface and responsive styles.
- `planner/src/` — interface behavior, split into numbered sections (core, planning, nearby, rendering, tasks, reminders/backup, account sync, places, motion). They are joined in file-name order into the single script the page loads.
- `scripts/planner-source.cjs` — the helper that joins those sections (used by the build and the tests).
- `lib/day-plan.mjs` — pure scheduling and route-order logic.
- `app/api/` — authenticated persistence, address search, and routing endpoints.
- `db/` and `drizzle/` — database schema and migration history.
- `scripts/embed-planner.mjs` — generates the server-served assets from planner source.
- `tests/` — persistence, route, location, motion, and nearby-planning checks.

Edit `planner/index.html` and the files under `planner/src/`, then run `node scripts/embed-planner.mjs`. Do not manually edit the generated `app/planner-assets.ts`.

## Local setup

Use Node.js 24 and pnpm. Node 22.13+ is supported by the starter, but tests use Node's built-in SQLite module.

```sh
pnpm install --frozen-lockfile
node scripts/embed-planner.mjs
pnpm build
```

Apply the initial migration to a fresh local database only:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_certain_cannonball.sql
```

Then start development:

```sh
pnpm dev
```

Use the local URL printed by the server. Clean clones use the portable execution profile. The starter provides a local sign-in simulator in development; production relies on Sites-managed authentication. Local and production D1 data are separate.

## Checks

```sh
pnpm check:planner
node tests/planner.test.cjs
node tests/route-engine.test.mjs
node tests/location.test.cjs
node tests/nearby.test.cjs
node tests/motion.test.cjs
node tests/hours.test.cjs
```

## Deployment

This is the source for an existing private ChatGPT Site. `.openai/hosting.json` preserves its project identity and D1 binding. The Sites workflow builds the Worker, applies pending migrations, and deploys a saved source version. A GitHub upload by itself does not deploy or sync future changes to the live site.

The GitHub copy does not include dependency folders, build output, local databases, credentials, or runtime caches. Keep those excluded when making future commits. No new license is assigned by this export; retained dependency and starter license notices remain in their respective files.
