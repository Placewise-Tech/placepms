# PlacePMS continuation handoff

Last updated: 2026-10-13
Repository: `/mnt/d/placepms`
Branch: `main`

## What we are doing

We are evolving PlacePMS into a real-data academic project operating system. The current implementation slice adds:

1. A **Today** cockpit derived only from visible Supabase projects and milestones.
2. A persisted **Notifications** inbox for milestone submissions, mentor decisions, and project mentions.
3. A project-level **Evidence & discussion** timeline for real links, documents, demos, repository records, notes, and comments.
4. Strict Supabase RLS and database triggers for project access, milestone references, notification ownership, mention scope, and mentor evidence verification.
5. Basic **mobile/PWA readiness** through a web manifest, mobile metadata, service-worker registration, and network-first/offline shell fallback.

No fake, seeded, invented, or fallback project records are being added.

## Files changed in this session

- `supabase/migrations/202610140001_workspace_signals.sql`
  - Adds `workspace_evidence`, `workspace_comments`, and `workspace_notifications`.
  - Adds indexes, RLS, service-role-only notification cleanup, evidence verification guard, mention validation, milestone notification triggers, comment mention triggers, milestone unlink cleanup, and evidence summary RPC.
- `server/workspace.ts`
  - Adds notification list/read actions.
  - Adds evidence list/create/delete/verify actions.
  - Adds comment list/create actions.
- `src/components/dashboard/WorkspaceSignals.tsx`
  - Adds Today view, notification inbox/bell, and project evidence timeline UI.
- `tests/workspace-signals-db.test.mjs`
  - Covers signal RLS, milestone matching, mentor verification, notification ownership, and notification triggers.
- `tests/workspace.spec.ts`
  - Mocks signal endpoints and covers Today, inbox, evidence, comments, and mentor verification flows.
- `README.md`
  - Documents the workspace signals migration and its setup order.
- `src/components/dashboard/Dashboard.tsx`
  - Adds Today and Notifications navigation entries.
- `src/components/dashboard/DashboardViews.tsx`
  - Routes `today` and `notifications` to the new views.
- `src/components/dashboard/ProjectDetails.tsx`
  - Adds the Evidence & discussion tab.
- `src/workspace.css`
  - Styles Today, inbox, evidence timeline, comment form, and mobile layouts.
- `index.html`
  - Adds mobile app metadata and manifest reference.
- `public/manifest.webmanifest`
  - Adds installable PWA metadata.
- `public/sw.js`
  - Adds a small network-first shell cache with offline fallback.
- `src/main.tsx`
  - Registers the service worker in production.

## Validation completed in the continuation session

- `npm test` passed: **112/112**.
- `npm run build` passed.
- `npm run check:api` passed.
- `npm run lint` passed without warnings.
- `git diff --check` passed.
- `npx playwright test tests/workspace.spec.ts` could not start its browser because the environment is missing `libnspr4.so`; this is an environment dependency failure before test execution.

The successful build emitted the existing large-chunk warning for the application bundle. This is a warning, not a build failure.

## Important current follow-ups

1. Validate the migration against a reachable Supabase project. The configured Supabase hostname was previously unavailable from this environment (`ENOTFOUND`), so live migration application has not been confirmed.
2. Install the missing Playwright browser dependency (`libnspr4.so`) in the test environment and rerun the fixture-based workspace suite.
3. Keep the notification schema stable: notifications currently store `project_id` and `milestone_id`, not arbitrary `href`/`data` JSON. The UI derives safe project links from those IDs.

## Resume commands

From `/mnt/d/placepms`:

```sh
npm test
npm run build
npm run check:api
npm run lint
git diff --check
git status --short
git diff --stat
```

To inspect the active work:

```sh
git diff -- supabase/migrations/202610140001_workspace_signals.sql server/workspace.ts
git diff -- src/components/dashboard/WorkspaceSignals.tsx src/components/dashboard/ProjectDetails.tsx
```

## Product constraints to preserve

- Use real Supabase/provider records only.
- Empty, unavailable, or partially loaded data must stay visibly distinct.
- Preserve existing auth, role access, RLS, integrations, monitoring, capacity, and load-test behavior.
- Do not add demo data or seed rows to the new migration.
- Keep dark mode unchanged while maintaining the current Ember Orbit light theme.
- Do not expose or reuse credentials embedded in the configured Git remote.
- Do not apply or claim production migration success until a reachable Supabase project confirms it.

## Recommended next session order

1. Validate the migration on a reachable Supabase project.
2. Install the missing Playwright system dependency and rerun the workspace browser suite.
3. Add portfolio evidence/readiness summary using the evidence summary RPC or a scoped API response.
4. Review the complete diff and run the full validation set again.
5. Only push after confirming the migration and deployment environment are configured.

## Automation continuation log — 2026-10-13

The cloud automation slice was continued in this same handoff file so the next
session has one source of truth for the website changes:

- Added `src/components/dashboard/AutomationView.tsx`, connected to the existing
  `/api/automation` actions for scheduling, reports, and follow-up work.
- Added manager scheduling for milestone audits and public HTTP checks, with
  explicit tester/developer assignment and status updates.
- Added a cloud/offline explanation and an **Export one work log** action that
  creates `placepms-automation-work-log.md` from the persisted task, report, and
  follow-up records.
- Added local Vite middleware for `/api/automation` and an admin navigation entry.
- Fixed the automation migration's one-time task completion invariant by making
  `next_run_at` nullable. Developer/tester status changes now preserve the
  manager's assignment fields, and report/project mismatches are rejected.
- Added the server-only `CRON_SECRET` example and documented the migration and
  Vercel setup in `README.md`.

### Important boundary

The website now persists and executes deterministic cloud checks while a laptop
is offline. It does **not** run an autonomous AI coding agent, arbitrary code,
or a model-token budget. Therefore a 10M-token warning cannot be calculated from
the current implementation. Adding that part requires a selected AI provider,
server-side usage accounting, a hard stop, and a separately hosted worker; do
not infer usage from browser state. The requested provider is **OmniRush**, but
the current OmniRush CLI session (`omnirush/gpt-6-astra`) is not a public
server-side API endpoint that this website can call after the laptop shuts down.
Do not fake an OmniRush API URL or put CLI credentials in the browser. A future
remote worker must expose an authenticated job endpoint and report actual usage
before the 10M warning can be implemented.

### Checks for this continuation

- `tsc -b` completed before the Vite step.
- `npm run check:api` completed before the Vite step.
- `npm run build` completed `tsc -b` and `npm run check:api`, then failed in
  Vite because the environment intermittently returned filesystem `EIO` errors
  and an invalid/unreadable local Vite package entry; the bundle result is not
  claimed as passed.
- `npm test` ran 51 tests: 36 passed and 15 stopped on the same environment
  `EIO`/unreadable `node_modules` and source-file failures; this is not a
  feature regression result and should be rerun after repairing the workspace
  filesystem/dependencies.
