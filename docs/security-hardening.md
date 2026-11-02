# PlacePMS security baseline

The application now applies these controls in code and at the database boundary:

- Browser auth sessions are stored in `sessionStorage` only. Access and refresh tokens are never persisted to `localStorage`.
- API mutations require a same-origin `Origin` when the browser supplies one and use bounded per-IP rate limits.
- API responses include anti-clickjacking, MIME-sniffing, referrer, permissions, and Content Security Policy headers. Production builds explicitly disable source maps.
- Supabase queries use the typed query builder/RPC interface. Server authorization and Supabase RLS remain authoritative for project, account, library, integration, and automation access.
- Server-side automation resolves target hosts and rejects loopback, private, link-local, metadata, multicast, and reserved addresses before fetching. Redirects are not followed.
- OAuth state is encrypted, short-lived, single-use, and account/session bound. Provider credentials are encrypted server-side and are never returned to the browser.
- Passwords are delegated to Supabase Auth's password hashing. New personal passwords require at least 12 characters, and temporary credentials are rate-limited and must be replaced.
- Users can enroll a TOTP authenticator from **Login & Sessions**. The QR/setup secret exists only in component memory during enrollment.
- No file-upload endpoint or webhook receiver is exposed by this application. Evidence and submission attachments are validated HTTPS links; if either surface is added, require an allowlisted content type, size limit, generated storage key, malware scanning, and signed webhook verification before accepting it.

## Deployment requirements

1. Keep `.env` out of Git and use server-only names for Supabase secret/service-role, SMTP, OAuth, encryption, AI, and cron credentials. Only the Supabase URL and publishable key may use `VITE_`.
2. Rotate any credential that has ever appeared in a local file, terminal output, ticket, screenshot, or commit. This includes the local `.env` values found during the security audit.
3. Set a unique `PLACEPMS_ADMIN_EMAIL`; the bootstrap command now requires an explicit `--email` and no longer contains a default administrator identity.
4. Set a long random `CRON_SECRET` and keep `APP_URL` on the deployed HTTPS origin.
5. Apply every SQL migration in order. RLS is enabled by the migrations and the restrictive policies must remain enabled in production.
