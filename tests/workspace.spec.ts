import { test, expect, type Download, type Page } from '@playwright/test';
import type { GitHubCommit, GitHubRepositoryIntelligence } from '../src/lib/integration-types';

const id = '11111111-1111-4111-8111-111111111111';
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const email = 'workspace-fixture@example.com';
const date = new Date().toISOString().slice(0, 10);
const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Workspace Fixture' }, created_at: '2026-01-01T00:00:00Z' };
const accessToken = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
const session = { access_token: accessToken, refresh_token: 'test-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };

async function workspace(page: Page, options: { githubAnalytics?: boolean; failStatsOnce?: boolean; githubIntelligence?: boolean; providerDetails?: boolean; managedRole?: 'admin' | 'teacher' | 'staff'; staleRoleMetadata?: boolean } = {}) {
  const project = { id: 'sq-fixture', title: 'Connected Capstone', summary: 'Real project summary', tagline: 'A connected workspace', domain: 'Education', leader_email: email, mentor_id: null, mentor_name: null, github_repo: 'https://github.com/fixture/repo', figma_url: 'https://figma.com/design/Abc123/App', miro_url: 'https://miro.com/app/board/board123/', current_phase: 'Build', status: 'PENDING', created_at: '2026-01-01T00:00:00Z' };
  const milestone: Record<string, any> = { id: 'm-fixture', squad_id: project.id, name: 'Project delivery', phase: 'Build', description: 'Fixture delivery evidence', status: 'PENDING', due_date: date, start_date: null, submission_files: [], mentor_feedback: null, score: null };
  const members: Record<string, unknown>[] = [];
  const library: Record<string, unknown>[] = [{ id: 'reference-1', user_id: id, kind: 'research', title: 'Saved academic reference', url: 'https://example.test/paper', notes: 'A reviewed reference', tags: ['research'], project_id: project.id, created_at: date, updated_at: date }];
  const connections: Record<string, unknown>[] = [];
  const accounts: Record<string, any>[] = [];
  const settings = { registration_enabled: true, features: { github: true, figma: true, miro: true, research: true, resource: true, document: true, blackbook: true } };
  const authUser = { ...user, app_metadata: { ...user.app_metadata, ...(options.managedRole && !options.staleRoleMetadata ? { workspace_role: options.managedRole } : {}) } };
  let sessions = [{ id: sessionId, created_at: date, last_active_at: date, ip: '127.0.0.1', user_agent: 'Chrome/140 Linux', current_session: true }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', created_at: date, last_active_at: date, ip: '192.0.2.10', user_agent: 'Firefox/120 Windows', current_session: false }];
  const calls: Record<string, unknown>[] = [];
  let failStats = options.failStatsOnce === true;
  const identity = (name: string, login: string) => ({ key: `github:${login}`, name, login, email: `${login}@example.test`, url: `https://github.com/${login}` });
  const githubCommits: GitHubCommit[] = [
    { sha: 'a'.repeat(40), message: 'Implement feature\nAdd authenticated repository analysis.', url: 'https://github.com/fixture/private-repo/commit/a', author: identity('Alice Example', 'alice'), committer: identity('Bob Example', 'bob'), authoredAt: '2026-01-01T09:00:00Z', committedAt: '2026-01-04T10:30:00Z', parents: [], verified: true, verificationReason: 'valid' },
    { sha: 'b'.repeat(40), message: 'Merge feature branch', url: 'https://github.com/fixture/private-repo/commit/b', author: identity('Bob Example', 'bob'), committer: identity('Bob Example', 'bob'), authoredAt: '2026-01-03T15:00:00Z', committedAt: '2026-01-03T16:00:00Z', parents: ['a'.repeat(40), 'c'.repeat(40)], verified: false, verificationReason: 'unsigned' },
    { sha: 'c'.repeat(40), message: 'Add repository tests', url: 'https://github.com/fixture/private-repo/commit/c', author: identity('Alice Example', 'alice'), committer: identity('Alice Example', 'alice'), authoredAt: '2026-01-02T08:00:00Z', committedAt: '2026-01-02T09:00:00Z', parents: [], verified: false, verificationReason: 'unsigned' },
  ];
  const intelligence: GitHubRepositoryIntelligence = {
    capturedAt: '2026-01-04T20:00:00Z', coverage: { workflows: { available: true, hasMore: false }, runs: { available: true, hasMore: true }, releases: { available: true, hasMore: false }, standards: { available: true, hasMore: false } },
    workflows: [{ id: 'ci', name: 'Build & test', path: '.github/workflows/ci.yml', state: 'active', url: 'https://github.com/fixture/repo/actions/workflows/ci.yml', updatedAt: '2026-01-04T10:06:00Z' }],
    runs: [{ id: 'run-1', name: 'Build & test', branch: 'main', sha: 'a'.repeat(40), event: 'push', status: 'completed', conclusion: 'success', url: 'https://github.com/fixture/repo/actions/runs/1', startedAt: '2026-01-04T10:00:00Z', updatedAt: '2026-01-04T10:06:00Z' }, { id: 'run-2', name: 'Build & test', branch: 'develop', sha: 'b'.repeat(40), event: 'pull_request', status: 'completed', conclusion: 'failure', url: 'https://github.com/fixture/repo/actions/runs/2', startedAt: '2026-01-03T10:00:00Z', updatedAt: '2026-01-03T10:04:00Z' }],
    releases: [{ id: 'release-1', title: 'Connected intelligence v1', tag: 'v1.0.0', body: 'Release evidence from GitHub.\n<script>window.releaseInjection = true</script>', author: 'alice', publishedAt: '2026-01-04T12:00:00Z', url: 'https://github.com/fixture/repo/releases/tag/v1.0.0', draft: false, prerelease: false, assets: 2 }],
    standards: [{ name: 'README', present: true, url: 'https://github.com/fixture/repo/blob/main/README.md' }, { name: 'License', present: true, url: 'https://github.com/fixture/repo/blob/main/LICENSE' }, { name: 'Contribution guide', present: false, url: '' }], communityHealth: 75,
  };
  intelligence.runs.push({ id: 'run-3', name: 'Lint', branch: 'main', sha: 'c'.repeat(40), event: 'push', status: 'completed', conclusion: 'timed_out', url: 'https://github.com/fixture/repo/actions/runs/3', startedAt: '2026-01-02T10:00:00Z', updatedAt: '2026-01-02T10:03:00Z' });
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { ...session, user: authUser } }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: authUser }));
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204 }));
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const table = url.pathname.split('/').pop();
    if (table === 'workspace_project_directory') return route.fulfill({ json: { people: [{ id: '22222222-2222-4222-8222-222222222222', email: 'member@example.test', full_name: 'Team Member' }], total: 1 } });
    if (table === 'workspace_send_project_invitation') { members.push({ id: 'member-fixture', squad_id: project.id, name: 'Team Member', email: 'member@example.test', role: 'Member', skills: [] }); return route.fulfill({ json: { saved: true, invitationId: '33333333-3333-4333-8333-333333333333' } }); }
    if (table === 'workspace_list_project_invitations') return route.fulfill({ json: { invitations: [] } });
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
  await page.route('**/api/management', route => {
    const input = route.request().postDataJSON(); calls.push(input);
    if (input.action === 'monitoring.overview') return route.fulfill({ json: {
      counts: { accounts: accounts.length + 1, online: 1, idle: 0, offline: accounts.length, active_sessions: 1, projects: 1, milestones: 1, submitted: 0, completed: 0, connections: connections.length, reports: 0, ai_marked: 0, activity_24h: 0 },
      users: [], activity: [], providerStats: [{ provider: 'github', accounts: connections.filter(item => item.provider === 'github').length, last_connected: null }, { provider: 'figma', accounts: 0, last_connected: null }, { provider: 'miro', accounts: 0, last_connected: null }], trends: Array.from({ length: 12 }, (_, index) => ({ at: new Date(Date.now() - (11 - index) * 3600000).toISOString(), count: 0 })), updated_at: new Date().toISOString(),
    } });
    if (input.action === 'overview') return route.fulfill({ json: { counts: { accounts: accounts.length + 1, projects: 1, milestones: 1, connections: connections.length, reports: 0, mentors: 0 }, settings } });
    if (input.action === 'accounts.list') {
      const items = accounts.filter(account => (!input.role || account.role === input.role) && (!input.search || `${account.full_name} ${account.email}`.toLowerCase().includes(input.search.toLowerCase())));
      return route.fulfill({ json: { items, total: items.length } });
    }
    if (input.action === 'accounts.create') accounts.push({ id: '22222222-2222-4222-8222-222222222222', enabled: true, ...input });
    if (input.action === 'accounts.update') Object.assign(accounts.find(account => account.id === input.id)!, input);
    if (input.action === 'settings.update') Object.assign(settings, { registration_enabled: input.registration_enabled, features: input.features });
    return route.fulfill({ json: { role: options.managedRole || 'student', enabled: true, can_mentor: false, settings } });
  });
  await page.route('**/api/workspace', async route => {
    const input = route.request().postDataJSON(); calls.push(input);
    if (input.action === 'invitation.list') return route.fulfill({ json: { invitations: [] } });
    if (input.action === 'directory.search') return route.fulfill({ json: { people: [{ id: '22222222-2222-4222-8222-222222222222', email: 'member@example.test', full_name: 'Team Member' }], total: 1 } });
    if (input.action === 'invitation.send') { members.push({ id: 'member-fixture', squad_id: project.id, name: 'Team Member', email: 'member@example.test', role: 'Member', skills: [] }); return route.fulfill({ json: { saved: true, invitationId: '33333333-3333-4333-8333-333333333333' } }); }
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
    if (input.action === 'commit-stats') {
      const requested = input.shas as string[];
      const denied = failStats && requested.includes('b'.repeat(40)); failStats = false;
      return route.fulfill({ json: { commits: requested.filter(sha => !denied || sha !== 'b'.repeat(40)).map(sha => ({ sha, stats: { additions: 12, deletions: 2, files: [{ name: 'src/app.ts', status: 'modified', additions: 12, deletions: 2 }], filesTruncated: false } })), errors: denied ? [{ sha: 'b'.repeat(40), message: 'github API rate limit reached.' }] : [] } });
    }
    if (input.action === 'commit' && options.githubAnalytics) {
      const item = githubCommits.find(commit => commit.sha === input.sha)!;
      return route.fulfill({ json: { sha: item.sha, message: item.message, author: item.author.name, authorIdentity: item.author, committerIdentity: item.committer, date: item.authoredAt, committedAt: item.committedAt, parents: item.parents, verified: item.verified, verificationReason: item.verificationReason, additions: 12, deletions: 2, files: [{ name: 'src/app.ts', status: 'modified', additions: 12, deletions: 2, patch: '+const feature = true;' }], truncated: false, url: item.url } });
    }
    if (input.action === 'commit') return route.fulfill({ json: { sha: 'a'.repeat(40), message: 'Implement feature', author: 'Contributor', date, additions: 12, deletions: 2, files: [{ name: 'src/app.ts', status: 'modified', additions: 12, deletions: 2, patch: '+const feature = true;' }] } });
    if (input.provider === 'github' && options.githubAnalytics) {
      const currentPage = Number(input.page) || 1;
      const until = String(input.until || '2026-01-04T20:00:00.000Z');
      const days = input.days === 'all' ? 'all' : Number(input.days) || 30;
      const since = new Date(until); since.setUTCHours(0, 0, 0, 0); if (days !== 'all') since.setUTCDate(since.getUTCDate() - days + 1);
      const repository = String(input.target || 'fixture/private-repo');
      return route.fulfill({ json: { provider: 'github', title: repository, description: 'Authorized repository analysis', url: `https://github.com/${repository}`, repository, branch: 'main', branches: ['main', 'develop'], nextPage: currentPage === 1 ? 2 : undefined, metrics: [], sections: [], warnings: [],
        github: { repository: { name: repository, defaultBranch: 'main', visibility: 'Private', archived: false, createdAt: '2025-01-01T00:00:00Z', pushedAt: '2026-01-04T10:30:00Z', sizeKb: 1024, license: 'MIT License', topics: ['education'], stars: 2, forks: 1, openIssuesAndPulls: 2 }, branch: 'main', window: { days, since: days === 'all' ? null : since.toISOString(), until }, pages: [currentPage], nextPage: currentPage === 1 ? 2 : undefined, commitsAvailable: true,
          ...(options.githubIntelligence && currentPage === 1 ? { intelligence } : {}),
          commits: currentPage === 1 ? githubCommits.slice(0, 2) : githubCommits.slice(1), languages: [{ name: 'TypeScript', bytes: 300 }, { name: 'CSS', bytes: 100 }], branches: [{ name: 'main', sha: 'a'.repeat(40), protected: true }], contributors: [{ login: 'alice', commits: 20, url: 'https://github.com/alice' }], pulls: [{ number: 4, title: 'Feature pull request', url: 'https://github.com/fixture/private-repo/pull/4', author: 'alice', createdAt: '2026-01-02T08:00:00Z', updatedAt: '2026-01-03T08:00:00Z', labels: ['enhancement'], draft: false }], issues: [] },
      } });
    }
    if (options.providerDetails && input.provider !== 'github') return route.fulfill({ json: { provider: input.provider, title: `${input.provider} detailed analysis`, description: 'Returned provider metadata', url: 'https://example.test/resource', metrics: [{ label: 'Returned records', value: 2 }], warnings: [], sampleNotice: 'This analysis describes only returned records.', sections: [{ title: input.provider === 'figma' ? 'Frames & layers' : 'Board items', items: [{ id: 'node-1', title: input.provider === 'figma' ? 'Login frame' : 'Roadmap sticky note', kind: input.provider === 'figma' ? 'FRAME' : 'sticky_note', description: 'Literal <script>window.providerInjection = true</script> provider content.', details: [{ label: 'Width', value: input.provider === 'figma' ? 0 : 200 }, { label: 'Height', value: 240 }, { label: 'Position X', value: -120 }], url: 'https://example.test/resource/node-1' }, { id: 'node-2', title: 'Supporting text', kind: 'TEXT', description: 'Another returned record' }] }] } });
    return route.fulfill({ json: {
      provider: input.provider, title: input.provider === 'github' ? 'fixture/repo' : `${input.provider} project analysis`, description: 'Provider report', url: 'https://example.test/resource', repository: 'fixture/repo', branch: 'main', branches: ['main', 'develop'],
      metrics: [{ label: 'Stars', value: 0 }, { label: 'Commits on this page', value: 1 }], warnings: [], sampleNotice: 'Analysis of up to 100 commits on this page.',
      sections: input.provider === 'github' ? [{ title: 'Commit history', items: [{ id: 'a'.repeat(40), title: 'Implement feature', kind: 'commit', date }] }] : [{ title: input.provider === 'figma' ? 'Pages' : 'Board items', items: [{ id: 'item1', title: input.provider === 'figma' ? 'Login frame' : 'Roadmap sticky note' }] }],
    } });
  });
  await page.goto(options.managedRole ? `/${options.managedRole}/login` : '/login');
  await page.getByLabel('Institutional Email').fill(email);
  await page.getByLabel(/^Password/).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In to Workspace', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${options.managedRole || 'dashboard'}$`));
  const heading = options.managedRole === 'admin' ? 'Admin command center' : options.managedRole === 'teacher' ? 'Teacher workspace' : options.managedRole === 'staff' ? 'Staff workspace' : 'Your projects';
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  return { calls, library, connections, project, milestone, members, githubCommits, settings, accounts };
}

async function readDownload(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The export could not be read.');
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('dashboard refresh replaces milestones and members without retaining removed records', async ({ page }) => {
  const { members } = await workspace(page);
  await page.goto('/dashboard/projects/sq-fixture');
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project delivery', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh dashboard', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Project delivery', exact: true })).toHaveCount(1);

  members.push({ id: 'refresh-member', squad_id: 'sq-fixture', name: 'Refresh member', email: 'refresh@example.test', role: 'Student', skills: [] });
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Refresh member', exact: true })).toHaveCount(1);
  members.splice(0);
  await page.route('**/rest/v1/milestones**', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Refresh member', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project delivery', exact: true })).toHaveCount(0);
});

test('administrators create mentor accounts, update permissions, and save feature controls', async ({ page }) => {
  const { calls, accounts, settings } = await workspace(page, { managedRole: 'admin' });
  await page.getByRole('link', { name: 'Accounts & permissions', exact: true }).click();
  await page.getByRole('link', { name: 'Create managed account', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/create-account$/);
  await expect(page.getByRole('button', { name: 'Create administrator account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create teacher account', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create account', exact: true });
  await create.getByLabel('Full name', { exact: true }).fill('Managed Teacher');
  await create.getByLabel('Account email', { exact: true }).fill('teacher@example.test');
  await create.getByLabel('Institution', { exact: true }).fill('Example University');
  await create.getByLabel('Department', { exact: true }).fill('Computing');
  await create.getByRole('button', { name: 'Create & email account', exact: true }).click();
  await expect(create).toHaveCount(0);
  await page.getByRole('link', { name: 'Manage accounts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Managed Teacher', exact: true })).toBeVisible();
  expect(accounts[0]).toMatchObject({ role: 'teacher', can_mentor: true, email: 'teacher@example.test' });

  await page.getByRole('button', { name: 'Manage account', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Manage account', exact: true });
  await edit.getByRole('combobox', { name: 'Account role', exact: true }).selectOption('student');
  await expect(edit.getByLabel('Eligible for mentor assignment', { exact: true })).toBeDisabled();
  await edit.getByRole('button', { name: 'Save permissions', exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect(accounts[0]).toMatchObject({ role: 'student', can_mentor: false, enabled: true });

  await page.getByRole('link', { name: 'Feature controls', exact: true }).click();
  await page.getByLabel('Allow public account registration', { exact: true }).uncheck();
  await page.getByLabel('GitHub analysis', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save controls', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Feature controls saved.' })).toBeVisible();
  expect(settings.registration_enabled).toBe(false);
  expect(settings.features.github).toBe(false);
  expect(calls.some(call => call.action === 'accounts.update' && call.role === 'student' && call.can_mentor === false)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.dash-main').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
});

test('live admin access overrides cached student metadata for login, account management, and all-project queries', async ({ page }) => {
  const { accounts } = await workspace(page, { managedRole: 'admin', staleRoleMetadata: true });
  await expect(page.locator('.admin-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Create role accounts', exact: true }).click();
  await page.getByRole('button', { name: 'Create staff account', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create account', exact: true });
  await create.getByLabel('Full name', { exact: true }).fill('Managed Staff');
  await create.getByLabel('Account email', { exact: true }).fill('staff@example.test');
  await create.getByLabel('Institution', { exact: true }).fill('Example University');
  await create.getByRole('combobox', { name: 'Account role', exact: true }).selectOption('staff');
  await create.getByRole('button', { name: 'Create & email account', exact: true }).click();
  await expect(create).toHaveCount(0);
  expect(accounts[0]).toMatchObject({ role: 'staff', email: 'staff@example.test' });
  const allProjectsRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname.endsWith('/pms_squads') && !url.searchParams.has('leader_email') && !url.searchParams.has('mentor_id') && !url.searchParams.has('id');
  });
  await page.reload();
  await allProjectsRequest;
  await expect(page.getByRole('heading', { name: 'Create role accounts', exact: true })).toBeVisible();
});

for (const managedRole of ['teacher', 'staff'] as const) test(`${managedRole} login and project links stay in the assigned workspace`, async ({ page }) => {
  await workspace(page, { managedRole });
  await page.getByRole('link', { name: 'Open workspace', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${managedRole}/projects$`));
  await expect(page.getByRole('navigation', { name: 'Administration management', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Open project workspace', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${managedRole}/projects/sq-fixture$`));
});

test('nebula workspace intelligence drills into CI, releases, conventions, and persisted layout preferences', async ({ page }) => {
  const { connections } = await workspace(page, { githubAnalytics: true, githubIntelligence: true });
  await expect(page.locator('.dashboard')).toHaveClass(/workspace-compact/);
  await page.getByRole('button', { name: 'Use comfortable layout', exact: true }).click();
  await page.reload(); await expect(page.getByRole('button', { name: 'Use compact layout', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use compact layout', exact: true }).click();
  connections.push({ provider: 'github', account: 'ci-fixture', mode: 'oauth', updated_at: date, expires_at: null });
  await page.goto('/dashboard/repositories');
  await page.getByLabel('Repository URL or owner/repository').fill('fixture/repo');
  await page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  await page.getByRole('tab', { name: 'Insights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Understand the work behind the commits.', exact: true })).toBeVisible();
  await expect(page.getByText('Complete 14-day history required', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load next 100 commits', exact: true }).click();
  await page.getByRole('tab', { name: 'CI & workflows', exact: true }).click();
  await expect(page.locator('.intel-metric').filter({ hasText: 'Successful runs' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.intel-metric').filter({ hasText: 'Failed runs' }).locator('strong')).toHaveText('2');
  await page.getByLabel('Filter workflow runs').selectOption('failure');
  await expect(page.locator('.intel-records > article')).toHaveCount(2);
  await expect(page.locator('.intel-records')).toContainText('develop');
  await expect(page.locator('.intel-records')).toContainText('timed out');
  await page.getByRole('tab', { name: 'Workflows', exact: true }).click();
  await expect(page.getByText('.github/workflows/ci.yml', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Releases', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect release notes', exact: true }).click();
  const release = page.getByRole('dialog', { name: 'Connected intelligence v1', exact: true });
  await expect(release).toContainText('Release evidence from GitHub.');
  expect(await page.evaluate(() => (window as any).releaseInjection)).toBeUndefined();
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.getByRole('tab', { name: 'Conventions', exact: true }).click();
  await expect(page.getByText('GitHub profile: 75%', { exact: true })).toBeVisible();
  await expect(page.locator('.intel-conventions > div').filter({ hasText: 'Contribution guide' })).toContainText('Not reported');
  await page.getByRole('tab', { name: 'Delivery signals', exact: true }).click();
  await page.locator('.dash-main').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/omnirush/placepms-nebula-intelligence.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.dash-main').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
});

for (const provider of ['figma', 'miro']) test(`${provider} advanced analysis filters metadata and opens safe detailed record inspectors`, async ({ page }) => {
  await workspace(page, { providerDetails: true });
  await page.goto(`/dashboard/${provider}`);
  await page.getByRole('button', { name: /^Access token/ }).click();
  await page.getByLabel(`${provider === 'figma' ? 'Figma' : 'Miro'} access token`).fill(`${provider}-readonly-fixture-token`);
  await page.getByRole('button', { name: 'Verify & connect', exact: true }).click();
  await page.getByLabel(provider === 'figma' ? 'Figma file URL or file key' : 'Miro board URL or board ID').fill(provider === 'figma' ? 'Abc123' : 'board123');
  await page.getByRole('button', { name: provider === 'figma' ? 'Inspect design' : 'Inspect board', exact: true }).click();
  const section = provider === 'figma' ? 'Frames & layers' : 'Board items';
  await page.getByLabel(`Filter ${section} type`).selectOption(provider === 'figma' ? 'FRAME' : 'sticky_note');
  await page.getByLabel(`Search ${section}`).fill('-120');
  await expect(page.locator('.studio-card-grid > article')).toHaveCount(1);
  const name = provider === 'figma' ? 'Login frame' : 'Roadmap sticky note';
  await page.getByRole('button', { name: `Inspect ${name}`, exact: true }).click();
  const inspector = page.getByRole('dialog', { name, exact: true });
  await expect(inspector.locator('.studio-facts > div').filter({ hasText: /^Width/ }).locator('dd')).toHaveText(provider === 'figma' ? '0' : '200');
  await expect(inspector).toContainText('Literal <script>window.providerInjection = true</script> provider content.');
  expect(await page.evaluate(() => (window as any).providerInjection)).toBeUndefined();
  const download = page.waitForEvent('download'); await inspector.getByRole('button', { name: 'Export record', exact: true }).click();
  expect(JSON.parse(await readDownload(await download)).id).toBe('node-1');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await inspector.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  await page.screenshot({ path: `/tmp/omnirush/placepms-nebula-${provider}-inspector.png`, animations: 'disabled' });
});

test('AI-assisted commits are flagged in any inspected repository with scoped counts, evidence, filters, and exports', async ({ page }) => {
  const { githubCommits, calls } = await workspace(page, { githubAnalytics: true });
  githubCommits[0].message += '\n\nCo-authored-by: Claude Opus 4.6 <noreply@anthropic.com>';
  githubCommits[1].message = 'Merge AI feature branch';
  githubCommits[2].message += '\n\nAI-Assisted: true\nAI-Tool: Codex CLI';
  await page.goto('/dashboard/repositories');
  await page.getByRole('button', { name: /^Public repository/ }).click();
  await page.getByLabel('Repository URL or owner/repository').fill('another-owner/ai-evidence');
  await page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  const summary = page.getByRole('status', { name: 'AI-assisted commit summary', exact: true });
  await expect(summary).toContainText('AI-assisted detected');
  await expect(summary).toContainText('1 of 2 loaded commits');
  await expect(page.locator('.github-coverage')).toContainText('Partial history');
  await page.getByRole('button', { name: 'Show AI-assisted commits', exact: true }).click();
  await expect(page.getByLabel('Commit type')).toHaveValue('ai');
  await expect(page.locator('.github-commit')).toHaveCount(1);
  await page.locator('.github-commit .github-ai-evidence > summary').click();
  await expect(page.locator('.github-commit .github-ai-evidence')).toContainText('Co-author trailer');
  await expect(page.locator('.github-commit .github-ai-evidence')).toContainText('Co-authored-by: Claude Opus 4.6 <noreply@anthropic.com>');
  await page.getByRole('button', { name: 'Load next 100 commits', exact: true }).click();
  await expect(summary).toContainText('2 of 3 loaded commits');
  await expect(page.locator('.github-commit')).toHaveCount(2);
  await page.getByLabel('Contributor filter').selectOption('github:bob');
  await expect(page.locator('.github-commit')).toHaveCount(0);
  await expect(summary).toContainText('2 of 3 loaded commits');
  await page.getByLabel('Contributor filter').selectOption('');
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered commits', exact: true }).click();
  const csv = await readDownload(await csvDownload);
  expect(csv).toContain('AI marker status'); expect(csv).toContain('Claude'); expect(csv).toContain('OpenAI Codex');
  expect(csv).not.toContain('Merge AI feature branch');
  await page.getByRole('button', { name: 'Inspect files & diff', exact: true }).first().click();
  const inspector = page.getByRole('dialog', { name: 'Commit aaaaaaa', exact: true });
  await expect(inspector.getByText('AI-assisted', { exact: true })).toBeVisible();
  await inspector.locator('.github-ai-evidence > summary').click();
  await expect(inspector.locator('.github-ai-evidence')).toContainText('noreply@anthropic.com');
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.getByLabel('Commit type').selectOption('all');
  await page.getByLabel('Contributor filter').selectOption('github:bob');
  await page.getByRole('button', { name: 'Inspect files & diff', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.github-ai-evidence')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export analysis', exact: true }).click();
  const exported = JSON.parse(await readDownload(await jsonDownload));
  expect(exported.github.repository.name).toBe('another-owner/ai-evidence');
  expect(exported.github.commits.filter((item: any) => item.aiAssistance.flagged)).toHaveLength(2);
  expect(exported.github.commits.find((item: any) => item.sha === 'b'.repeat(40)).aiAssistance.flagged).toBe(false);
  expect(calls.filter(call => call.action === 'inspect' || call.action === 'commit').every(call => call.target === 'another-owner/ai-evidence')).toBe(true);
  await page.getByLabel('Contributor filter').selectOption('');
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await page.locator('.dash-main').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/omnirush/placepms-ai-analysis-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.dash-main').evaluate(element => { element.scrollTop = 0; });
  await expect(summary).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('img', { name: 'Commit activity graph', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.locator('.dash-main').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  await page.screenshot({ path: '/tmp/omnirush/placepms-ai-analysis-mobile.png', animations: 'disabled' });
});

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
  await page.getByRole('button', { name: /src\/app\.ts/ }).click();
  await expect(page.getByText('+const feature = true;', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Browse repository files' }).click();
  await page.getByRole('button', { name: /README.md/ }).click();
  await expect(page.getByText('# Project', { exact: true })).toBeVisible();
  await expect(page.getByText('Documentation from GitHub', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.getByRole('tab', { name: 'Setup & inspect', exact: true }).click();
  await page.getByRole('button', { name: /^Personal access token/ }).click();
  await page.getByLabel('GitHub access token').fill('fixture-private-readonly-token');
  await page.getByRole('button', { name: 'Verify & connect' }).click();
  await expect(page.getByRole('status')).toContainText('Connected as github-fixture');
  await expect(page.getByLabel('GitHub access token')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('fixture-private-readonly-token');
  await page.getByRole('button', { name: 'Browse my repositories' }).click();
  await expect(page.getByRole('button', { name: 'fixture/private-repo', exact: true })).toBeVisible();
});

test('authorized GitHub analytics show graphs, merge paginated history, filter contributors, and inspect exact commit details', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { calls, connections } = await workspace(page, { githubAnalytics: true });
  connections.push({ provider: 'github', account: 'my-github-account', mode: 'oauth', updated_at: date, expires_at: null });
  await page.goto('/dashboard/integrations?connected=github');
  await page.getByLabel('Commit window').selectOption('7');
  await page.getByRole('tab', { name: 'Resource browser', exact: true }).click();
  await page.getByRole('button', { name: 'fixture/private-repo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Who contributed, what changed, and when' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Commit activity graph', exact: true })).toBeVisible();
  await page.locator('.dash-main').evaluate(element => { element.scrollTop = 0; });
  await expect(page.getByRole('img', { name: 'Commit activity graph', exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: '/tmp/omnirush/placepms-github-analysis.png', animations: 'disabled' });
  await page.getByRole('tab', { name: 'Languages', exact: true }).click();
  await expect(page.getByRole('img', { name: /Language distribution: TypeScript 75.0%/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
  await expect(page.locator('.github-coverage')).toContainText('2 unique commits loaded');
  await expect(page.locator('.github-coverage')).toContainText('Partial history');
  await page.getByRole('button', { name: 'Load next 100 commits', exact: true }).click();
  await expect(page.locator('.github-coverage')).toContainText('3 unique commits loaded');
  await expect(page.locator('.github-coverage')).toContainText('Complete selected history');
  const inspectCalls = calls.filter(call => call.action === 'inspect');
  expect(inspectCalls.every(call => call.access === 'oauth' && call.target === 'fixture/private-repo')).toBe(true);
  expect(inspectCalls[1].until).toBe('2026-01-04T20:00:00.000Z');
  expect(inspectCalls[1].page).toBe(2);
  await page.getByRole('button', { name: 'Analyze changes for loaded commits', exact: true }).click();
  await expect(page.locator('.github-coverage')).toContainText('Change statistics for 3/3 commits');
  await page.getByRole('tab', { name: 'Code changes', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Code additions graph for measured commits', exact: true })).toBeVisible();
  await expect(page.getByText('+36 additions', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Heatmap', exact: true }).click();
  await page.getByLabel('Contributor filter').selectOption('github:alice');
  await page.getByRole('button', { name: '2026-01-04, 1 commits', exact: true }).click();
  await expect(page.locator('.github-commit')).toHaveCount(1);
  await expect(page.getByText('Authored 2026-01-01 09:00:00 UTC · alice@example.test')).toBeVisible();
  await expect(page.getByText('Committed 2026-01-04 10:30:00 UTC')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered commits', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('github-commits.csv');
  const inspectButton = page.getByRole('button', { name: 'Inspect files & diff', exact: true });
  await inspectButton.scrollIntoViewIfNeeded();
  const beforeInspection = await page.locator('.dash-main').evaluate(element => element.scrollTop);
  await inspectButton.click();
  await expect(page.getByRole('dialog', { name: /^Commit/ })).toBeVisible();
  expect(await page.locator('.dash-main').evaluate(element => element.scrollTop)).toBe(beforeInspection);
  await expect(page.locator('#github-commit-detail')).toContainText('Committed by Bob Example (@bob)');
  await page.locator('#github-commit-detail').getByRole('button', { name: /src\/app\.ts/ }).click();
  await expect(page.getByText('+const feature = true;', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Identity & verification', exact: true }).click();
  await expect(page.getByText('alice@example.test', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Files & diff', exact: true }).click();
  await page.screenshot({ path: '/tmp/omnirush/placepms-commit-inspector.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await expect(inspectButton).toBeFocused();
  await page.getByRole('tab', { name: 'Contributors', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Contributor breakdown' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Alice Example' })).toContainText('66.7%');
  await page.getByRole('tab', { name: 'Repository', exact: true }).click();
  await expect(page.getByText('MIT License', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Pull requests', exact: true }).click();
  await expect(page.getByRole('link', { name: '#4 Feature pull request', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
  await expect(page.getByLabel('Contributor filter')).toBeHidden();
  await page.getByRole('button', { name: 'Show analysis controls', exact: true }).click();
  await expect(page.getByLabel('Contributor filter')).toHaveValue('github:alice');
  await page.getByLabel('Contributor filter').selectOption('');
  await page.getByRole('button', { name: 'Hide analysis controls', exact: true }).click();
  await expect(page.getByLabel('Contributor filter')).toBeHidden();
  expect(await page.locator('.dash-main').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  await page.locator('.dash-main').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/omnirush/placepms-github-analysis-mobile.png', animations: 'disabled' });
  await expect(page.getByRole('img', { name: 'Commit activity graph', exact: true })).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

test('focused studio views support keyboard tabs, library inspection, structured report previews, and device details', async ({ page }) => {
  const { library } = await workspace(page);
  const projectsTab = page.getByRole('tab', { name: 'Projects & deadlines', exact: true });
  await projectsTab.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Focus & readiness', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Workspace readiness', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Research', exact: true }).click();
  await page.getByRole('button', { name: 'Read Saved academic reference', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Saved academic reference', exact: true });
  await expect(reader.getByText('A reviewed reference', { exact: true })).toBeVisible();
  await reader.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.screenshot({ path: '/tmp/omnirush/placepms-research-studio.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Delete Saved academic reference', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete library entry', exact: true }).getByRole('button', { name: 'Delete entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved academic reference', exact: true })).toHaveCount(0);
  expect(library.some(entry => entry.id === 'reference-1')).toBe(false);
  await page.goto('/dashboard/blackbook');
  await page.getByRole('button', { name: /Methodology/ }).click();
  await page.getByLabel('Methodology', { exact: true }).fill('A documented and reproducible evaluation.');
  await page.screenshot({ path: '/tmp/omnirush/placepms-blackbook-studio.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Generate report from saved records', exact: true }).click();
  await page.getByRole('tab', { name: 'Presentation preview', exact: true }).click();
  await expect(page.locator('#blackbook-print').getByRole('cell', { name: 'Project delivery', exact: true })).toBeVisible();
  await expect(page.locator('#blackbook-print').getByText('A documented and reproducible evaluation.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.goto('/dashboard/sessions');
  await page.getByRole('button', { name: 'View Firefox on Windows session details', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Firefox on Windows', exact: true });
  await expect(details.getByText('192.0.2.10', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.screenshot({ path: '/tmp/omnirush/placepms-session-studio.png', animations: 'disabled' });
  await page.getByRole('tab', { name: 'Other devices', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chrome on Linux', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Firefox on Windows', exact: true })).toBeVisible();
});

test('project and portfolio pagination expose every record without an unbounded card list', async ({ page }) => {
  const { project } = await workspace(page);
  const projects = Array.from({ length: 9 }, (_, index) => ({ ...project, id: index ? `page-project-${index}` : project.id, title: `Focused project ${String(index + 1).padStart(2, '0')}` }));
  await page.route('**/rest/v1/pms_squads**', route => route.fulfill({ json: projects }));
  await page.goto('/dashboard/projects');
  await expect(page.locator('.dash-project-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Next projects page', exact: true }).click();
  await expect(page.locator('.dash-project-card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Focused project 09', exact: true })).toBeVisible();
  await page.getByLabel('Search projects').fill('Focused project 08');
  await expect(page.locator('.dash-project-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Career', exact: true }).click();
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await page.getByRole('tab', { name: 'Project showcase', exact: true }).click();
  await expect(page.locator('.dash-project-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Next projects page', exact: true }).click();
  await expect(page.locator('.dash-project-card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Focused project 09', exact: true })).toBeVisible();
});

test('GitHub change analysis preserves partial results and retries only missing statistics', async ({ page }) => {
  const { calls } = await workspace(page, { githubAnalytics: true, failStatsOnce: true });
  await page.goto('/dashboard/repositories');
  await page.getByRole('button', { name: /^Public repository/ }).click();
  await page.getByLabel('Repository URL or owner/repository').fill('fixture/private-repo');
  await page.getByRole('button', { name: 'Inspect repository', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze changes for loaded commits', exact: true }).click();
  await expect(page.locator('.github-coverage')).toContainText('Change statistics for 1/2 commits');
  await expect(page.getByRole('alert')).toContainText('rate limit');
  await page.getByRole('button', { name: 'Analyze changes for loaded commits', exact: true }).click();
  await expect(page.locator('.github-coverage')).toContainText('Change statistics for 2/2 commits');
  const requests = calls.filter(call => call.action === 'commit-stats');
  expect(requests[1].shas).toEqual(['b'.repeat(40)]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.dashboard')).toHaveClass(/dashboard-dark/);
  for (const tab of ['Activity', 'Contributors', 'Commits', 'Repository']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `overflow in GitHub ${tab}`).toBe(false);
  }
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
    await page.getByRole('tab', { name: 'Resource browser', exact: true }).click();
    await expect(page.getByRole('button', { name: provider === 'github' ? 'fixture/private-repo' : 'My connected resource', exact: true })).toBeVisible();
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
  await page.getByRole('tab', { name: 'Setup & inspect', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await page.getByLabel('Search registered users').fill('Team Member');
  await page.getByRole('button', { name: 'Invite to project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Team Member' })).toBeVisible();
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
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
  await page.getByRole('button', { name: /Methodology/, exact: false }).click();
  await page.getByLabel('Methodology', { exact: true }).fill('We evaluated the actual project implementation.');
  await page.getByRole('button', { name: 'Generate report from saved records' }).click();
  await expect(page.getByRole('textbox', { name: 'Generated report', exact: true })).toHaveValue(/We evaluated the actual project implementation\./);
  await expect(page.getByRole('textbox', { name: 'Generated report', exact: true })).toHaveValue(/Saved academic reference/);
  await expect(page.getByRole('textbox', { name: 'Generated report', exact: true })).toHaveValue(/New reference/);
  await expect(page.getByRole('textbox', { name: 'Generated report', exact: true })).toHaveValue(/Project delivery/);
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
  await page.getByRole('tab', { name: 'Focus & readiness', exact: true }).click();
  await page.getByRole('link', { name: '1 Overdue', exact: true }).click();
  await expect(page.getByLabel('Filter milestone status')).toHaveValue('overdue');
  await expect(page.getByRole('heading', { name: 'Project delivery', exact: true })).toBeVisible();
  await page.getByLabel('Filter milestone status').selectOption('today');
  await expect(page.getByRole('heading', { name: 'No milestones to show' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Board view', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Project delivery', exact: true }).click();
  await page.getByRole('tab', { name: 'In review', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await page.getByLabel('Search registered users').fill('Team Member');
  await page.getByRole('button', { name: 'Invite to project', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Team Member', exact: true }).click();
  await page.getByLabel('Team role').fill('Design lead'); await page.getByLabel('Skills (comma-separated)').fill('Figma, Research');
  await page.getByRole('button', { name: 'Save member', exact: true }).click();
  await expect(page.getByText('member@example.test · Design lead')).toBeVisible();
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
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
  await page.getByRole('button', { name: /Methodology/ }).click();
  await expect(page.getByLabel('Methodology', { exact: true })).toBeEnabled();
  await page.getByLabel('Methodology', { exact: true }).fill('Our saved methodology survives reload.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await page.reload();
  await page.getByRole('button', { name: /Methodology/ }).click();
  await expect(page.getByRole('textbox', { name: 'Methodology', exact: true })).toHaveValue('Our saved methodology survives reload.');
  await page.getByRole('button', { name: /Abstract/ }).click();
  await page.getByLabel('Abstract', { exact: true }).fill('Updated project abstract.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  expect(library.filter(item => (item.tags as string[]).includes('blackbook-draft'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Generate report from saved records' }).click();
  await expect(page.getByRole('textbox', { name: 'Generated report', exact: true })).toHaveValue(/Updated project abstract/);
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
  await workspace(page);
  await expect(page.locator('.dashboard')).toHaveClass(/dashboard-dark/);
  await expect(page.getByRole('img', { name: '0% of milestones completed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause workspace animations', exact: true }).click();
  expect(await page.locator('.dash-momentum-orbit').evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play workspace animations', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play workspace animations', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.locator('.dashboard')).toHaveClass(/dashboard-collapsed/);
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.locator('.dash-sidebar')).toHaveCSS('width', '258px');
  await page.screenshot({ path: '/tmp/omnirush/placepms-dashboard-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ['', 'projects', 'tasks', 'mentorship', 'calendar', 'documents', 'research', 'resources', 'blackbook', 'integrations', 'repositories', 'figma', 'miro', 'sessions', 'portfolio']) {
    await page.goto(`/dashboard${slug ? `/${slug}` : ''}`);
    await expect(page.locator('.dashboard')).toHaveClass(/dashboard-dark/);
    await expect(page.locator('.dash-main h1')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading dashboard' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `overflow on ${slug || 'overview'}`).toBe(false);
    if (!slug) await page.screenshot({ path: '/tmp/omnirush/placepms-dashboard-mobile.png', fullPage: true, animations: 'disabled' });
  }
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export portfolio', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('placepms-portfolio.html');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('.dashboard')).not.toHaveClass(/dashboard-dark/);
  await page.reload();
  await expect(page.locator('.dashboard')).not.toHaveClass(/dashboard-dark/);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play workspace animations', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
