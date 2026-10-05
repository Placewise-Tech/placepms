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
  await page.getByRole('button', { name: 'Faculty', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Faculty', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
