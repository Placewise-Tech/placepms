import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectGitHub, githubCommitStatsPage } from '../server/providers.ts';
import { applyGitHubStats, githubActivity, githubCommitCsv, githubContributors, githubCoverageComplete, mergeGitHubAnalysis } from '../src/lib/github-analytics.ts';

const alice = { key: 'github:alice', name: 'Alice', login: 'alice', email: 'alice@example.test', url: 'https://github.com/alice' };
const bob = { key: 'github:bob', name: 'Bob', login: 'bob', email: 'bob@example.test', url: 'https://github.com/bob' };
const commit = (letter, author, time, extra = {}) => ({ sha: letter.repeat(40), message: `Change ${letter}`, url: `https://github.com/team/repo/commit/${letter.repeat(40)}`, author, committer: bob, authoredAt: '2026-01-01T10:00:00Z', committedAt: time, parents: [], verified: false, verificationReason: 'unsigned', ...extra });
const analysis = (commits, extra = {}) => ({ repository: { name: 'team/repo', defaultBranch: 'main', visibility: 'Private', archived: false, createdAt: '2025-01-01T00:00:00Z', pushedAt: '2026-01-04T18:00:00Z', sizeKb: 10, license: '', topics: [], stars: 0, forks: 0, openIssuesAndPulls: 0 }, branch: 'feature', window: { days: 7, since: '2025-12-29T00:00:00Z', until: '2026-01-04T20:00:00Z' }, pages: [1], commitsAvailable: true, commits, languages: [], branches: [], contributors: [], pulls: [], issues: [], ...extra });
const stats = (additions, deletions) => ({ additions, deletions, files: [{ name: 'src/app.ts', status: 'modified', additions, deletions }], filesTruncated: false });

test('activity uses committer timestamps in UTC, fills quiet days, and distinguishes unknown change totals', () => {
  const history = analysis([
    commit('a', alice, '2026-01-03T23:30:00-02:00', { verified: true, stats: stats(12, 3) }),
    commit('b', alice, '2026-01-04T09:00:00Z', { parents: ['a'.repeat(40), 'c'.repeat(40)] }),
    commit('c', bob, '2026-01-02T15:00:00Z', { stats: stats(0, 2) }),
    commit('d', bob, 'invalid-time'),
  ]);
  const activity = githubActivity(history);
  assert.equal(activity.commits.length, 4);
  assert.equal(activity.activeDays, 2);
  assert.equal(activity.timeline.length, 7);
  assert.equal(activity.timeline.find(day => day.date === '2026-01-03').commits, 0);
  assert.equal(activity.timeline.find(day => day.date === '2026-01-04').commits, 2);
  assert.equal(activity.hours[1], 1);
  assert.equal(activity.hours[9], 1);
  assert.equal(activity.weekdays[0], 2);
  assert.equal(activity.missingDates, 1);
  assert.equal(activity.merges, 1);
  assert.equal(activity.verified, 1);
  assert.equal(activity.measuredCommits, 2);
  assert.equal(activity.additions, 12);
  assert.equal(activity.deletions, 5);
  assert.equal(activity.changedFiles[0].commits, 2);
  const filtered = githubActivity(history, alice.key);
  assert.equal(filtered.commits.length, 2);
  assert.equal(filtered.measuredCommits, 1);
  assert.equal(filtered.deletions, 3);
  const contributors = githubContributors(history.commits);
  assert.equal(contributors.find(row => row.identity.key === alice.key).activeDays, 1);
  assert.equal(contributors.find(row => row.identity.key === alice.key).lastCommit, '2026-01-04T09:00:00.000Z');
  assert.equal(contributors.reduce((sum, row) => sum + row.commits, 0), 4);
});

test('pagination retains prior commits and measured stats, deduplicates overlapping SHAs, and requires matching scope', () => {
  const first = analysis([commit('a', alice, '2026-01-04T10:00:00Z', { stats: stats(10, 1) })], { nextPage: 2 });
  const next = analysis([commit('a', alice, '2026-01-04T10:00:00Z'), commit('b', bob, '2026-01-02T10:00:00Z')], { pages: [2] });
  assert.equal(githubCoverageComplete(first), false);
  const merged = mergeGitHubAnalysis(first, next);
  assert.equal(merged.commits.length, 2);
  assert.equal(merged.commits[0].stats.additions, 10);
  assert.deepEqual(merged.pages, [1, 2]);
  assert.equal(githubCoverageComplete(merged), true);
  assert.equal(githubCoverageComplete(next), false);
  assert.equal(githubCoverageComplete({ ...merged, historyTruncated: true }), false);
  assert.throws(() => mergeGitHubAnalysis(first, { ...next, branch: 'different' }), /analysis changed/);
  assert.throws(() => mergeGitHubAnalysis(first, { ...next, window: { ...next.window, until: '2026-01-05T00:00:00Z' } }), /analysis changed/);
  assert.throws(() => mergeGitHubAnalysis(first, { ...next, commitsAvailable: false }), /could not be loaded/);
  const enriched = applyGitHubStats(merged, { commits: [{ sha: 'b'.repeat(40), stats: stats(0, 0) }], errors: [] });
  assert.equal(githubActivity(enriched).measuredCommits, 2);
  assert.equal(githubActivity(enriched).additions, 10);
});

test('all-history trends include old commits and aggregate monthly while the heatmap stays bounded', () => {
  const history = analysis([commit('a', alice, '2020-01-04T10:00:00Z'), commit('b', bob, '2026-01-02T10:00:00Z')], { window: { days: 'all', since: null, until: '2026-01-04T20:00:00Z' } });
  const activity = githubActivity(history);
  assert.equal(activity.interval, 'month');
  assert.equal(activity.timeline[0].date, '2020-01-01');
  assert.equal(activity.timeline.reduce((sum, point) => sum + point.commits, 0), 2);
  assert.ok(activity.heatmap.length <= 371);
  assert.equal(activity.heatmap.reduce((sum, point) => sum + point.commits, 0), 1);
});

test('commit exports retain distinct author/committer dates and neutralize spreadsheet formulas', () => {
  const content = githubCommitCsv([commit('a', alice, '2026-01-04T10:00:00Z', { message: '=HYPERLINK("bad")\nDetailed text' })]);
  assert.match(content, /Author name/);
  assert.match(content, /Committer name/);
  assert.ok(content.includes('"\'=HYPERLINK(""bad"")\nDetailed text"'));
  assert.match(content, /2026-01-01T10:00:00Z/);
  assert.match(content, /2026-01-04T10:00:00Z/);
  assert.match(content, /"false"/);
});

test('GitHub reports normalize identities, merges, signatures and a stable all-history snapshot through OAuth', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    url = new URL(url); requests.push(url);
    assert.equal(init.headers.get('Authorization'), 'Bearer private-oauth-token');
    if (url.pathname.endsWith('/commits')) return Response.json([{ sha: 'a'.repeat(40), html_url: 'https://github.com/team/repo/commit/a', author: { login: 'alice' }, committer: { login: 'web-flow' }, parents: [{ sha: 'b'.repeat(40) }, { sha: 'c'.repeat(40) }], commit: { message: 'Merge feature\nFull body', author: { name: 'Alice', email: 'alice@example.test', date: '2026-01-01T12:00:00Z' }, committer: { name: 'GitHub', date: '2026-01-04T12:00:00Z' }, verification: { verified: true, reason: 'valid' } } }]);
    if (url.pathname.endsWith('/languages')) return Response.json({ TypeScript: 300, CSS: 100 });
    if (url.pathname.endsWith('/branches')) return Response.json([{ name: 'main', protected: true, commit: { sha: 'a'.repeat(40) } }]);
    if (url.pathname.endsWith('/contributors')) return Response.json([{ login: 'alice', contributions: 9, html_url: 'https://github.com/alice' }]);
    if (url.pathname.endsWith('/pulls')) return Response.json([{ number: 4, title: 'Feature PR', draft: true, user: { login: 'alice' }, labels: [{ name: 'feature' }] }]);
    if (url.pathname.endsWith('/issues')) return Response.json([{ number: 3, title: 'Bug', user: { login: 'bob' } }, { number: 4, pull_request: {} }]);
    return Response.json({ full_name: 'team/repo', private: true, default_branch: 'main', topics: ['education'], license: { name: 'MIT' }, size: 42 });
  });
  const report = await inspectGitHub({ target: 'team/repo', branch: 'feature/login', days: 'all', until: '2026-01-04T20:00:00Z' }, { mode: 'oauth', accessToken: 'private-oauth-token' });
  const commitsUrl = requests.find(url => url.pathname.endsWith('/commits'));
  assert.equal(commitsUrl.searchParams.get('since'), null);
  assert.equal(commitsUrl.searchParams.get('until'), '2026-01-04T20:00:00.000Z');
  assert.equal(commitsUrl.searchParams.get('sha'), 'feature/login');
  assert.equal(report.github.commits[0].author.key, 'github:alice');
  assert.equal(report.github.commits[0].committer.login, 'web-flow');
  assert.equal(report.github.commits[0].parents.length, 2);
  assert.equal(report.github.commits[0].verified, true);
  assert.equal(report.github.commits[0].message, 'Merge feature\nFull body');
  assert.equal(report.github.issues.length, 1);
  assert.equal(report.github.pulls[0].draft, true);
  assert.deepEqual(report.github.languages, [{ name: 'TypeScript', bytes: 300 }, { name: 'CSS', bytes: 100 }]);
  assert.equal(report.github.repository.license, 'MIT');
  assert.ok(!JSON.stringify(report).includes('private-oauth-token'));
});

test('empty repositories are complete zero histories, while denied commit access is explicitly incomplete', async t => {
  let denied = false;
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/commits')) return Response.json({}, { status: denied ? 403 : 409 });
    if (path === '/repos/team/repo') return Response.json({ full_name: 'team/repo', default_branch: 'main' });
    return Response.json([]);
  });
  const empty = await inspectGitHub({ target: 'team/repo', days: 7, until: '2026-01-04T20:00:00Z' });
  assert.equal(githubCoverageComplete(empty.github), true);
  assert.equal(empty.github.commits.length, 0);
  assert.equal(empty.github.window.since, '2025-12-29T00:00:00.000Z');
  denied = true;
  const partial = await inspectGitHub({ target: 'team/repo', until: '2026-01-04T20:00:00Z' });
  assert.equal(githubCoverageComplete(partial.github), false);
  assert.match(partial.warnings[0], /Commits.*denied/);
});

test('change analysis limits fan-out and strips patches while preserving per-commit failures without secrets', async t => {
  let running = 0; let maximum = 0; let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++; running++; maximum = Math.max(maximum, running);
    await new Promise(resolve => setTimeout(resolve, 5)); running--;
    const sha = new URL(url).pathname.split('/').at(-1);
    if (sha === 'b'.repeat(40)) return Response.json({ access_token: 'do-not-leak' }, { status: 403 });
    return Response.json({ sha, stats: { additions: 12, deletions: 3 }, files: [{ filename: 'src/app.ts', status: 'modified', additions: 12, deletions: 3, patch: '+private code body' }] }, { headers: { link: '<https://api.github.com/next>; rel="next"' } });
  });
  const result = await githubCommitStatsPage({ target: 'team/repo', shas: ['a', 'b', 'c', 'd', 'e', 'f'].map(letter => letter.repeat(40)) });
  assert.equal(calls, 5); // Stops before another wave after an access failure.
  assert.ok(maximum <= 5);
  assert.equal(result.commits.length, 4);
  assert.equal(result.commits[0].stats.filesTruncated, true);
  assert.equal(result.errors[0].sha, 'b'.repeat(40));
  assert.ok(!JSON.stringify(result).includes('do-not-leak'));
  assert.ok(!JSON.stringify(result).includes('private code body'));
  const before = calls;
  await assert.rejects(githubCommitStatsPage({ target: 'team/repo', shas: Array.from({ length: 11 }, () => 'a'.repeat(40)) }), { status: 400 });
  await assert.rejects(githubCommitStatsPage({ target: 'team/repo', shas: ['../secrets'] }), { status: 400 });
  assert.equal(calls, before);
});
