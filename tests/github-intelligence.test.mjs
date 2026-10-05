import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubAutomationSignals, githubDeliverySignals } from '../src/lib/github-intelligence.ts';
import { inspectGitHub, inspectDesign } from '../server/providers.ts';
import { mergeGitHubAnalysis } from '../src/lib/github-analytics.ts';

const alice = { key: 'github:alice', name: 'Alice', login: 'alice', email: 'alice@example.test', url: '' };
const bob = { ...alice, key: 'github:bob', name: 'Bob', login: 'bob' };
const commit = (id, time, author = alice, extra = {}) => ({ sha: id.repeat(40), message: 'Saved change', author, committer: bob, authoredAt: time, committedAt: time, parents: [], verified: false, ...extra });
const analysis = (commits, extra = {}) => ({ repository: { name: 'team/repo' }, branch: 'main', window: { since: '2025-12-17T00:00:00Z', until: '2026-01-15T16:00:00Z', days: 30 }, pages: [1], commitsAvailable: true, commits, ...extra });

test('delivery signals use dated evidence, full calendar scope, median intervals, and measured changes', () => {
  const history = analysis([
    commit('a', '2026-01-04T01:00:00Z', alice, { message: 'Change\n\nAI-Assisted: true', stats: { additions: 2, deletions: 1, files: [{ name: 'app.ts', additions: 2, deletions: 1 }], filesTruncated: false } }),
    commit('b', '2026-01-09T09:00:00Z'), commit('c', '2026-01-10T10:00:00Z', bob), commit('d', '2026-01-11T11:00:00Z', bob), commit('e', 'invalid'),
  ]);
  const result = githubDeliverySignals(history);
  assert.equal(result.loaded, 5); assert.equal(result.dated, 4); assert.equal(result.missingDates, 1);
  assert.equal(result.longestStreak, 3); assert.equal(result.activeDays, 4); assert.equal(result.windowDays, 30);
  assert.equal(result.medianGapHours, 25); assert.equal(result.commitsPerCalendarDay, 4 / 30);
  assert.equal(result.recentWeek, 3); assert.equal(result.precedingWeek, 1); assert.equal(result.trendPercent, 200);
  assert.equal(result.topShare, 60); assert.equal(result.aiMarked, 1); assert.equal(result.measured, 1);
  assert.equal(result.additions, 2); assert.equal(result.deletions, 1);
  assert.equal(result.changedFiles[0].name, 'app.ts');
  const selected = githubDeliverySignals(history, bob.key); assert.equal(selected.loaded, 2); assert.equal(selected.topShare, 100); assert.equal(selected.additions, null);
});

test('incomplete or short histories cannot imply a full trend, while empty and unavailable data remain distinct', () => {
  const commits = [commit('a', '2026-01-14T10:00:00Z')];
  assert.equal(githubDeliverySignals(analysis(commits, { nextPage: 2 })).trendCovered, false);
  assert.equal(githubDeliverySignals(analysis(commits, { historyTruncated: true })).trendPercent, null);
  assert.equal(githubDeliverySignals(analysis(commits, { window: { since: '2026-01-09T00:00:00Z', until: '2026-01-15T10:00:00Z', days: 7 } })).trendCovered, false);
  const empty = githubDeliverySignals(analysis([])); assert.equal(empty.available, true); assert.equal(empty.longestStreak, 0); assert.equal(empty.medianGapHours, null); assert.equal(empty.additions, null);
  assert.equal(githubDeliverySignals(analysis([], { commitsAvailable: false })).available, false);
});

test('workflow signals separate failed, cancelled, active, and unavailable results and reject invalid durations', () => {
  const intelligence = { coverage: { runs: { available: true } }, runs: [
    { status: 'completed', conclusion: 'success', startedAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:06:00Z' },
    { status: 'completed', conclusion: 'failure', startedAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:04:00Z' },
    { status: 'completed', conclusion: 'cancelled', startedAt: 'invalid', updatedAt: '2026-01-01T10:04:00Z' },
    { status: 'completed', conclusion: 'skipped', startedAt: '2026-01-02T10:00:00Z', updatedAt: '2026-01-01T10:04:00Z' },
    { status: 'completed', conclusion: 'timed_out', startedAt: '', updatedAt: '' },
    { status: 'queued', conclusion: '', startedAt: '', updatedAt: '' },
  ] };
  const result = githubAutomationSignals(intelligence);
  assert.equal(result.successful, 1); assert.equal(result.failed, 2); assert.equal(result.completed, 5); assert.equal(result.active, 1); assert.equal(result.medianObservedMinutes, 5);
  assert.equal(githubAutomationSignals().successful, null);
  assert.equal(githubAutomationSignals({ ...intelligence, coverage: { runs: { available: false } } }).failed, null);
  assert.equal(githubAutomationSignals({ ...intelligence, runs: [] }).successful, 0);
});

test('GitHub intelligence uses bounded authorized endpoints once and survives subsequent commit pages', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const parsed = new URL(url); urls.push(parsed); assert.equal(init.headers.get('Authorization'), 'Bearer scoped-test-token');
    if (parsed.pathname.endsWith('/actions/workflows')) { assert.equal(parsed.searchParams.get('per_page'), '30'); return Response.json({ workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', html_url: 'https://github.com/team/repo/actions/workflows/ci.yml' }] }); }
    if (parsed.pathname.endsWith('/actions/runs')) { assert.equal(parsed.searchParams.get('per_page'), '20'); return Response.json({ workflow_runs: [{ id: 2, name: 'CI', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: 'a'.repeat(40) }] }, { headers: { link: '<https://api.github.com/next>; rel="next"' } }); }
    if (parsed.pathname.endsWith('/releases')) { assert.equal(parsed.searchParams.get('per_page'), '10'); return Response.json([{ id: 3, tag_name: 'v1.0', name: 'First release', body: '<script>literal notes</script>', assets: [], author: { login: 'alice' } }]); }
    if (parsed.pathname.endsWith('/community/profile')) return Response.json({ health_percentage: 75, files: { readme: { html_url: 'https://github.com/team/repo/blob/main/README.md' }, license: null } });
    if (parsed.pathname === '/repos/team/repo') return Response.json({ full_name: 'team/repo', default_branch: 'main' });
    return Response.json([]);
  });
  const input = { target: 'team/repo', until: '2026-01-15T16:00:00Z' }; const credential = { mode: 'token', accessToken: 'scoped-test-token' };
  const first = await inspectGitHub(input, credential);
  assert.equal(first.github.intelligence.workflows[0].name, 'CI'); assert.equal(first.github.intelligence.coverage.runs.hasMore, true);
  assert.equal(first.github.intelligence.releases[0].body, '<script>literal notes</script>');
  assert.equal(first.github.intelligence.standards.find(item => item.name === 'README').present, true);
  assert.equal(first.github.intelligence.standards.find(item => item.name === 'License').present, false);
  assert.ok(!JSON.stringify(first).includes('scoped-test-token'));
  const before = urls.filter(url => /actions|releases|community/.test(url.pathname)).length;
  const next = await inspectGitHub({ ...input, page: 2 }, credential);
  assert.equal(urls.filter(url => /actions|releases|community/.test(url.pathname)).length, before);
  assert.deepEqual(mergeGitHubAnalysis(first.github, next.github).intelligence, first.github.intelligence);
});

test('optional GitHub intelligence access failures retain useful commit data and explicit unavailable coverage', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (/actions|releases|community/.test(path)) return Response.json({ access_token: 'never-expose' }, { status: 403 });
    if (path.endsWith('/commits')) return Response.json([{ sha: 'a'.repeat(40), commit: { message: 'Saved work', author: { name: 'Alice', date: '2026-01-01T00:00:00Z' } } }]);
    if (path === '/repos/team/repo') return Response.json({ full_name: 'team/repo', default_branch: 'main' });
    return Response.json([]);
  });
  const result = await inspectGitHub({ target: 'team/repo' });
  assert.equal(result.github.commits.length, 1);
  for (const source of Object.values(result.github.intelligence.coverage)) assert.equal(source.available, false);
  assert.equal(result.warnings.length, 4); assert.ok(!JSON.stringify(result).includes('never-expose'));
});

test('Figma and Miro detailed metadata preserve zero, negative, missing, and literal provider values', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path.includes('/versions')) return Response.json({ versions: [] });
    if (path.includes('/comments')) return Response.json({ comments: [] });
    if (path.includes('/v1/files/')) return Response.json({ name: 'Design', document: { children: [{ id: 'page', name: 'Page', children: [{ id: 'node', name: 'Frame', type: 'FRAME', visible: false, absoluteBoundingBox: { width: 0, height: 240 }, layoutMode: 'VERTICAL' }] }] }, components: { node: { key: 'component-key', name: 'Button', description: '<script>literal</script>' } } });
    if (path.endsWith('/items')) return Response.json({ data: [{ id: 'sticky', type: 'sticky_note', position: { x: -120, y: 0 }, geometry: { width: 200 }, data: { content: '<p>Actual planning content</p>' } }] });
    return Response.json({ name: 'Board' });
  });
  const credential = { mode: 'token', accessToken: 'provider-test-token' };
  const figma = await inspectDesign('figma', { target: 'file123' }, credential); const layer = figma.sections.find(item => item.title === 'Frames & layers').items[0];
  assert.equal(layer.details.find(item => item.label === 'Width').value, 0); assert.equal(layer.details.find(item => item.label === 'Visibility').value, 'Hidden');
  assert.equal(figma.sections.find(item => item.title === 'Components').items[0].description, '<script>literal</script>');
  const miro = await inspectDesign('miro', { target: 'board123' }, credential); const item = miro.sections[0].items[0];
  assert.equal(item.details.find(field => field.label === 'Position X').value, -120); assert.equal(item.details.find(field => field.label === 'Position Y').value, 0);
  assert.equal(item.details.find(field => field.label === 'Height').value, 'Not provided'); assert.equal(item.description, 'Actual planning content');
});
