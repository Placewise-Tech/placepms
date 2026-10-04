import { test, expect, type Page } from '@playwright/test';
import publicConfig from '../supabase.public.json' with { type: 'json' };

const id = '11111111-1111-4111-8111-111111111111';
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'recovery-fixture@example.com', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Recovery Fixture' }, created_at: '2026-01-01T00:00:00Z' };
const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
const session = { access_token: token, refresh_token: 'fixture-recovery-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
const fragment = new URLSearchParams({ access_token: token, refresh_token: session.refresh_token, expires_in: '3600', token_type: 'bearer', type: 'recovery' }).toString();

async function fixture(page: Page, options: { failUpdate?: boolean } = {}) {
  const passwords: string[] = []; const resetRequests: string[] = []; let workspaceRequests = 0;
  await page.route('**/auth/v1/user', async route => {
    if (route.request().method() === 'PUT') {
      passwords.push(route.request().postDataJSON().password);
      if (options.failUpdate) return route.fulfill({ status: 422, json: { code: 'same_password', msg: 'New password should be different from the old password.' } });
    }
    await route.fulfill({ json: user });
  });
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session }));
  await page.route('**/auth/v1/recover**', route => { resetRequests.push(new URL(route.request().url()).searchParams.get('redirect_to') || ''); return route.fulfill({ json: {} }); });
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204 }));
  await page.route('**/rest/v1/**', route => { workspaceRequests++; return route.fulfill({ json: [] }); });
  await page.route('**/api/sessions', route => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/integrations', route => route.fulfill({ json: { connections: [], oauth: { github: false, figma: false, miro: false } } }));
  return { passwords, resetRequests, workspaceRequests: () => workspaceRequests };
}

test('an email callback received before React mounts still opens reset and survives reload', async ({ page }) => {
  const app = await fixture(page);
  // Let the SDK finish its email callback before the UI subscribes. This reproduces
  // the production race caused by relying only on an effect-time recovery event.
  await page.route('**/src/main.tsx', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `await import('/src/lib/supabase.ts'); await new Promise(resolve => setTimeout(resolve, 150));\n${await response.text()}` });
  });
  await page.goto(`/login#${fragment}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(app.workspaceRequests()).toBe(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toBeVisible();
  expect(app.workspaceRequests()).toBe(0);
  await page.getByLabel('New password', { exact: true }).fill('Updated-recovery-password-2026!');
  await page.getByLabel('Confirm password', { exact: true }).fill('Updated-recovery-password-2026!');
  await page.getByRole('button', { name: 'Save password & open workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(app.passwords).toEqual(['Updated-recovery-password-2026!']);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toHaveCount(0);
});

test('expired email callbacks explain the problem and send a new link to the current site', async ({ page }) => {
  const app = await fixture(page);
  await page.goto('/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByRole('heading', { name: 'Password reset link unavailable', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole('alert')).toContainText('expired');
  expect(app.workspaceRequests()).toBe(0);
  await page.getByLabel('Email address').fill(user.email);
  await page.getByRole('button', { name: 'Send a new reset link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('a new reset link has been sent');
  expect(app.resetRequests).toEqual(['http://127.0.0.1:5173/login']);
  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('an invalid recovery token cannot open the reset form for an existing signed-in account', async ({ page }) => {
  const app = await fixture(page);
  const existing = { ...session, user: { ...user, id: '22222222-2222-4222-8222-222222222222', email: 'another-account@example.com' } };
  const storageKey = `sb-${new URL(publicConfig.url).hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); }, { key: storageKey, value: existing });
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 401, json: { code: 'bad_jwt', msg: 'Invalid access token' } }));
  await page.goto(`/login#${fragment}`);
  await expect(page.getByRole('heading', { name: 'Password reset link unavailable', exact: true })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(app.passwords).toEqual([]);
  expect(app.workspaceRequests()).toBe(0);
});

test('query parameters that invalidate the callback cannot reset an existing signed-in account', async ({ page }) => {
  const app = await fixture(page);
  const storageKey = `sb-${new URL(publicConfig.url).hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); }, { key: storageKey, value: session });
  // Supabase gives query parameters precedence over the fragment. An empty
  // access token makes it restore the old session rather than verify this link.
  await page.goto(`/login?access_token=#${fragment}`);
  await expect(page.getByRole('heading', { name: 'Password reset link unavailable', exact: true })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(app.passwords).toEqual([]);
  expect(app.workspaceRequests()).toBe(0);
});

test('an unverified recovery code cannot fall back to an existing signed-in account', async ({ page }) => {
  const app = await fixture(page);
  const storageKey = `sb-${new URL(publicConfig.url).hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); }, { key: storageKey, value: session });
  await page.goto('/login?type=recovery&code=invalid-recovery-code');
  await expect(page.getByRole('heading', { name: 'Password reset link unavailable', exact: true })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(app.workspaceRequests()).toBe(0);
});

test('a rejected password remains on the recovery screen and signing out clears recovery intent', async ({ page }) => {
  await fixture(page, { failUpdate: true });
  await page.goto(`/login#${fragment}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('Rejected-recovery-password!');
  await page.getByLabel('Confirm password', { exact: true }).fill('Rejected-recovery-password!');
  await page.getByRole('button', { name: 'Save password & open workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('different from the old password');
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Institutional Email').fill(user.email);
  await page.getByLabel(/^Password/).fill('existing-password');
  await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toHaveCount(0);
});

test('a reset URL without verified recovery credentials offers a fresh link', async ({ page }) => {
  const app = await fixture(page);
  await page.goto('/login#type=recovery');
  await expect(page.getByRole('heading', { name: 'Password reset link unavailable', exact: true })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  expect(app.workspaceRequests()).toBe(0);
});
