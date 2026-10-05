# Administration, teachers, staff, and mentoring

## Activate management

1. Apply `supabase/migrations/202610050001_workspace_management.sql` in the project's
   Supabase SQL Editor, after the two existing migrations. It is transactional and
   re-applicable. Existing students, projects, and provider connections are retained.
2. With the existing server and SMTP settings in local `.env`, initialize the first
   administrator selected for this installation:

   ```bash
   npm run bootstrap:admin -- --email placewiseinfo@gmail.com --name "Placewise Administrator" --institution "Placewise"
   ```

   An existing account is promoted without changing its password. A new account is
   emailed a six-digit first-login code and must choose a personal password. No
   password, login code, or server credential is printed by the command. Once an
   administrator exists, additional administrators are managed from the admin UI.
3. Deploy the application with the existing `SUPABASE_SECRET_KEY` (or service-role
   key), Supabase public configuration, `APP_URL`, and Brevo SMTP configuration.

## One direct login

All accounts use `/login` with email and password. `/admin/login`, `/teacher/login`,
and `/staff/login` also open the same simple login. Server-assigned accounts are
automatically routed to `/admin`, `/teacher`, or `/staff`; ordinary accounts open
`/dashboard`. Recovery and first-password setup retain the assigned destination.
Public signup role labels and editable profile/user metadata never grant management
privileges. Authoritative roles are stored in the server-managed account table.

## Administrator capabilities

- View exact account, project, milestone, mentor, provider connection, and saved
  repository analysis counts.
- Create teacher, staff, student, and additional administrator accounts; email their
  first-login credentials; promote existing registered accounts; manage departments,
  mentoring eligibility, and enabled/disabled access.
- Send password recovery emails and revoke another account's sessions. An admin
  cannot disable or demote themselves. Role and enabled-state changes revoke existing
  sessions; disabled accounts cannot access workspace data with an older JWT.
- View and manage every project, assign eligible teachers/staff as mentors, maintain
  teams, archive/restore projects, plan milestones, and review student submissions.
- Manage saved research, resource, and document records, project evidence, and
  Blackbook workflows. Personal provider tokens remain encrypted and inaccessible.
- Turn public registration and individual connected-tool/library features on or off.
  Database policies and API handlers enforce controls, including direct requests.
  Administrators retain the ability to inspect and re-enable modules.
- List connection metadata and disconnect another account's provider connection.
  Management activity records account, settings, session, and connection operations.

## Teachers and staff

Both roles can be enabled as mentors by an administrator. They see assigned projects,
teams, delivery documents, deadlines, and review queues. Assigned enabled mentors can
approve submitted milestones or request revisions with feedback and an optional score.
Teachers/staff cannot manage accounts, change feature controls, assign themselves to
projects, or access another mentor's projects just by changing a URL.

## GitHub evidence and AI flags

GitHub inspections are saved from server-fetched provider responses. Inspect a
repository from a project's **Connected tools** section to associate its snapshot
with that project. Admins can read all saved inspections; teachers/staff can read their
own and assigned-project snapshots. Unlinked personal inspections are visible to their
owner and administrators. Repository tokens are never shared with report readers.

History pages merge into the same owner/repository/branch/window snapshot and
deduplicate commits. Provider change-statistic batches update the saved snapshot.
Reports disclose loaded coverage and expose the same evidence-based AI commit flags,
filters, metadata, graphs, and exports as live analysis. Undeclared AI use is not
inferred; absence of a marker does not establish human authorship. Saved snapshots
are read-only; live requests use the viewer's own provider authorization.
