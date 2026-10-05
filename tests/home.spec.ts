import { test, expect } from '@playwright/test';

test('futuristic homepage previews, journey, motion control, and account links work on desktop and mobile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big ideas. Next-level execution./ })).toBeVisible();
  await expect(page.locator('.home-feature')).toHaveCount(4);
  await page.getByRole('button', { name: 'Pause animations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play animations', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.home-orbit-particle').evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused');
  await page.getByRole('button', { name: 'Play animations', exact: true }).click();
  await page.locator('.home-preview').getByRole('button', { name: 'Milestones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'From idea to done.' })).toBeVisible();
  await page.locator('.home-preview').getByRole('button', { name: 'Connected tools', exact: true }).click();
  await expect(page.getByText('GitHub repositories', { exact: true })).toBeVisible();
  await page.locator('.home-preview').getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: /Build your momentum/ }).click();
  await expect(page.getByRole('heading', { name: 'Small steps. Visible progress.' })).toBeVisible();
  await page.getByRole('button', { name: /Make it your story/ }).click();
  await expect(page.getByRole('heading', { name: 'From first idea to final presentation' })).toBeVisible();
  await page.getByText('How do I get started?', { exact: true }).click();
  await expect(page.getByText(/Your initial six-digit login code is emailed to you/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.locator('.home-start').scrollIntoViewIfNeeded();
  await expect(page.locator('.home-start > .home-container')).toHaveCSS('opacity', '1');
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: '/tmp/omnirush/placepms-home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Features', exact: true }).click();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  for (const tab of ['Milestones', 'Connected tools', 'Overview']) {
    await page.locator('.home-preview').getByRole('button', { name: tab, exact: true }).click();
    await expect(page.locator('.home-preview').getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await expect(page.getByRole('img', { name: 'Illustrative project momentum chart' })).toBeVisible();
  await expect(page.locator('.home-preview-body > div')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '/tmp/omnirush/placepms-home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Mentor sign in', exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign In to Workspace', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('homepage respects reduced motion and opens account creation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big ideas. Next-level execution./ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play animations', exact: true })).toBeDisabled();
  expect(await page.locator('.home-orbit-particle').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.getByRole('button', { name: 'Create your workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
});
