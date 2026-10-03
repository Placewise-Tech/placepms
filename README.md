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

Apply `supabase/migrations/202610030002_workspace_integrations.sql` before deploying
these features. See [Connected workspace setup](docs/workspace-integrations.md) for
the provider app credentials, exact callback URLs, permissions, and feature limits.
There is no invented project data or fallback provider analysis in the application.

## Structure

- `src/App.tsx`: landing page and authenticated routing.
- `src/components/AuthInterface.tsx`: Supabase sign-in/sign-up.
- `src/components/dashboard/`: workspace layout, views, and data-entry dialogs.
- `src/hooks/`: session and dashboard loading lifecycle.
- `src/lib/`: Supabase client, scoped queries, types, and computed summaries.
- `src/dashboard.css`: scoped responsive workspace styling.
- `vercel.json`: SPA rewrites for direct page loads.

## Verification

`npm test` runs dashboard checks, signup/email failure cases, and the actual SQL
migration against an isolated in-memory PostgreSQL database (PGlite), including
password gating and rate limits. `npm run test:e2e -- tests/signup.spec.ts` checks
signup and required password setup in a browser with mocked external services.
Install Chromium first with `npx playwright install --with-deps chromium`.
After applying the signup migration, verify the real password-change trigger,
database access gate, and browser flow without sending an email:

```sh
RUN_SIGNUP_LIVE_TESTS=1 npm run test:e2e -- tests/signup.live.spec.ts
```

This creates and removes an isolated account and profile using the standard
Supabase environment variables in `.env`.

The opt-in browser test exercises real authentication and database writes with
an isolated account, and deletes that account and its records afterward:

```sh
npx playwright install chromium
RUN_LIVE_TESTS=1 npm run test:e2e
```

The live test requires a server-side `sb_secret_...` key in the local `.env`.
It is not run during Vercel builds. Supabase must permit the signed-in account's
own profile/project/milestone operations through its existing RLS policies.
