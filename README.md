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
Sign-up, confirmation emails, password reset, session restoration, and sign-out use
Supabase Auth. Enable the deployed domain and localhost in Supabase Auth's URL
configuration for confirmation and password-reset redirects.

## Supabase configuration

`supabase.public.json` contains only the public project URL and publishable key,
so Git-based Vercel deployments can connect without access to `.env`.
To use a different project, override `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` or Vercel's environment settings.
See `.env.example`. The original labelled key format in `.env` is also supported.
Private server keys are never included in the browser configuration; `.env` is
ignored by Git. Database row-level-security policies control record access.

The dashboard reads the existing `profiles`, `pms_squads`, `squad_members`,
`milestones`, `connected_integrations`, and `user_sessions` tables. Counts come
from the signed-in user's accessible projects and milestones. Users can create
projects, create/submit milestones for review, and update their profile. Approved
milestones count as completed; project approval keeps a project active. Records refresh
on focus, every minute while visible, after changes, and through Refresh.

Documents come from milestone submission links; repository, Figma, and Miro hubs
come from project URLs. Research, academic resources, and blackbook generation
show a not-connected state because this database has no corresponding service.
There is no sample data or fallback data in the application.

## Structure

- `src/App.tsx`: landing page and authenticated routing.
- `src/components/AuthInterface.tsx`: Supabase sign-in/sign-up.
- `src/components/dashboard/`: workspace layout, views, and data-entry dialogs.
- `src/hooks/`: session and dashboard loading lifecycle.
- `src/lib/`: Supabase client, scoped queries, types, and computed summaries.
- `src/dashboard.css`: scoped responsive workspace styling.
- `vercel.json`: SPA rewrites for direct page loads.

## Verification

`npm test` runs summary, deadline, document-link, and calendar-export checks.
The opt-in browser test exercises real authentication and database writes with
an isolated account, and deletes that account and its records afterward:

```sh
npx playwright install chromium
RUN_LIVE_TESTS=1 npm run test:e2e
```

The live test requires a server-side `sb_secret_...` key in the local `.env`.
It is not run during Vercel builds. Supabase must permit the signed-in account's
own profile/project/milestone operations through its existing RLS policies.
