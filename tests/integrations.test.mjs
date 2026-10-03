import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, repositoryPath, providerResource, filePath } from '../server/integration-security.ts';
import { providerRequest, inspectGitHub, repositoryFiles, commitDetail, inspectDesign, listResources } from '../server/providers.ts';
import { createIntegrationsHandler } from '../server/integrations.ts';
import { buildBlackbook, reportHtml } from '../src/lib/workspace-library.ts';
import { emptyDashboard } from '../src/lib/dashboard-data.ts';
import { createServer } from 'node:http';

const env = { SUPABASE_SECRET_KEY: 'isolated-encryption-test-key' };
test('integration tokens are encrypted, randomized, and bound to their owner and provider', () => {
  const first = seal('a-private-provider-token', 'user-one:github', env);
  const second = seal('a-private-provider-token', 'user-one:github', env);
  assert.notEqual(first, second);
  assert.ok(!first.includes('a-private-provider-token'));
  assert.equal(unseal(first, 'user-one:github', env), 'a-private-provider-token');
  assert.throws(() => unseal(first, 'user-two:github', env));
  assert.throws(() => unseal(first, 'user-one:figma', env));
  assert.throws(() => unseal(first, 'user-one:github', { SUPABASE_SECRET_KEY: 'different-key' }));
  const parts = first.split('.'); parts[2] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => unseal(parts.join('.'), 'user-one:github', env));
});

test('provider resource parsers reject credential-bearing URLs, foreign hosts and traversal', () => {
  assert.equal(repositoryPath('https://github.com/team/repo.git'), 'team/repo');
  assert.equal(repositoryPath('team/repo'), 'team/repo');
  for (const url of ['https://evil.test/team/repo', 'https://github.com.evil.test/team/repo', 'https://token@github.com/team/repo', 'http://github.com/team/repo', 'team/..', 'team/repo/tree/main', '//evil.test/repo']) assert.throws(() => repositoryPath(url));
  assert.equal(providerResource('figma', 'https://www.figma.com/design/Abc123/Design'), 'Abc123');
  assert.equal(providerResource('miro', 'https://miro.com/app/board/uXabc123=/'), 'uXabc123=');
  assert.throws(() => providerResource('miro', 'https://evil.test/app/board/abc123'));
  assert.throws(() => filePath('../secrets')); assert.throws(() => filePath('foo\\bar'));
  assert.equal(filePath('src/My file.ts'), 'src/My%20file.ts');
});

test('provider requests never send credentials to another host or follow redirects', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url: String(url), options }); return new Response('{}', { headers: { 'content-type': 'application/json' } }); });
  await assert.rejects(providerRequest('github', 'https://evil.test/token', { accessToken: 'private', mode: 'token' }), { status: 400 });
  assert.equal(calls.length, 0);
  await providerRequest('figma', '/v1/me', { accessToken: 'private', mode: 'token' });
  assert.equal(calls[0].options.headers.get('X-Figma-Token'), 'private');
  assert.equal(calls[0].options.headers.get('Authorization'), null);
  assert.equal(calls[0].options.redirect, 'error');
  await providerRequest('github', '/repos/example/public');
  assert.equal(calls[1].options.headers.get('Authorization'), null);
});

test('provider failures expose useful permission and rate-limit messages without leaking token responses', async t => {
  for (const [status, expected] of [[401, /expired|invalid/], [403, /denied access/], [404, /not accessible/], [429, /rate limit/]]) {
    const mocked = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ access_token: 'do-not-leak' }), { status }));
    await assert.rejects(providerRequest('github', '/user', { accessToken: 'private', mode: 'token' }), error => error.status === status && expected.test(error.message) && !error.message.includes('do-not-leak'));
    mocked.mock.restore();
  }
});

test('GitHub analysis reports bounded real samples, branch selection, pagination, and partial failures', async t => {
  const commits = [
    { sha: 'a'.repeat(40), html_url: 'https://github.com/team/repo/commit/a', author: { login: 'alice' }, commit: { message: 'Implement login\nDetailed body', author: { name: 'Alice', date: '2026-10-01T12:00:00Z' } } },
    { sha: 'b'.repeat(40), author: { login: 'alice' }, commit: { message: 'Add tests', author: { name: 'Alice', date: '2026-10-01T18:00:00Z' } } },
  ];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/commits')) { assert.equal(new URL(url).searchParams.get('sha'), 'feature/login'); return Response.json(commits, { headers: { link: '<https://api.github.com/next>; rel="next"' } }); }
    if (path.endsWith('/languages')) return Response.json({ TypeScript: 1200 });
    if (path.endsWith('/branches')) return Response.json([{ name: 'main' }, { name: 'feature/login' }]);
    if (path.endsWith('/pulls')) return Response.json({}, { status: 403 });
    if (path.endsWith('/issues')) return Response.json([{ id: 1, title: 'Fix build' }, { id: 2, title: 'A pull', pull_request: {} }]);
    if (path.endsWith('/contributors')) return Response.json([{ id: 1, login: 'alice', contributions: 200 }]);
    return Response.json({ full_name: 'team/repo', private: true, default_branch: 'main', stargazers_count: 0, html_url: 'https://github.com/team/repo' });
  });
  const report = await inspectGitHub({ target: 'team/repo', branch: 'feature/login', days: 30 }, { accessToken: 'token', mode: 'token' });
  assert.equal(report.nextPage, 2);
  assert.equal(report.metrics.find(item => item.label === 'Commits on this page').value, 2);
  assert.equal(report.metrics.find(item => item.label === 'Authors on this page').value, 1);
  assert.equal(report.metrics.find(item => item.label === 'Stars').value, 0);
  assert.equal(report.sections.find(item => item.title === 'Open issues').items.length, 1);
  assert.equal(report.sections.find(item => item.title === 'Commit history').items[0].title, 'Implement login');
  assert.match(report.sampleNotice, /up to 100/);
  assert.match(report.warnings[0], /Pull requests/);
});

test('file and commit inspectors handle binary files and bounded diffs', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/contents/')) return Response.json({ type: 'file', path: 'image.bin', size: 3, encoding: 'base64', content: Buffer.from([0, 1, 2]).toString('base64') });
    return Response.json({ sha: 'a'.repeat(40), commit: { message: 'Change file', author: { name: 'Author' } }, stats: { additions: 3, deletions: 1 }, files: [{ filename: 'app.ts', status: 'modified', additions: 3, deletions: 1, patch: 'x'.repeat(60000) }] });
  });
  assert.equal((await repositoryFiles({ target: 'team/repo', path: 'image.bin' })).binary, true);
  const commit = await commitDetail({ target: 'team/repo', sha: 'a'.repeat(40) });
  assert.equal(commit.files[0].patch.length, 50000);
  assert.equal(commit.additions, 3);
});

test('Figma inspections handle design structure and missing optional scopes', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/versions')) return Response.json({}, { status: 403 });
    if (String(url).includes('/comments')) return Response.json({ comments: [{ id: 'c1', message: '<script>safe text</script>', user: { handle: 'Designer' } }] });
    return Response.json({ name: 'Mobile design', version: 'v1', document: { children: [{ id: '0:1', name: 'Screens', children: [{ id: '1:1', name: 'Login', type: 'FRAME' }] }] }, components: {} });
  });
  const report = await inspectDesign('figma', { target: 'https://figma.com/design/Abc123/App' }, { mode: 'token', accessToken: 'private' });
  assert.equal(report.sections[1].items[0].title, 'Login');
  assert.equal(report.metrics[0].value, 1);
  assert.match(report.warnings[0], /Version history/);
});

test('Miro board listing and inspection preserve pagination and count only the returned page', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/items')) return Response.json({ data: [{ id: '1', type: 'sticky_note', data: { content: '<p>Plan & test</p>' } }], cursor: 'next-items' });
    if (new URL(url).pathname === '/v2/boards') return Response.json({ data: [{ id: 'board123', name: 'Roadmap', viewLink: 'https://miro.com/app/board/board123/' }], cursor: 'next-boards' });
    return Response.json({ name: 'Roadmap', owner: { name: 'Owner' } });
  });
  const credential = { mode: 'oauth', accessToken: 'private' };
  assert.equal((await listResources('miro', {}, credential)).nextCursor, 'next-boards');
  const report = await inspectDesign('miro', { target: 'board123' }, credential);
  assert.equal(report.nextCursor, 'next-items');
  assert.equal(report.sections[0].items[0].description, 'Plan & test');
  assert.equal(report.metrics[0].value, 1);
});

test('OAuth callback rejects forged state before any provider exchange', async t => {
  const server = createServer(createIntegrationsHandler({ APP_URL: 'http://localhost:5173' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/integrations?action=callback&provider=github&state=${'x'.repeat(43)}&code=fake`, { redirect: 'manual', headers: { Cookie: `placepms_oauth_github=${'y'.repeat(43)}` } });
  assert.equal(response.status, 303);
  assert.match(response.headers.get('location'), /connection_error=Authorization/);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('reports use only the selected project and escape executable HTML in print exports', () => {
  const project = { id: 'p1', title: '<script>alert(1)</script>', leader_email: 'owner@example.test', summary: 'Actual summary' };
  const data = { ...emptyDashboard, squads: [project], milestones: [{ id: 'm1', squad_id: 'p1', name: 'Delivery', phase: 'Build', status: 'APPROVED' }, { id: 'm2', squad_id: 'p2', name: 'Private other project', phase: 'Build', status: 'PENDING' }] };
  const report = buildBlackbook(project, data, { Methodology: 'Authored methodology' }, []);
  assert.match(report, /Actual summary/); assert.match(report, /Authored methodology/);
  assert.ok(!report.includes('Private other project'));
  assert.ok(!reportHtml(project.title, report).includes('<script>'));
});
