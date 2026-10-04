import { test, expect } from '@playwright/test';

test('homepage previews, feature content, FAQs, and account links work on desktop and mobile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Plan, build, and present your academic work/ })).toBeVisible();
  await expect(page.locator('.home-feature')).toHaveCount(8);
  await page.locator('.home-preview').getByRole('button', { name: 'Milestones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A clear path from plan to approval' })).toBeVisible();
  await page.locator('.home-preview').getByRole('button', { name: 'Connected tools', exact: true }).click();
  await expect(page.getByText('GitHub repositories', { exact: true })).toBeVisible();
  await page.getByText('How do I get started?', { exact: true }).click();
  await expect(page.getByText(/Your initial six-digit login code is emailed to you/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: '/tmp/omnirush/placepms-home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Features', exact: true }).click();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: '/tmp/omnirush/placepms-home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Mentor sign in', exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign In to Workspace', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
