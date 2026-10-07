import { test, expect, type Download } from '@playwright/test';

async function downloadContent(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The sample download was not created.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

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
  for (const feature of await page.locator('.home-feature').all()) {
    await feature.scrollIntoViewIfNeeded();
    await expect(feature).toHaveCSS('opacity', '1');
  }
  await page.locator('.home-start').scrollIntoViewIfNeeded();
  await expect(page.locator('.home-start > .home-container')).toHaveCSS('opacity', '1');
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await expect(page.locator('.home-floating-cta')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/omnirush/placepms-home-desktop.png', fullPage: true });
  await page.locator('.home-hero').screenshot({ path: '/tmp/omnirush/placepms-hero-desktop.png' });
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
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await expect(page.getByRole('img', { name: 'Illustrative project momentum chart' })).toBeVisible();
  await expect(page.locator('.home-preview-body > div')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: '/tmp/omnirush/placepms-home-mobile.png', fullPage: true });
  await page.locator('.home-hero').screenshot({ path: '/tmp/omnirush/placepms-hero-mobile.png' });
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

test('workflow studio calculates project health and produces real report and calendar downloads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const studio = page.locator('#automation');
  await studio.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(studio.getByRole('status')).toContainText('Project insights complete');
  await expect(studio.locator('.home-flow-metrics > div').nth(0)).toContainText('50%');
  await expect(studio.locator('.home-flow-metrics > div').nth(1)).toContainText('01');
  await expect(studio.locator('.home-flow-metrics > div').nth(2)).toContainText('01');
  const insightsDownload = page.waitForEvent('download');
  await studio.getByRole('button', { name: 'Download sample', exact: true }).click();
  expect(JSON.parse(await downloadContent(await insightsDownload))).toMatchObject({ sample: true, completion: 50, overdue: 1, awaitingReview: 1 });

  await studio.getByRole('button', { name: /Blackbook builder/ }).click();
  await expect(studio.getByRole('button', { name: 'Download sample', exact: true })).toBeDisabled();
  await studio.getByRole('button', { name: 'Run workflow', exact: true }).click();
  const reportDownload = page.waitForEvent('download');
  await studio.getByRole('button', { name: 'Download sample', exact: true }).click();
  const report = await downloadContent(await reportDownload);
  expect(report).toContain('sample project data');
  expect(report).toContain('# Campus Compass');
  expect(report).toContain('2 of 4 milestones completed (50%)');
  expect(report).toContain('## Milestone evidence');

  await studio.getByRole('button', { name: /Deadline planning/ }).click();
  await studio.getByRole('button', { name: 'Run workflow', exact: true }).click();
  const calendarDownload = page.waitForEvent('download');
  await studio.getByRole('button', { name: 'Download sample', exact: true }).click();
  const calendar = await downloadContent(await calendarDownload);
  expect(calendar).toContain('BEGIN:VCALENDAR');
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  expect(calendar).toContain('SUMMARY:Usability review');
});

test('smart navigation, FAQ search, and role-specific entry points work without duplicating team photos', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const automationLink = page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Automation', exact: true });
  await automationLink.click();
  await expect(automationLink).toHaveAttribute('aria-current', 'location');
  const search = page.getByRole('searchbox', { name: 'Search frequently asked questions' });
  await search.fill('blackbook');
  await expect(page.locator('.home-faq details')).toHaveCount(1);
  await page.getByText('Can I build a Blackbook report?', { exact: true }).click();
  await expect(page.locator('.home-faq details p')).toContainText('editable report');
  await search.fill('no-matching-question');
  await expect(page.getByRole('heading', { name: 'No matching answers.' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all questions' }).click();
  await expect(page.locator('.home-faq details')).toHaveCount(6);
  await expect(page.locator('#team img')).toHaveCount(4);
  expect(await page.locator('#team img').evaluateAll(images => new Set(images.map(image => (image as HTMLImageElement).src)).size)).toBe(4);

  await page.setViewportSize({ width: 320, height: 760 });
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open navigation menu', exact: true })).toBeFocused();
  for (const section of ['#automation', '#your-workspace', '#team', '#faq']) {
    await page.locator(section).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await expect(page.locator('#team img')).toHaveCount(4);
  await page.locator('#your-workspace').getByRole('button', { name: 'Mentors', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Guide the work. See the progress.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in as a mentor', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign In to Workspace', exact: true })).toBeVisible();
});

test('product tour advances automatically, manual selection takes over, and motion preference survives reload', async ({ page }) => {
  await page.goto('/');
  const preview = page.locator('.home-preview');
  await page.mouse.move(5, 5);
  await expect(preview.getByRole('button', { name: 'Milestones', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await preview.getByRole('button', { name: 'Connected tools', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play product tour', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Pause animations', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play animations', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Play product tour', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Play animations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause animations', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('workflow execution pauses and resumes, and switching presets cancels an active run', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Automation', exact: true }).click();
  const studio = page.locator('#automation');
  await expect(studio).toBeInViewport({ ratio: 0.7 });
  await studio.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(studio.getByRole('status')).toContainText('Step 2 of 3', { timeout: 5000 });
  await studio.getByRole('button', { name: 'Pause workflow', exact: true }).click();
  await expect(studio.getByRole('button', { name: 'Resume workflow', exact: true })).toBeVisible();
  const completedSteps = await studio.locator('.home-flow-pipeline .is-done').count();
  await page.waitForTimeout(1200); // Wait beyond a workflow tick to verify it is actually paused.
  await expect(studio.locator('.home-flow-pipeline .is-done')).toHaveCount(completedSteps);
  await studio.getByRole('button', { name: 'Resume workflow', exact: true }).click();
  await expect(studio.getByRole('status')).toContainText('Project insights complete', { timeout: 5000 });
  await expect(studio.getByRole('button', { name: 'Download sample', exact: true })).toBeEnabled();
  await studio.screenshot({ path: '/tmp/omnirush/placepms-workflow-desktop.png' });
  await studio.getByRole('button', { name: 'Run again', exact: true }).click();
  await studio.getByRole('button', { name: /Blackbook builder/ }).click();
  await page.waitForTimeout(1200); // The cancelled preset must not advance the newly selected workflow.
  await expect(studio.locator('.home-flow-pipeline .is-done')).toHaveCount(0);
  await expect(studio.getByRole('button', { name: 'Download sample', exact: true })).toBeDisabled();
  await expect(studio.getByRole('button', { name: 'Run workflow', exact: true })).toBeVisible();
});
