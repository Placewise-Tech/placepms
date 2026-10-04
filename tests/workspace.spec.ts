import { test, expect, type Page } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const email = 'workspace-fixture@example.com';
const date = new Date().toISOString().slice(0, 10);
const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Workspace Fixture' }, created_at: '2026-01-01T00:00:00Z' };
const accessToken = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
const session = { access_token: accessToken, refresh_token: 'test-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };

async function workspace(page: Page) {
  const project = { id: 'sq-fixture', title: 'Connected Capstone', summary: 'Real project summary', tagline: 'A connected workspace', domain: 'Education', leader_email: email, mentor_id: null, mentor_name: null, github_repo: 'https://github.com/fixture/repo', figma_url: 'https://figma.com/design/Abc123/App', miro_url: 'https://miro.com/app/board/board123/', current_phase: 'Build', status: 'PENDING', created_at: '2026-01-01T00:00:00Z' };
  const milestone: Record<string, any> = { id: 'm-fixture', squad_id: project.id, name: 'Project delivery', phase: 'Build', description: 'Fixture delivery evidence', status: 'PENDING', due_date: date, start_date: null, submission_files: [], mentor_feedback: null, score: null };
  const members: Record<string, unknown>[] = [];
  const library: Record<string, unknown>[] = [{ id: 'reference-1', user_id: id, kind: 'research', title: 'Saved academic reference', url: 'https://example.test/paper', notes: 'A reviewed reference', tags: ['research'], project_id: project.id, created_at: date, updated_at: date }];
  const connections: Record<string, unknown>[] = [];
  let sessions = [{ id: sessionId, created_at: date, last_active_at: date, ip: '127.0.0.1', user_agent: 'Chrome/140 Linux', current_session: true }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', created_at: date, last_active_at: date, ip: '192.0.2.10', user_agent: 'Firefox/120 Windows', current_session: false }];
  const calls: Record<string, unknown>[] = [];
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204 }));
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const table = url.pathname.split('/').pop();
    if (table === 'workspace_library') {
      if (request.method() === 'POST') {
        const input = request.postDataJSON(); const row = { id: `library-${library.length + 1}`, created_at: date, updated_at: date, ...input }; library.push(row);
        return route.fulfill({ json: request.headers().accept?.includes('object') ? row : [row] });
      }
      if (request.method() === 'PATCH') {
        const row = library.find(item => `eq.${item.id}` === url.searchParams.get('id')); if (row) Object.assign(row, request.postDataJSON());
        return route.fulfill({ json: row });
      }
      if (request.method() === 'DELETE') {
        const index = library.findIndex(item => `eq.${item.id}` === url.searchParams.get('id')); if (index >= 0) library.splice(index, 1);
        return route.fulfill({ status: 204 });
      }
      const tag = url.searchParams.get('tags')?.match(/^cs\.\{(.+)\}$/)?.[1];
      const search = url.searchParams.get('or')?.match(/ilike\."%(.+?)%"/)?.[1];
      const result = library.filter(item => (!url.searchParams.has('kind') || `eq.${item.kind}` === url.searchParams.get('kind')) && (!url.searchParams.has('project_id') || `eq.${item.project_id}` === url.searchParams.get('project_id')) && (!tag || (item.tags as string[]).includes(tag)) && (!search || `${item.title} ${item.notes} ${item.url}`.toLowerCase().includes(search.toLowerCase())));
      return route.fulfill({ json: result, headers: { 'content-range': `0-${Math.max(0, result.length - 1)}/${result.length}`, 'access-control-expose-headers': 'content-range' } });
    }
    if (table === 'milestones' && request.method() === 'PATCH') { Object.assign(milestone, request.postDataJSON()); return route.fulfill({ json: [{ id: milestone.id }] }); }
    return route.fulfill({ json: table === 'profiles' ? [{ id, email, full_name: 'Workspace Fixture', college: 'Example University' }] : table === 'pms_squads' ? [project] : table === 'milestones' ? [milestone] : table === 'squad_members' ? members : [] });
  });
  await page.route('**/api/sessions', async route => {
    const input = route.request().postDataJSON(); calls.push(input);
    if (input.action === 'revoke') { sessions = sessions.filter(item => input.others ? item.current_session : item.id !== input.sessionId); return route.fulfill({ json: { revoked: 1, currentRevoked: false } }); }
    return route.fulfill({ json: { sessions, currentSessionId: sessionId } });
  });
  await page.route('**/api/workspace', async route => {
    const input = route.request().postDataJSON(); calls.push(input);
    if (input.action === 'project.update') Object.assign(project, input);
    if (input.action === 'project.archive') project.status = input.restore ? 'PENDING' : 'ARCHIVED';
    if (input.action === 'member.add') members.push({ ...input, id: 'member-fixture', squad_id: project.id, skills: input.skills.split(',') });
    if (input.action === 'member.update') { const member = members.find(item => item.id === input.memberId); if (member) Object.assign(member, input, { skills: input.skills.split(',') }); }
    if (input.action === 'milestone.update') Object.assign(milestone, input, { submission_files: input.links.split('\n').filter(Boolean).map((url: string) => ({ name: 'Submission 1', url })) });
    if (input.action === 'milestone.submit') Object.assign(milestone, { status: input.withdraw ? 'PENDING' : 'SUBMITTED' });
    if (input.action === 'milestone.review') Object.assign(milestone, { status: input.approve ? 'APPROVED' : 'REVISION_REQUESTED', mentor_feedback: input.feedback, score: input.score === '' ? null : Number(input.score) });
    return route.fulfill({ json: { saved: true } });
  });
  await page.route('**/api/integrations', async route => {
    const input = route.request().postDataJSON(); calls.push(input);
    if (input.action === 'status') return route.fulfill({ json: { connections, oauth: { github: true, figma: true, miro: true } } });
    if (input.action === 'connect-token') {
      connections.push({ provider: input.provider, account: `${input.provider}-fixture`, mode: 'token', updated_at: date, expires_at: null });
      return route.fulfill({ json: { account: `${input.provider}-fixture` } });
    }
    if (input.action === 'disconnect') { const index = connections.findIndex(item => item.provider === input.provider); if (index >= 0) connections.splice(index, 1); return route.fulfill({ json: { disconnected: true } }); }
    if (input.action === 'list') return route.fulfill({ json: { items: [{ id: 'resource-1', title: input.provider === 'github' ? 'fixture/private-repo' : 'My connected resource', kind: input.provider === 'github' ? 'Private' : 'file', url: 'https://example.test/resource' }] } });
    if (input.action === 'files') return route.fulfill({ json: input.path ? { path: 'README.md', text: '# Project\nDocumentation from GitHub', size: 30 } : { path: '', items: [{ id: 'README.md', title: 'README.md', path: 'README.md', kind: 'file', value: 30 }] } });
    if (input.action === 'commit') return route.fulfill({ json: { sha: 'a'.repeat(40), message: 'Implement feature', author: 'Contributor', date, additions: 12, deletions: 2, files: [{ name: 'src/app.ts', status: 'modified', additions: 12, deletions: 2, patch: '+const feature = true;' }] } });
    return route.fulfill({ json: {
      provider: input.provider, title: input.provider === 'github' ? 'fixture/repo' : `${input.provider} project analysis`, description: 'Provider report', url: 'https://example.test/resource', repository: 'fixture/repo', branch: 'main', branches: ['main', 'develop'],
      metrics: [{ label: 'Stars', value: 0 }, { label: 'Commits on this page', value: 1 }], warnings: [], sampleNotice: 'Analysis of up to 100 commits on this page.',
      sections: input.provider === 'github' ? [{ title: 'Commit history', items: [{ id: 'a'.repeat(40), title: 'Implement feature', kind: 'commit', date }] }] : [{ title: input.provider === 'figma' ? 'Pages' : 'Board items', items: [{ id: 'item1', title: input.provider === 'figma' ? 'Login frame' : 'Roadmap sticky note' }] }],
    } });
  });
  await page.goto('/login');
  await page.getByLabel('Institutional Email').fill(email);
  await page.getByLabel(/^Password/).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  return { calls, library, connections, project, milestone, members };
}

test('GitHub offers three access modes, public analysis, commit diffs, files and private PAT browsing', async ({ page }) => {
  const { calls } = await workspace(page);
  await page.goto('/dashboard/repositories');
  await expect(page.getByRole('button', { name: /^Public repository/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^GitHub authorization/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Personal access token/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^GitHub authorization/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Public repository/ }).click();
  await page.getByLabel('Repository URL or owner/repository').fill('fixture/repo');
  await page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'fixture/repo', exact: true })).toBeVisible();
  expect(calls.some(call => call.action === 'inspect' && call.access === 'public')).toBe(true);
  await page.getByRole('button', { name: 'Implement feature', exact: true }).click();
  await page.getByText('src/app.ts', { exact: false }).click();
  await expect(page.getByText('+const feature = true;', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse repository files' }).click();
  await page.getByRole('button', { name: /README.md/ }).click();
  await expect(page.getByText('# Project\nDocumentation from GitHub', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Personal access token/ }).click();
  await page.getByLabel('GitHub access token').fill('fixture-private-readonly-token');
  await page.getByRole('button', { name: 'Verify & connect' }).click();
  await expect(page.getByRole('status')).toContainText('Connected as github-fixture');
  await expect(page.getByLabel('GitHub access token')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('fixture-private-readonly-token');
  await page.getByRole('button', { name: 'Browse my repositories' }).click();
  await expect(page.getByRole('button', { name: 'fixture/private-repo' })).toBeVisible();
});

for (const provider of ['github', 'figma', 'miro']) test(`${provider} authorization returns to that user's connection and resource browser`, async ({ page }) => {
  const { connections, calls } = await workspace(page);
  connections.push({ provider, account: `${provider}-personal-account`, mode: 'oauth', updated_at: date, expires_at: null });
  await page.goto(`/dashboard/integrations?connected=${provider}`);
  const label = provider === 'github' ? 'GitHub' : provider === 'figma' ? 'Figma' : 'Miro';
  await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: new RegExp(`^${label} authorization`) })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: `${label} connected to your account` })).toBeVisible();
  await expect(page.locator('.workspace-callout').getByText(`${provider}-personal-account`, { exact: true })).toBeVisible();
  if (provider !== 'figma') {
    await expect(page.getByRole('button', { name: provider === 'github' ? 'fixture/private-repo' : 'My connected resource' })).toBeVisible();
    expect(calls.some(call => call.action === 'list' && call.provider === provider && call.access === 'oauth')).toBe(true);
  } else {
    await expect(page.getByLabel('Figma team / project ID')).toBeVisible();
    expect(calls.some(call => call.action === 'list' && call.provider === 'figma')).toBe(false);
  }
});

for (const provider of ['figma', 'miro']) test(`${provider} can connect by token and inspect an authorized resource`, async ({ page }) => {
  await workspace(page); await page.goto(`/dashboard/${provider}`);
  await page.getByRole('button', { name: /^Access token \/ API token/ }).click();
  await page.getByLabel(`${provider === 'figma' ? 'Figma' : 'Miro'} access token`).fill('fixture-provider-token');
  await page.getByRole('button', { name: 'Verify & connect' }).click();
  await expect(page.getByRole('status')).toContainText(`Connected as ${provider}-fixture`);
  await page.getByLabel(provider === 'figma' ? 'Figma file URL or file key' : 'Miro board URL or board ID').fill(provider === 'figma' ? 'Abc123' : 'board123');
  await page.getByRole('button', { name: provider === 'figma' ? 'Inspect design' : 'Inspect board', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${provider} project analysis` })).toBeVisible();
  await expect(page.getByRole('heading', { name: provider === 'figma' ? 'Login frame' : 'Roadmap sticky note' })).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Connection removed');
});

test('sessions show real-device details and allow signing out other devices', async ({ page }) => {
  const { calls } = await workspace(page); await page.goto('/dashboard/sessions');
  await expect(page.getByText('This device', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Firefox on Windows' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out other devices' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 session signed out' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Firefox on Windows' })).toHaveCount(0);
  expect(calls.some(call => call.action === 'revoke' && call.others === true)).toBe(true);
});

test('project leads can edit project details, manage members, and attach milestone documents', async ({ page }) => {
  const { calls } = await workspace(page); await page.goto('/dashboard/projects/sq-fixture');
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Project title', { exact: true }).fill('Updated Capstone');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updated Capstone', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await page.getByLabel('Member name').fill('Team Member'); await page.getByLabel('Member email').fill('member@example.test');
  await page.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Team Member' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit & attach files' }).click();
  await page.getByLabel('Submission document URLs (one per line)').fill('https://example.test/report.pdf');
  await page.getByRole('button', { name: 'Save milestone', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Submission 1' })).toHaveAttribute('href', 'https://example.test/report.pdf');
  expect(calls.some(call => call.action === 'milestone.update' && call.projectId === 'sq-fixture')).toBe(true);
});

test('research library saves editable references and blackbook exports actual project evidence', async ({ page }) => {
  const { library } = await workspace(page); await page.goto('/dashboard/research');
  await page.getByRole('button', { name: 'Add research', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('New reference');
  await page.getByLabel('URL', { exact: true }).fill('https://example.test/new-paper');
  await page.getByLabel('Notes / document content').fill('Verified research notes');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('sq-fixture');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New reference' })).toBeVisible();
  await page.goto('/dashboard/blackbook');
  await page.getByLabel('Methodology', { exact: true }).fill('We evaluated the actual project implementation.');
  await page.getByRole('button', { name: 'Generate report from saved records' }).click();
  await expect(page.getByLabel('Generated report')).toHaveValue(/We evaluated the actual project implementation\./);
  await expect(page.getByLabel('Generated report')).toHaveValue(/Saved academic reference/);
  await expect(page.getByLabel('Generated report')).toHaveValue(/New reference/);
  await expect(page.getByLabel('Generated report')).toHaveValue(/Project delivery/);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('placepms-blackbook.md');
  await page.getByRole('button', { name: 'Save to Documents' }).click();
  await expect(page.getByRole('status')).toContainText('Report saved to Documents');
  expect(library.some(item => item.kind === 'document')).toBe(true);
});

test('calendar drills into a deadline and the advanced workspace fits a mobile screen', async ({ page }) => {
  await workspace(page); await page.goto('/dashboard/calendar');
  await page.getByRole('button', { name: `${date}, 1 deadlines` }).click();
  await expect(page.getByRole('heading', { name: 'Project delivery' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/dashboard/repositories');
  await expect(page.getByRole('button', { name: /^Personal access token/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('workspace keyboard search opens without another menu and drills into milestone evidence', async ({ page }) => {
  await workspace(page);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search workspace', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Search pages and projects').fill('Project delivery');
  await dialog.getByRole('button', { name: /Project delivery/ }).click();
  await expect(page).toHaveURL(/projects\/sq-fixture#milestone-m-fixture$/);
  await expect(page.locator('#milestone-m-fixture')).toBeInViewport();
  await page.keyboard.press('/');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'Create a project' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('priority links apply task filters, board follows status changes, and exports use visible records', async ({ page }) => {
  const { milestone } = await workspace(page);
  milestone.due_date = '2020-01-01';
  await page.reload();
  await page.getByRole('link', { name: '1 Overdue', exact: true }).click();
  await expect(page.getByLabel('Filter milestone status')).toHaveValue('overdue');
  await expect(page.getByRole('heading', { name: 'Project delivery', exact: true })).toBeVisible();
  await page.getByLabel('Filter milestone status').selectOption('today');
  await expect(page.getByRole('heading', { name: 'No milestones to show' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Board view', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Project delivery', exact: true }).click();
  await expect(page.locator('.workspace-board-column').filter({ has: page.getByRole('heading', { name: /^In review/ }) }).getByRole('button', { name: 'Withdraw submission for Project delivery' })).toBeVisible();
  await page.getByLabel('Filter milestone status').selectOption('submitted');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered milestones' }).click();
  expect((await download).suggestedFilename()).toBe('placepms-milestones.csv');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('project workspace edits existing members and submits evidence in place', async ({ page }) => {
  const { calls } = await workspace(page); await page.goto('/dashboard/projects/sq-fixture');
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await page.getByLabel('Member name').fill('Designer'); await page.getByLabel('Member email').fill('designer@example.test');
  await page.getByRole('button', { name: 'Save member', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Designer', exact: true }).click();
  await page.getByLabel('Team role').fill('Design lead'); await page.getByLabel('Skills (comma-separated)').fill('Figma, Research');
  await page.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(page.getByText('designer@example.test · Design lead')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Withdraw submission', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit & attach files' })).toBeDisabled();
  await page.getByRole('button', { name: 'Withdraw submission', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit & attach files' })).toBeEnabled();
  expect(calls.some(call => call.action === 'member.update')).toBe(true);
  expect(calls.filter(call => call.action === 'milestone.submit')).toHaveLength(2);
});

test('assigned mentor sees review queue and saves a revision decision with a score', async ({ page }) => {
  const { project, milestone, calls } = await workspace(page);
  Object.assign(project, { leader_email: 'lead@example.test', mentor_id: id, mentor_name: 'Workspace Fixture' });
  Object.assign(milestone, { status: 'SUBMITTED', submitted_at: new Date().toISOString() });
  await page.goto('/dashboard/mentorship');
  await expect(page.getByRole('heading', { name: 'Your mentor review queue' })).toBeVisible();
  await page.getByRole('link', { name: 'Review delivery', exact: true }).click();
  await page.getByRole('button', { name: 'Review submission', exact: true }).click();
  await page.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('revise');
  await page.getByLabel('Feedback', { exact: true }).fill('Add reproducible evaluation evidence.');
  await page.getByLabel('Score (0–100, optional)').fill('72.5');
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.getByText('Add reproducible evaluation evidence.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Score 72.5\/100/)).toBeVisible();
  expect(calls.some(call => call.action === 'milestone.review' && call.approve === false)).toBe(true);
});

test('project-specific report drafts survive reload and update the same saved entry', async ({ page }) => {
  const { library } = await workspace(page); await page.goto('/dashboard/blackbook');
  await expect(page.getByLabel('Methodology', { exact: true })).toBeEnabled();
  await page.getByLabel('Methodology', { exact: true }).fill('Our saved methodology survives reload.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Methodology', exact: true })).toHaveValue('Our saved methodology survives reload.');
  await page.getByLabel('Abstract', { exact: true }).fill('Updated project abstract.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  expect(library.filter(item => (item.tags as string[]).includes('blackbook-draft'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Generate report from saved records' }).click();
  await expect(page.getByLabel('Generated report')).toHaveValue(/Updated project abstract/);
});

test('library search includes notes, tags filter saved entries, and project links carry context', async ({ page }) => {
  await workspace(page); await page.goto('/dashboard/projects/sq-fixture');
  await page.getByRole('link', { name: 'Project research', exact: true }).click();
  await expect(page.getByLabel('Library project filter')).toHaveValue('sq-fixture');
  await page.getByLabel('Search library').fill('reviewed reference');
  await expect(page.getByRole('heading', { name: 'Saved academic reference', exact: true })).toBeVisible();
  await page.getByLabel('Library tag filter').fill('missing-tag');
  await expect(page.getByRole('heading', { name: 'Saved academic reference', exact: true })).toHaveCount(0);
  await page.getByLabel('Library tag filter').fill('research');
  await expect(page.getByRole('heading', { name: 'Saved academic reference', exact: true })).toBeVisible();
});

test('calendar supports date links, agenda, selection export, and project filtering', async ({ page }) => {
  await workspace(page); await page.goto(`/dashboard/calendar?date=${date}`);
  await expect(page.getByRole('button', { name: `${date}, 1 deadlines` })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Agenda view', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project delivery', exact: true })).toBeVisible();
  await page.getByLabel('Calendar status filter').selectOption('complete');
  await expect(page.getByRole('button', { name: 'Export selection', exact: true })).toBeDisabled();
  await page.getByLabel('Calendar status filter').selectOption('open');
  await page.getByLabel('Calendar project filter').selectOption('sq-fixture');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export selection', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('placepms-calendar-selection.ics');
});

test('every dashboard section loads in light and dark themes on mobile without runtime errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await workspace(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  for (const slug of ['', 'projects', 'tasks', 'mentorship', 'calendar', 'documents', 'research', 'resources', 'blackbook', 'integrations', 'repositories', 'figma', 'miro', 'sessions', 'portfolio']) {
    await page.goto(`/dashboard${slug ? `/${slug}` : ''}`);
    await expect(page.locator('.dashboard')).toHaveClass(/dashboard-dark/);
    await expect(page.locator('.dash-main h1')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading dashboard' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `overflow on ${slug || 'overview'}`).toBe(false);
  }
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export portfolio', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('placepms-portfolio.html');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('.dashboard')).not.toHaveClass(/dashboard-dark/);
  expect(errors).toEqual([]);
});
