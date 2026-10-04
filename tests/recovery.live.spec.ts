import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

// Generates a real recovery link without emailing anyone. Only the isolated
// verification account is changed and removed in finally.
test('real recovery verification opens reset, survives reload, and changes the account password', async ({ page }) => {
  test.skip(process.env.RUN_RECOVERY_LIVE_TESTS !== '1', 'Set RUN_RECOVERY_LIVE_TESTS=1 to verify real Supabase recovery.');
  const env = loadEnv('development', process.cwd(), '');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !secret || !publicKey || !env.APP_URL) throw new Error('Configure Supabase and APP_URL in .env for the live recovery check.');
  const testOrigin = process.env.RECOVERY_TEST_ORIGIN ? new URL(process.env.RECOVERY_TEST_ORIGIN).origin : '';
  if (testOrigin && testOrigin !== new URL(env.APP_URL).origin) throw new Error('The deployed recovery check must use the configured APP_URL origin.');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, secret, options); const client = createClient(url, publicKey, options);
  const email = `password-recovery-check-${randomUUID()}@example.com`;
  const oldPassword = `${randomUUID()}Aa1!`; const newPassword = `${randomUUID()}Bb2!`;
  const created = await admin.auth.admin.createUser({ email, password: oldPassword, email_confirm: true, user_metadata: { full_name: 'Password Recovery Check' } });
  if (created.error || !created.data.user) throw new Error('Could not create the isolated recovery account.');
  const id = created.data.user.id;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const redirectTo = new URL('/login', env.APP_URL).href;
    const generated = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
    expect(generated.error).toBeNull();
    // This also checks that the production URL allowlist no longer falls back to localhost.
    expect(generated.data.properties?.redirect_to).toBe(redirectTo);
    const verified = await fetch(generated.data.properties!.action_link, { redirect: 'manual' });
    expect([302, 303]).toContain(verified.status);
    const callback = new URL(verified.headers.get('location')!);
    expect(callback.origin).toBe(new URL(env.APP_URL).origin);
    expect(callback.pathname).toBe('/login');
    expect(new URLSearchParams(callback.hash.slice(1)).get('type')).toBe('recovery');
    // Test locally by default, or explicitly on the configured deployment.
    // Do not print the provider-issued callback credentials.
    await page.goto(`${testOrigin}/login${callback.hash}`);
    await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByText(`Choose a new password for your PlacePMS account (${email}).`, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Choose a new password', exact: true })).toBeVisible();
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Save password & open workspace' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    expect((await client.auth.signInWithPassword({ email, password: oldPassword })).error?.code).toBe('invalid_credentials');
    expect((await client.auth.signInWithPassword({ email, password: newPassword })).error).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await client.auth.signOut({ scope: 'local' });
    const profileCleanup = await admin.from('profiles').delete().eq('id', id);
    const accountCleanup = await admin.auth.admin.deleteUser(id);
    expect(profileCleanup.error).toBeNull();
    expect(accountCleanup.error).toBeNull();
  }
});
