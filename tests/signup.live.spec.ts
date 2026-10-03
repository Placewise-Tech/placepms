import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { temporaryPassword } from '../server/signup';

// Explicit opt-in. Uses real Auth/RLS with an isolated account, sends no email,
// and removes only the account and profile created by this test.
test('real temporary login requires a password change and invalidates the temporary credential', async ({ page }) => {
  test.skip(process.env.RUN_SIGNUP_LIVE_TESTS !== '1', 'Set RUN_SIGNUP_LIVE_TESTS=1 to verify the installed signup migration.');
  const env = loadEnv('development', process.cwd(), '');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !secret || !publicKey) throw new Error('Set the Supabase URL, public key, and server key in .env.');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, secret, options);
  const client = createClient(url, publicKey, options);
  const email = `password-setup-check-${randomUUID()}@example.com`;
  const initialPassword = temporaryPassword();
  const newPassword = `${randomUUID()}Aa1!`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password: initialPassword, email_confirm: true,
    user_metadata: { full_name: 'Password Setup Check', college: 'Localhost Verification', role: 'student' },
    app_metadata: { must_change_password: true },
  });
  if (createError || !created.user) throw new Error(createError?.message || 'Could not create the isolated test account.');
  const userId = created.user.id;

  try {
    const { error: profileError } = await admin.from('profiles').upsert({ id: userId, email, full_name: 'Password Setup Check' });
    expect(profileError).toBeNull();
    const initialLogin = await client.auth.signInWithPassword({ email, password: initialPassword });
    expect(initialLogin.error).toBeNull();
    expect(initialLogin.data.user?.app_metadata.must_change_password).toBe(true);
    const blockedProfile = await client.from('profiles').select('id').eq('id', userId);
    expect(blockedProfile.error).toBeNull();
    expect(blockedProfile.data).toEqual([]);
    const blockedGate = await client.rpc('has_completed_password_setup');
    expect(blockedGate.error).toBeNull();
    expect(blockedGate.data).toBe(false);

    // User-editable metadata cannot bypass the server-owned password gate.
    const metadataUpdate = await client.auth.updateUser({ data: { must_change_password: false } });
    expect(metadataUpdate.error).toBeNull();
    expect((await client.rpc('has_completed_password_setup')).data).toBe(false);
    await client.auth.signOut({ scope: 'local' });

    let workspaceRequests = 0;
    page.on('request', request => { if (request.url().includes('/rest/v1/')) workspaceRequests++; });
    await page.goto('/login');
    await page.getByLabel('Institutional Email').fill(email);
    await page.getByLabel(/^Password/).fill(initialPassword);
    await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
    await expect(page).toHaveURL(/\/set-password$/);
    await expect(page.getByRole('heading', { name: 'Set your own password' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Set your own password' })).toBeVisible();
    await page.goto('/dashboard/projects');
    await expect(page).toHaveURL(/\/set-password$/);
    expect(workspaceRequests).toBe(0);

    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm password').fill(newPassword);
    await page.getByRole('button', { name: 'Save password & open workspace' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /Workspace/ }).first()).toBeVisible();
    const updated = await admin.auth.admin.getUserById(userId);
    expect(updated.error).toBeNull();
    expect(updated.data.user?.app_metadata.must_change_password).toBe(false);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    const oldLogin = await client.auth.signInWithPassword({ email, password: initialPassword });
    expect(oldLogin.error?.code).toBe('invalid_credentials');
    const newLogin = await client.auth.signInWithPassword({ email, password: newPassword });
    expect(newLogin.error).toBeNull();
    const openGate = await client.rpc('has_completed_password_setup');
    expect(openGate.error).toBeNull();
    expect(openGate.data).toBe(true);
    const accessibleProfile = await client.from('profiles').select('id').eq('id', userId);
    expect(accessibleProfile.error).toBeNull();
    expect(accessibleProfile.data).toEqual([{ id: userId }]);
  } finally {
    await client.auth.signOut({ scope: 'local' });
    const profileCleanup = await admin.from('profiles').delete().eq('id', userId);
    const accountCleanup = await admin.auth.admin.deleteUser(userId);
    expect(profileCleanup.error, 'Remove the isolated verification profile').toBeNull();
    expect(accountCleanup.error, 'Remove the isolated verification account').toBeNull();
  }
});
