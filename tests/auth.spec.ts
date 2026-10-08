import { test, expect } from '@playwright/test';

test('nebula-theme account screens preserve details between modes and trap keyboard focus', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login');
  const dialog = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.auth-studio')).toHaveCSS('background-color', 'rgb(8, 20, 37)');
  await dialog.getByLabel('Institutional Email').fill('design-check@example.test');
  await dialog.getByLabel('Password', { exact: true }).fill('unsent-demo-password');
  await dialog.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Hide password', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create Account', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByLabel('Institutional Email')).toHaveValue('design-check@example.test');
  await expect(page.getByRole('heading', { name: 'Create Your Student Account', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Create account', exact: true }).getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Student|Faculty|College \/ TPO|Recruiter)$/ })).toHaveCount(0);
  await expect(page.getByText('Teacher, staff, and administrator access is created by your administrator.')).toBeVisible();
  await page.getByLabel('Full Name').fill('Design Check');
  await page.getByLabel('College / University Name').fill('Example University');
  await page.screenshot({ path: '/tmp/omnirush/placepms-signup-desktop.png', animations: 'disabled' });
  await page.getByRole('dialog', { name: 'Create account', exact: true }).getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Institutional Email')).toHaveValue('design-check@example.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  for (let index = 0; index < 12; index++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.auth-studio')))).toBe(true); }
  for (let index = 0; index < 12; index++) { await page.keyboard.press('Shift+Tab'); expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.auth-studio')))).toBe(true); }
  await page.screenshot({ path: '/tmp/omnirush/placepms-signin-desktop.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test('sign-in and signup fit mobile widths and respect reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/login', '/signup']) {
    await page.goto(route);
    await expect(page.locator('.auth-studio')).toBeVisible();
    expect(await page.locator('.auth-studio').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    expect(await page.locator('.auth-universe > i').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await page.screenshot({ path: `/tmp/omnirush/placepms-${route === '/login' ? 'signin' : 'signup'}-mobile.png`, animations: 'disabled' });
  }
});

test('admin setup failures explain that the workspace migration is required', async ({ page }) => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const email = 'admin-migration@example.test';
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: { must_change_password: false }, user_metadata: { full_name: 'Admin Migration Check' }, created_at: '2026-10-08T00:00:00Z' };
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user } }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/api/management', route => route.fulfill({ status: 503, json: { error: 'Apply the workspace management migration in Supabase to enable administration.' } }));
  await page.goto('/admin/login');
  await page.getByLabel('Institutional Email').fill(email);
  await page.getByLabel(/^Password/).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t open this workspace', exact: true })).toBeVisible();
  await expect(page.getByText('202610050001_workspace_management.sql', { exact: false })).toBeVisible();
});

test('admin login uses the same-site fallback when the browser cannot reach Supabase Auth', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const id = '11111111-1111-4111-8111-111111111111';
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'fallback-admin@example.test', app_metadata: { workspace_role: 'admin' }, user_metadata: { full_name: 'Fallback Admin' }, created_at: '2026-10-08T00:00:00Z' };
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
  let fallbacks = 0;
  await page.route('**/auth/v1/token**', route => route.abort('namenotresolved'));
  await page.route('**/auth/v1/user', route => route.abort('namenotresolved'));
  await page.route('**/api/auth**', route => {
    const url = new URL(route.request().url()); fallbacks++;
    if (url.searchParams.get('path') === '/user') return route.fulfill({ json: user });
    expect(url.searchParams.get('path')).toBe('/token');
    expect(url.searchParams.get('grant_type')).toBe('password');
    expect(route.request().postDataJSON()).toMatchObject({ email: user.email, password: 'fixture-password' });
    return route.fulfill({ json: { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user } });
  });
  await page.route('**/api/management', route => route.fulfill({ status: 503, json: { error: 'Test access check reached the server successfully.' } }));
  await page.goto('/admin/login');
  await page.getByLabel('Institutional Email').fill(user.email);
  await page.getByLabel(/^Password/).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We couldn’t open this workspace', exact: true })).toBeVisible();
  await expect(page.getByText('Test access check reached the server successfully.', { exact: true })).toBeVisible();
  expect(fallbacks).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
