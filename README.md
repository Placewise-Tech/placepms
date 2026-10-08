# PlacePMS

React + TypeScript + Vite frontend for the PlacePMS academic workspace.

## Development

```sh
npm install
npm run dev
npm run build
npm run lint
npm test
```

The dashboard is available at `/dashboard` after signing in with a Supabase account.
Accounts and sessions use Supabase Auth. Signup emails are sent server-side through
Brevo SMTP. Enable the deployed domain and localhost in Supabase Auth's URL
configuration for password-reset redirects.

### Password-reset URLs

In **Supabase → Authentication → URL Configuration**, set **Site URL** to
`https://www.placepms.in` and add `https://www.placepms.in/login` and
`https://placepms.in/login` to **Redirect URLs**. Local testing also uses
`http://127.0.0.1:5173/login` and `http://localhost:5173/login`. Supabase falls back
to Site URL when a requested redirect is not allowed, so production Site URL must
not point to localhost. The recovery email template's reset button should use
`{{ .ConfirmationURL }}` so Supabase verifies the link before returning to the app.

Forgot password returns to the whitelisted `/login` callback. After Supabase
verifies it, the app routes to `/reset-password` and preserves the reset screen
across reloads until the password is saved or the user signs out. Recovery intent
is captured before React mounts and is bound to the authenticated account. Invalid
or expired callbacks show a fresh-link request form instead of the dashboard.
`/reset-password` does not need to be added as an email redirect URL.

## Temporary-password signup (Brevo)

1. Run `supabase/migrations/202610030001_temporary_password_signup.sql` in your
   Supabase SQL Editor (or apply it with your usual Supabase migration workflow).
   This adds shared signup rate limits, the password-change trigger, and restrictive
   policies on the workspace tables. Existing ownership policies still apply.
2. Add the server-only settings from `.env.example` to `.env` for local development
   and to the Vercel project's environment settings for deployment:
   - `SUPABASE_URL`: the same Supabase project as the frontend.
   - `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`): an admin/server key.
   - `BREVO_SMTP_USER`: Brevo's SMTP login.
   - `BREVO_SMTP_PASSWORD`: the **SMTP key** from Brevo's SMTP & API settings,
     not the Brevo website password or transactional API key.
   - `BREVO_FROM_EMAIL`: a sender verified in Brevo.
   - `BREVO_FROM_NAME`: the sender display name (defaults to `PlacePMS`).
   - `BREVO_SMTP_PORT`: defaults to `587` with STARTTLS; `465` and `2525` are supported.
   - `APP_URL`: your public HTTPS website URL, or `http://localhost:5173` locally.
3. In Supabase Auth, disable **Allow new users to sign up** so accounts are created
   only by the server's admin signup endpoint. Admin `createUser` still works.
   Supabase must accept **six-digit numeric passwords** for the temporary login
   code (minimum length **6**, without mandatory letters/symbols). The account's
   password-setup form requires a personal password of at least **12 characters**.
4. Configure Supabase Auth's **Custom SMTP** with the same Brevo SMTP credentials
   and verified sender to send **Forgot password** emails through Brevo too.
   Those emails are sent by Supabase, separately from the signup endpoint.
5. Restart `npm run dev` or redeploy Vercel after updating settings.

The flow is **Create account → email with login email + random six-digit code →
Sign in → Set your own password → Dashboard**. Signup no longer asks for a password
and does not automatically sign the user in. The server creates a confirmed Auth
account, but the random credential is delivered only to its email address. The
code is used in the normal **Password** field for the initial sign-in.

Public **Create account** always registers a student and has no role selector.
Other roles are created by an administrator under **Administration → Create role
accounts** (`/admin/create-account`). This section provisions teacher, staff, and
administrator accounts, with institution/department details and optional mentor
eligibility. The owner receives the same emailed first-login code and chooses a
personal password before entering their role-specific workspace. **Accounts &
permissions** manages existing roles and access. The public signup endpoint rejects
non-student roles even when submitted directly.

`app_metadata.must_change_password` is server-owned. The password form and database
policies block workspace access until Supabase updates the password; a database
trigger clears the flag in the same update. Reloading or opening a dashboard URL
cannot skip setup. Password recovery also completes setup. The temporary login
code stops working when the personal password is set. Existing accounts are not
forced through setup.

`/api/signup` is a Vercel Node function; Vite serves the same handler during
`npm run dev`. `npm run preview` serves only the static build; use Vercel for a full
production preview. SMTP/admin credentials never enter the frontend bundle. Signup
responses never include a password or session. Rate limits allow up to 10 requests
per IP and 3 per email per hour across server instances. Duplicate signup requests
do not modify existing accounts. Failed SMTP submissions roll back only the newly
created account so the user can retry; delivery after SMTP acceptance is tracked in
Brevo's transactional logs.

## Supabase configuration

`supabase.public.json` contains only the public project URL and publishable key,
so Git-based Vercel deployments can connect without access to `.env`.
To use a different project, override `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` or Vercel's environment settings.
See `.env.example`. The original labelled key format in `.env` is also supported.
Private server keys are never included in the browser configuration; `.env` is
ignored by Git. Database row-level-security policies control record access.

The dashboard reads the existing `profiles`, `pms_squads`, `squad_members`, and
`milestones` tables and the server-side integration metadata. Counts come
from the signed-in user's accessible projects and milestones. Users can create
projects, create/submit milestones for review, and update their profile. Approved
milestones count as completed; project approval keeps a project active. Records refresh
on focus, every minute while visible, after changes, and through Refresh.

## Connected workspace

GitHub has public URL, OAuth, and PAT access options with repository browsing,
commit/branch/language analysis, file inspection, and diffs. Figma and Miro offer
OAuth/API-token connections and resource inspection. Login & Sessions uses live
Supabase sessions with device revocation. Projects now support editing, team and
mentor management, milestone attachments/reviews, and a monthly calendar.
Research, resources, and documents have private saved libraries; the Blackbook
builder produces editable reports from actual project records.

Apply `supabase/migrations/202610090001_workspace_calendar_events.sql` after the
workspace migrations to enable private timetable events and personal reminders.
Project milestones remain available without this optional migration. Research
discovery uses the public OpenAlex catalog and saved results remain in the private
Research library.

GitHub repository intelligence adds activity graphs, a contribution heatmap,
contributor breakdowns, exact author/committer UTC timelines, language composition,
and per-commit code-change graphs. Filter by contributor, date, message or commit
type, load additional history into the same report, inspect parents/files/diffs,
and export loaded JSON or filtered commit CSV. Choose **All history** for older
commits and **Analyze changes for loaded commits** for additions/deletions and
frequently changed files. Reports show loaded-history and measured-change coverage.

Apply `supabase/migrations/202610030002_workspace_integrations.sql` before deploying
these features. See [Connected workspace setup](docs/workspace-integrations.md) for
the provider app credentials, exact callback URLs, permissions, and feature limits.
There is no invented project data or fallback provider analysis in the application.

### Administrator monitoring

Apply `supabase/migrations/202610050001_workspace_management.sql` before using
administrator login, managed roles, public registration controls, or the admin
workspace. Apply `supabase/migrations/202610030001_temporary_password_signup.sql`
first when using the emailed temporary-login flow. Then apply the monitoring
migrations below in order:

Apply `supabase/migrations/202610060001_admin_monitoring.sql` after the workspace
management migration to enable the administrator control center. Apply
`supabase/migrations/202610060002_designated_admin_bootstrap.sql` afterward to enable
automatic first-owner promotion for `placewiseinfo@gmail.com`. Administrators get a
separate `/admin` workspace with live account presence, minute-level route heartbeats,
workspace-wide delivery analytics, activity history, per-user project and milestone
drill-downs, provider connection metadata, and saved integration-analysis payloads.
Provider credentials are never included in monitoring responses. The live monitor
refreshes while the page is open and activity history is retained in
`workspace_activity` for administrator review.

## Advanced dashboard

- **Overview:** delivery priorities, overdue/revision/review counts, project health,
  profile completeness, and a workspace setup checklist, all from saved records.
- **Projects:** current/archive filtering, search by name/domain/phase/mentor,
  name/date/progress sorting, editable team roles and skills, contextual research
  and document links, and milestone CSV evidence export.
- **Tasks:** project and status filters (including overdue, due today, in review,
  revisions, completed, and undated), due/name/update sorting, list or status-board
  views, and CSV export of the filtered results. Submissions can also be managed
  directly inside a project. Updates check the saved status to avoid stale writes.
- **Mentorship:** submitted-delivery queue, review metrics, revision requests,
  scores, feedback, and links directly to milestone evidence.
- **Calendar:** month/agenda views, Today, date deep links, project/completion
  filtering, private timetable and personal events, event deletion, and export of
  the selected deadlines and events as ICS.
- **Libraries:** title/notes/URL search, project and exact-tag filters, sorting,
  refresh, individual Markdown exports, and current-page JSON export. Saved
  libraries remain private; project and milestone records are shared with the team.
- **Blackbook:** project-specific drafts saved to the private Documents library.
  Use **Save draft** before leaving to preserve authored sections and generated
  Markdown across reloads/devices. A draft uses the existing 20,000-character
  saved-note limit; larger drafts can be downloaded as JSON. Export the report as
  Markdown or printable HTML, print/save PDF, or save it to Documents.
- **Portfolio:** profile-readiness guidance and an HTML export containing your
  profile, current project details, approved deliveries, and linked tools.
- **Navigation/account:** Ctrl/⌘ K or `/` for page/project/milestone search, `N` to
  create a project, keyboard-contained search dialogs, persistent sidebar/theme
  preferences, live integration status, and auto-refreshed session details.

The public homepage includes a guided product tour, optional auto-playing project
journey, active-section navigation, a reading-progress indicator, searchable FAQs,
role-specific entry points, and four unique team portraits with role descriptions.
Its workflow studio demonstrates project-health calculations, Blackbook generation,
and calendar exports using explicitly labelled sample records and the same utilities
as the workspace. Visitors can download the generated JSON, Markdown, and ICS files.
Automatic demos pause offscreen, in background tabs, during account dialogs, and
when page motion is paused; reduced-motion visitors can run workflows instantly.
Motion preferences persist locally. The workflow studio is code-split, and the page
uses dedicated responsive styles in `src/home.css` and `src/home-next.css`.

### Idea → Workspace

The homepage's **Build your idea** section turns a project idea, start date, timeline
(1–24 weeks), and team size (1–8 people) into an editable plan. It includes objectives,
five scheduled phases, deliverable milestones, suggested responsibilities, and a
six-chapter Blackbook outline. Web, mobile, data/AI, hardware/IoT, and research plans
have domain-aware starter templates, so the feature works without an AI API key.

For AI-assisted generation, set server-only `IDEA_PLANNER_API_KEY` in local `.env`
and the deployment environment. `OPENAI_API_KEY` is also accepted. Optional
`IDEA_PLANNER_MODEL` (default `gpt-4.1-mini`) and `IDEA_PLANNER_BASE_URL` (default
`https://api.openai.com/v1/`) support a compatible chat-completions provider.
No provider key reaches the browser. AI responses are validated and use the selected
schedule; provider errors fall back to an explicitly labelled starter plan. AI calls
use namespaced, database-backed request limits from the existing signup migration.

Valid edits are stored locally in this browser under `placepms:idea-plan:v1` and can
be downloaded as Markdown. **Create a workspace with this plan** keeps the draft
through signup, emailed-code login, and mandatory password setup on the same device.
The signed-in dashboard offers **Create project from my plan**, which creates an
owned project and pending milestones and saves the plan and Blackbook outline when
those document features are enabled. Suggested responsibilities are planning notes;
real teammates and mentor assignments are managed through the existing workspace.

`project.from-plan` uses the authenticated user's database client and existing row
policies. Stable record IDs let interrupted creation resume without creating duplicate
projects, milestones, or documents, and preserve records already edited in the
workspace. No additional database migration is required beyond the existing workspace
migrations. A draft being imported is bound locally to that account.

Verification: `npx tsx --test tests/idea-plan.test.mjs tests/idea-plan-handler.test.mjs
tests/idea-workspace.test.mjs` covers schedules, persistence, provider fallback,
authorization, and retry-safe imports. `npm run test:e2e -- tests/idea-planner.spec.ts`
checks editing, downloads, mobile layouts, and the signup-to-project handoff.

## Structure

- `src/App.tsx`: authenticated routing and lazy-loaded account/workspace screens.
- `src/components/HomePage.tsx`, `src/home.css`: public homepage and product content.
- `src/components/AuthInterface.tsx`: Supabase sign-in/sign-up.
- `src/components/dashboard/`: workspace layout, views, and data-entry dialogs.
- `src/hooks/`: session and dashboard loading lifecycle.
- `src/lib/`: Supabase client, scoped queries, types, and computed summaries.
- `src/dashboard.css`: scoped responsive workspace styling.
- `vercel.json`: SPA rewrites for direct page loads.

## Verification

`npm test` runs dashboard checks, signup/email failure cases, and the actual SQL
migration against an isolated in-memory PostgreSQL database (PGlite), including
password gating and rate limits.
`npm run test:e2e -- tests/home.spec.ts tests/workspace.spec.ts tests/signup.spec.ts`
checks the homepage, advanced dashboard, and required password setup in a browser
with isolated API/provider fixtures.
Install Chromium first with `npx playwright install --with-deps chromium`.
After applying the signup migration, verify the real password-change trigger,
database access gate, and browser flow without sending an email:

```sh
RUN_SIGNUP_LIVE_TESTS=1 npm run test:e2e -- tests/signup.live.spec.ts
```

This creates and removes an isolated account and profile using the standard
Supabase environment variables in `.env`.

`npm run test:e2e -- tests/recovery.spec.ts` verifies early SDK callbacks, reloads,
expired/invalid links, password-update errors, and returning to normal sign-in.
Verify the actual recovery link and password change without sending an email:

```sh
RUN_RECOVERY_LIVE_TESTS=1 npm run test:e2e -- tests/recovery.live.spec.ts
```

This checks the configured `APP_URL` redirect with Supabase, exercises its returned
recovery session on localhost, and removes the isolated account afterward.
Set `RECOVERY_TEST_ORIGIN=https://www.placepms.in` alongside the live-test flag to
verify the same flow on the deployed site. The origin must match `APP_URL`.

The opt-in browser test exercises real authentication and database writes with
an isolated account, and deletes that account and its records afterward:

```sh
npx playwright install chromium
RUN_LIVE_TESTS=1 npm run test:e2e
```

The live test requires a server-side `sb_secret_...` key in the local `.env`.
It is not run during Vercel builds. Supabase must permit the signed-in account's
own profile/project/milestone operations through its existing RLS policies.
