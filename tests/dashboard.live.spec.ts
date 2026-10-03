import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Explicit opt-in: creates an isolated test account and removes only its own
// records in finally. Never seed the production dashboard with sample data.
test('real authentication, database writes, refresh, navigation, and mobile layout', async ({ page }) => {
  test.skip(process.env.RUN_LIVE_TESTS !== '1', 'Set RUN_LIVE_TESTS=1 to test against the connected Supabase project.');
  const config = JSON.parse(readFileSync('supabase.public.json', 'utf8'));
  const env = readFileSync('.env', 'utf8');
  const secret = env.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0];
  if (!secret) throw new Error('The live test requires a server-side Supabase secret in .env.');
  const admin = createClient(config.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `workspace-check-${randomUUID()}@example.com`;
  const password = `${randomUUID()}A1!`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Workspace Check', college: 'Localhost Verification' } });
  if (createError || !created.user) throw new Error(createError?.message || 'Could not create the isolated test account.');
  const userId = created.user.id;
  const projectTitle = `Verification ${randomUUID().slice(0, 8)}`;
  const consoleErrors: string[] = [];
  page.on('pageerror', error => consoleErrors.push(error.message));

  try {
    await page.goto('/dashboard/projects');
    await expect(page).toHaveURL(/\/login$/);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /Workspace/ }).first()).toBeVisible();
    await expect(page.getByText('Your next big idea starts here')).toBeVisible();
    await expect(page.getByText('Some workspace data could not be loaded.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create project', exact: true }).first().click();
    await page.getByLabel('Project title').fill(projectTitle);
    await page.getByLabel('Domain', { exact: true }).fill('Verification');
    await page.getByLabel('Project summary').fill('Temporary record created by the localhost integration check.');
    await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: projectTitle, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'My Tasks', exact: true }).click();
    await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
    await page.getByLabel('Milestone name').fill('Verify saved records');
    await page.getByLabel('Phase', { exact: true }).fill('Verification');
    await page.getByLabel('Due date').fill('2026-12-15');
    await page.getByRole('dialog').getByRole('button', { name: 'Add milestone', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Submit Verify saved records' }).click();
    await expect(page.getByRole('button', { name: 'Withdraw submission for Verify saved records' })).toBeVisible();
    // Only the isolated test record is approved, simulating the mentor's action.
    const { data: ownProject } = await admin.from('pms_squads').select('id').eq('leader_email', email).single();
    const { error: approvalError } = await admin.from('milestones').update({ status: 'APPROVED' }).eq('squad_id', ownProject!.id);
    expect(approvalError).toBeNull();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Approved Verify saved records' })).toBeVisible();
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    await expect(page.locator('.dash-stat').filter({ hasText: 'Completed milestones' }).locator(':scope > strong')).toHaveText('1');
    await page.screenshot({ path: '/tmp/omnirush/placepms-dashboard-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
    await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Workspace Verified');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Workspace Verified', exact: true })).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
    await page.screenshot({ path: '/tmp/omnirush/placepms-dashboard-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    expect(consoleErrors).toEqual([]);
  } finally {
    const { data: squads } = await admin.from('pms_squads').select('id').eq('leader_email', email);
    if (squads?.length) {
      const ids = squads.map(squad => squad.id);
      await admin.from('milestones').delete().in('squad_id', ids);
      await admin.from('squad_members').delete().in('squad_id', ids);
      await admin.from('pms_squads').delete().in('id', ids);
    }
    await admin.from('profiles').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  }
});
