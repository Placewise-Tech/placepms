import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { generateStarterPlan, type IdeaInput, type IdeaPlan } from '../src/lib/idea-plan';
import { ideaDraftKey } from '../src/lib/idea-draft';

async function planner(page: Page) {
  let fail = false;
  const inputs: IdeaInput[] = [];
  await page.route('**/api/idea-plan', route => {
    if (fail) return route.fulfill({ status: 503, json: { error: 'Planner temporarily unavailable.' } });
    const input = route.request().postDataJSON() as IdeaInput; inputs.push(input);
    return route.fulfill({ json: { plan: generateStarterPlan(input, randomUUID), notice: 'Your editable starter plan is ready.' } });
  });
  return { inputs, fail: () => { fail = true; } };
}

async function buildPlan(page: Page) {
  await page.goto('/');
  const section = page.locator('#idea-planner');
  await section.getByLabel('What do you want to build?').fill('I want to build a campus placement portal in six weeks');
  await section.getByLabel('Project start date').fill('2026-10-10');
  await section.getByRole('button', { name: 'Build my project plan', exact: true }).click();
  await expect(section.getByLabel('Project title', { exact: true })).toHaveValue('Campus Placement Portal');
  return section;
}

test('idea planner builds, edits, exports, and restores the visitor’s own roadmap on desktop and mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const app = await planner(page);
  const section = await buildPlan(page);
  expect(app.inputs[0]).toMatchObject({ weeks: 6, teamSize: 4, startDate: '2026-10-10' });
  await section.getByLabel('Project title', { exact: true }).fill('Placement Compass');
  await section.getByLabel('Objective 1', { exact: true }).fill('Make student applications easier to track.');
  await section.getByRole('button', { name: 'Roadmap', exact: true }).click();
  await expect(section.locator('.idea-phases .idea-phase')).toHaveCount(5);
  await section.locator('.idea-milestone summary').first().click();
  await section.getByLabel('Milestone 1 name', { exact: true }).fill('Placement requirements & scope');
  await section.getByRole('button', { name: 'Team roles', exact: true }).click();
  await section.getByLabel('Role 1 responsibility', { exact: true }).fill('Coordinate student feedback and delivery priorities.');
  await section.getByRole('button', { name: 'Blackbook', exact: true }).click();
  await section.getByLabel('Chapter 1 outline', { exact: true }).fill('Summarize the placement portal and its planned outcomes.');
  await expect(section.getByText('Saved in this browser', { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download plan', exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  let content = ''; for await (const chunk of stream!) content += chunk.toString();
  expect(content).toContain('# Placement Compass');
  expect(content).toContain('Placement requirements & scope');
  expect(content).toContain('Coordinate student feedback');
  expect(content).toContain('Summarize the placement portal');
  await page.reload();
  await expect(page.locator('#idea-planner').getByLabel('Project title', { exact: true })).toHaveValue('Placement Compass');
  await page.locator('#idea-planner').screenshot({ path: '/tmp/omnirush/placepms-idea-planner-desktop.png' });
  await page.setViewportSize({ width: 320, height: 760 });
  for (const tab of ['Roadmap', 'Team roles', 'Blackbook', 'Overview']) {
    await section.getByRole('button', { name: tab, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await section.screenshot({ path: '/tmp/omnirush/placepms-idea-planner-mobile.png' });
  await section.getByRole('button', { name: 'Clear draft', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), ideaDraftKey)).toBeNull();
  await expect(section.getByRole('heading', { name: 'A thought today. A plan you can act on.' })).toBeVisible();
});

test('failed generation keeps the saved plan, and invalid schedules cannot be handed through signup', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const app = await planner(page);
  const section = await buildPlan(page);
  await expect(section.getByText('Saved in this browser', { exact: true })).toBeVisible();
  const draftId = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plan.id, ideaDraftKey);
  app.fail();
  await section.getByRole('button', { name: 'Rebuild my plan', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(section.getByLabel('Project title', { exact: true })).toHaveValue('Campus Placement Portal');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plan.id, ideaDraftKey)).toBe(draftId);
  await section.getByRole('button', { name: 'Roadmap', exact: true }).click();
  await section.locator('.idea-milestone summary').first().click();
  await section.getByLabel('Milestone 1 due date', { exact: true }).fill('2030-01-01');
  await section.getByRole('button', { name: 'Create a workspace with this plan', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('dates must fall');
  await expect(page).not.toHaveURL(/\/signup/);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), ideaDraftKey);
  expect(saved.pending).toBe(false);
  expect(saved.plan.milestones[0].dueDate).not.toBe('2030-01-01');
});

test('saved plan follows signup, login, password setup, and a retry into a real project without duplicate handoffs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await planner(page);
  const userId = '11111111-1111-4111-8111-111111111111';
  const email = 'idea-student@example.com';
  let passwordRequired = true;
  const authUser = () => ({ id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email', must_change_password: passwordRequired }, user_metadata: { full_name: 'Idea Student' }, created_at: '2026-10-10T00:00:00Z' });
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
  const session = () => ({ access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: authUser() });
  const projects: Record<string, unknown>[] = []; const milestones: Record<string, unknown>[] = []; const library: Record<string, unknown>[] = []; const imports: IdeaPlan[] = [];
  let signup: Record<string, unknown> = {};
  await page.route('**/api/signup', route => { signup = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { message: 'Check your email.' } }); });
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session() }));
  await page.route('**/auth/v1/user', route => { if (route.request().method() === 'PUT') passwordRequired = false; return route.fulfill({ json: authUser() }); });
  await page.route('**/api/management', route => route.fulfill({ json: { role: 'student', enabled: true, can_mentor: false, settings: { features: { github: true, figma: true, miro: true, document: true, blackbook: true } } } }));
  await page.route('**/api/sessions', route => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/integrations', route => route.fulfill({ json: { connections: [], oauth: {} } }));
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url()); const table = url.pathname.split('/').at(-1);
    const rows = table === 'pms_squads' ? projects : table === 'milestones' ? milestones : table === 'workspace_library' ? library : [];
    const selected = rows.filter(row => ['id', 'leader_email', 'mentor_id', 'project_id', 'kind'].every(key => !url.searchParams.has(key) || String(row[key]) === url.searchParams.get(key)!.replace(/^eq\./, '')));
    return route.fulfill({ json: selected });
  });
  await page.route('**/api/workspace', route => {
    const input = route.request().postDataJSON();
    expect(passwordRequired).toBe(false);
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    expect(input.action).toBe('project.from-plan');
    const plan = input.plan as IdeaPlan; imports.push(plan);
    if (!projects.length) projects.push({ id: plan.id, title: plan.title, summary: plan.summary, domain: plan.domain, leader_email: email, status: 'PENDING', current_phase: plan.phases[0].title });
    if (imports.length === 1) return route.fulfill({ status: 503, json: { error: 'Temporary save interruption. Please retry.' } });
    if (!milestones.length) milestones.push(...plan.milestones.map(item => ({ id: item.id, squad_id: plan.id, name: item.name, phase: item.phase, description: item.description, due_date: item.dueDate, start_date: item.startDate, status: 'PENDING', submission_files: [] })));
    if (!library.length) library.push({ id: 'plan-document', title: `Project plan — ${plan.title}`, project_id: plan.id, kind: 'document', notes: 'Saved project planning notes', tags: ['idea-plan'] });
    return route.fulfill({ json: { projectId: plan.id, milestones: milestones.length, documentSaved: true, blackbookSaved: true } });
  });
  const section = await buildPlan(page);
  await section.getByLabel('Project title', { exact: true }).fill('My Placement Compass');
  await section.getByRole('button', { name: 'Create a workspace with this plan', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByText('Your project plan is coming with you', { exact: true })).toBeVisible();
  await page.getByLabel('Full Name', { exact: true }).fill('Idea Student');
  await page.getByLabel('Institutional Email', { exact: true }).fill(email);
  await page.getByLabel('College / University Name', { exact: true }).fill('Example University');
  await page.getByRole('button', { name: 'Create PlacePMS Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible();
  expect(signup).toMatchObject({ email, role: 'student' });
  expect(signup).not.toHaveProperty('password');
  await page.getByRole('button', { name: 'Back to Sign In', exact: true }).click();
  await page.getByLabel(/^Password/).fill('123456');
  await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/set-password$/);
  expect(imports).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set your own password', exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('My-personal-password-2026!');
  await page.getByLabel('Confirm password', { exact: true }).fill('My-personal-password-2026!');
  await page.getByRole('button', { name: 'Save password & open workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Bring your plan into this workspace.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review your project plan', exact: true });
  await dialog.getByLabel('Objective 1', { exact: true }).fill('Coordinate placement opportunities and applications.');
  await dialog.getByRole('button', { name: 'Save plan edits', exact: true }).click();
  await page.getByRole('button', { name: 'Create project from my plan', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Temporary save interruption' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue creating project', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${imports[0].id}$`));
  expect(imports).toHaveLength(2);
  expect(imports[0].id).toBe(imports[1].id);
  expect(imports[1].objectives[0]).toBe('Coordinate placement opportunities and applications.');
  expect(projects).toHaveLength(1); expect(milestones).toHaveLength(5);
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Problem statement & scope', exact: true })).toBeVisible();
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), ideaDraftKey);
  expect(stored.pending).toBe(false); expect(stored.importedProjectId).toBe(imports[0].id);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bring your plan into this workspace.', exact: true })).toHaveCount(0);
});
