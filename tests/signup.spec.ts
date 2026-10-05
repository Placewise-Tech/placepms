import { test, expect, type Page } from '@playwright/test';

const email = 'new-student@example.com';
const userId = '11111111-1111-4111-8111-111111111111';

function user(required: boolean) {
  return { id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email', providers: ['email'], must_change_password: required }, user_metadata: { full_name: 'New Student' }, created_at: '2026-10-03T00:00:00Z' };
}

function session(required: boolean) {
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
  return { access_token: token, refresh_token: 'test-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: user(required) };
}

async function mockAuth(page: Page, options: { failUpdate?: boolean } = {}) {
  let required = true;
  let dashboardRequests = 0;
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session(required) }));
  await page.route('**/auth/v1/user', async route => {
    if (route.request().method() === 'PUT') {
      if (options.failUpdate) return route.fulfill({ status: 422, json: { code: 'same_password', msg: 'New password should be different from the old password.' } });
      expect(route.request().postDataJSON().password).toBe('My-personal-password-2026!');
      required = false;
    }
    await route.fulfill({ json: user(required) });
  });
  await page.route('**/rest/v1/**', route => { dashboardRequests++; return route.fulfill({ json: [] }); });
  await page.route('**/api/sessions', route => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/integrations', route => route.fulfill({ json: { connections: [], oauth: { github: false, figma: false, miro: false } } }));
  return { requests: () => dashboardRequests };
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Institutional Email').fill(email);
  await page.getByLabel(/^Password/).fill('123456');
  await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set your own password' })).toBeVisible();
  await expect(page).toHaveURL(/\/set-password$/);
}

test('signup sends details without a password and prompts the user to sign in using email credentials', async ({ page }) => {
  let payload: Record<string, unknown> = {};
  await page.route('**/api/signup', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { message: 'Check your email.' } });
  });
  await page.goto('/signup');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel('Full Name').fill('New Student');
  await page.getByLabel('Institutional Email').fill(email);
  await page.getByLabel('College / University Name').fill('Example University');
  await page.getByRole('button', { name: 'Create PlacePMS Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(payload).toEqual({ email, fullName: 'New Student', organization: 'Example University', role: 'student', agreeTerms: true });
  await page.getByRole('button', { name: 'Back to Sign In' }).click();
  await expect(page.getByLabel('Institutional Email')).toHaveValue(email);
  await expect(page.getByLabel(/^Password/)).toHaveValue('');
});

test('email delivery failure stays on signup with a retryable error', async ({ page }) => {
  await page.route('**/api/signup', route => route.fulfill({ status: 502, json: { error: 'We could not send your login email. Please try again.' } }));
  await page.goto('/signup');
  await page.getByLabel('Full Name').fill('New Student');
  await page.getByLabel('Institutional Email').fill(email);
  await page.getByLabel('College / University Name').fill('Example University');
  await page.getByRole('button', { name: 'Create PlacePMS Account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not send');
  await expect(page.getByRole('button', { name: 'Create PlacePMS Account', exact: true })).toBeEnabled();
});

test('temporary login is gated across reloads and direct URLs until a new password is saved', async ({ page }) => {
  const auth = await mockAuth(page);
  await signIn(page);
  expect(auth.requests()).toBe(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set your own password' })).toBeVisible();
  await page.goto('/dashboard/projects');
  await expect(page).toHaveURL(/\/set-password$/);
  expect(auth.requests()).toBe(0);
  await page.getByLabel('New password', { exact: true }).fill('My-personal-password-2026!');
  await page.getByLabel('Confirm password').fill('Passwords-do-not-match!');
  await page.getByRole('button', { name: 'Save password & open workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  expect(auth.requests()).toBe(0);
  await page.getByLabel('Confirm password').fill('My-personal-password-2026!');
  await page.getByRole('button', { name: 'Save password & open workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set your own password' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
});

test('a rejected password keeps the workspace locked', async ({ page }) => {
  const auth = await mockAuth(page, { failUpdate: true });
  await signIn(page);
  await page.getByLabel('New password', { exact: true }).fill('Rejected-personal-password!');
  await page.getByLabel('Confirm password').fill('Rejected-personal-password!');
  await page.getByRole('button', { name: 'Save password & open workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('different from the old password');
  await expect(page).toHaveURL(/\/set-password$/);
  expect(auth.requests()).toBe(0);
});
