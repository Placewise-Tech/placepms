# Connected workspace setup

## One PlacePMS app, separate authorization for every user

The website owner registers **one OAuth application per provider**. Its client ID
and client secret identify PlacePMS on GitHub/Figma/Miro's consent screen. These
are website configuration, not a user's personal access token or password.

Each user signs in to PlacePMS, clicks **Connect GitHub/Figma/Miro**, signs in on
the provider's own website, and grants their own permissions. PlacePMS stores the
resulting token under that user's ID. Other PlacePMS users cannot use it. The
authorization option is the default; public-URL and PAT options remain optional.
GitHub repositories and Miro boards are loaded automatically after connecting.
Figma requires a file URL or team/project ID because its API has no global list
of every file available to a user.

Users do **not** create OAuth apps, configure client secrets, or share their
provider passwords with PlacePMS. The one-time app registration is still required
by each provider before its consent flow can be used.

## Database

Apply `supabase/migrations/202610030002_workspace_integrations.sql` in the same
Supabase project's SQL Editor, after the temporary-password migration. It is
transactional and can be reapplied. The existing project tables use text IDs;
the new private library uses UUID IDs.

The migration adds:
- A server-only encrypted token vault and single-use OAuth state records.
- Real Supabase session listing, activity updates, and device/other-device sign-out.
- Session-aware database access: a revoked JWT cannot continue reading workspace data.
- Private, project-linked research, resources, and document notes.
- Project access for leads, team members, and assigned mentors; only leads manage
  project settings/team membership, and only assigned mentors change review decisions.
- Shared integration request limits and a token-refresh lease.

Apply the migration **before deploying** the new API handlers. Migration errors
are shown in the interface rather than fabricated connected states.

## Server configuration

The existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, public Supabase key, and
`APP_URL` settings are reused. Set `APP_URL=https://www.placepms.in` in production.
Provider credentials belong in local `.env` and Vercel environment settings.

Tokens are encrypted with AES-256-GCM, with the user ID and provider as authenticated
context, and stored in `integration_connections`. Browser database roles have no
access to that table. Tokens are never included in connection/status responses,
reports, local storage, or URLs. Disconnect removes the token and pending OAuth
states from PlacePMS. Provider-side revocation can also be done in that provider's
app/token settings.

Optionally set `INTEGRATION_ENCRYPTION_KEY` to a base64-encoded random 32-byte key.
Otherwise an independent encryption key is derived from the Supabase server key
using HKDF. Use the same key across instances sharing the database. Changing the
encryption key (or rotating the server key when using the fallback) requires users
to reconnect their integrations.

## GitHub: three connection options

1. **Public repository**: enter `owner/repository` or an HTTPS GitHub repository
   URL. No GitHub credential is used. GitHub's lower anonymous API quota applies.
2. **GitHub authorization**: create a GitHub OAuth App and configure
   `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Authorize through the dashboard.
   The OAuth app requests `read:user repo`; GitHub's classic `repo` scope is broad,
   while PlacePMS makes read-only provider requests.
3. **Personal access token**: paste a fine-grained or classic PAT in the dashboard.
   Prefer selected repositories with read-only **Metadata**, **Contents**,
   **Issues**, and **Pull requests**. Private organization repositories may need
   organization approval and SSO authorization. Token scope cannot grant access
   to a repository that the account itself cannot access.

GitHub OAuth callback:
`https://www.placepms.in/api/integrations?action=callback&provider=github`

Repository inspection includes accessible repository browsing, selected-branch
commit history, day/author activity, languages, stars/forks, open issues/PRs,
contributors, file/directory browsing, commit-level additions/deletions, and
per-file diffs. Export the report as JSON. Analysis explicitly labels its sample:
up to 100 commits per page, up to 100 branches, 30 PRs/contributors, and 50 issues.
Use the next-page control for further commit analysis. File previews are limited
to 1 MB; commit previews show up to 100 files and 50,000 characters per patch.
Binary content, submodules, and larger files should be opened on GitHub.

## Figma

Connect a Figma PAT or create/publish an OAuth app and configure
`FIGMA_CLIENT_ID` and `FIGMA_CLIENT_SECRET`.

OAuth callback:
`https://www.placepms.in/api/integrations?action=callback&provider=figma`

Scopes: `current_user:read`, `file_content:read`, `file_comments:read`,
`file_versions:read`, `projects:read`. Optional views report permission errors
individually when their scopes are absent. A public file URL alone is not an API
credential: Figma API inspections require an authorized account/token.

Inspect a file/design URL or key for pages, top-level frames/layers, component
counts, comments, and version history. Browse team projects by entering a numeric
team ID, then select a project to list files, or enter a project ID directly.
Figma does not provide a general list of every file in a user's account. Provider
plan/rate limits and OAuth app publication rules apply. A draft Figma app is only
usable by its permitted testers; publish it for the intended audience.

## Miro

Connect a Miro developer-app access token with `boards:read`, or configure
`MIRO_CLIENT_ID` and `MIRO_CLIENT_SECRET` for OAuth. Enable `boards:read` in the
Miro app's permissions.

OAuth callback:
`https://www.placepms.in/api/integrations?action=callback&provider=miro`

Browse boards available to the installed app/team and inspect a board URL/ID for
its metadata and paginated items (up to 50 per page). Board access follows the
authorizing user's permissions and selected Miro team. Figma/Miro expiring OAuth
tokens are refreshed server-side. Tokens without a usable refresh token require
reconnection after expiry.

For local OAuth tests, register the equivalent callback URL with your localhost
origin and use that origin in `APP_URL`. Use the same browser to start and finish
authorization; state is bound to an HttpOnly cookie, user, active session, and
10-minute expiry. It is consumed atomically on callback.

## Workspace features

- **Projects:** searchable cards link to detail workspaces; leads edit metadata,
  tool URLs, phase, and mentor assignment, archive/restore, and manage team members.
  Team members' details, roles, and skills can be edited. Project cards support
  current/archive filters and sorting; project workspaces link to scoped libraries
  and tasks, and export milestone evidence as CSV.
- **Milestones:** create/edit dates and descriptions, attach up to 20 document URLs,
  submit/withdraw, and receive mentor approval, revision requests, scores and feedback.
  Submitted and approved milestones cannot be edited through the normal editor.
- **Calendar:** month navigation, per-day deadlines, overdue/completed indicators,
  Today, agenda view, project/status filters, date deep links, and selected-date
  ICS export.
- **Research:** private saved references and notes, tags/project filtering, Scholar
  and arXiv discovery links, editable/exportable records.
- **Academic resources:** saved resources and developer documentation shortcuts.
- **Documents:** private notes/link records plus milestone submission links. This
  release links externally hosted files rather than uploading file binaries.
- **Blackbook:** team-authored academic sections combined with actual project,
  milestone, member and reference records; editable Markdown, printable HTML,
  browser Print/Save PDF, and saving reports to Documents (20,000-character limit).
  Project-specific drafts save authored sections and editable Markdown in a private
  document tagged `blackbook-draft`. Save a draft before leaving to restore it on
  reload or another device; larger drafts can be downloaded as JSON.
  It does not invent research, test outcomes, or AI-generated claims.
- **Login & Sessions:** live devices with current-device marker, IP, agent,
  sign-in/activity times, single-device and other-device sign-out. Active tabs check
  their session each minute and on focus; database/API revocation is immediate.
- **Portfolio/overview:** use real project/profile records and actual saved integration
  metadata; changes refresh the workspace and preserve the existing themes/mobile UI.
  Overview adds priorities, readiness, and project health; portfolio exports actual
  profile and project evidence as printable HTML.
- **Task planning:** list/status-board views, project/status filtering, due-date and
  update sorting, and filtered CSV export. Concurrent changes check the prior saved
  milestone status. Mentor queues link directly to each submission's evidence.
- **Library discovery:** title/notes/URL search, exact-tag and project filters,
  sorting, refresh, and current-page JSON export.

## Verification

`npm test` covers encryption/owner binding, URL validation, provider response
normalization, bounded analysis, rate limits, OAuth state rejection, report escaping,
and actual PostgreSQL RLS/session/review rules using PGlite.

`npm run test:e2e -- tests/home.spec.ts tests/workspace.spec.ts tests/signup.spec.ts` tests browser
workflows with provider/API fixtures. No external account tokens are needed.

Live OAuth consent and private resource access require real provider apps and a
user's authorization; fixtures do not certify provider approval or account scope.
