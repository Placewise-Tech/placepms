import { ApiError, filePath, providerResource, repositoryPath, type Provider } from './integration-security.js';
import type { CommitDetail, GitHubAnalysis, GitHubCommit, GitHubCommitStats, GitHubIdentity, GitHubRepositoryIntelligence, GitHubStatsPage, GitHubWorkItem, InsightItem, Inspection, RepositoryFiles, ResourcePage } from '../src/lib/integration-types.js';

type ObjectValue = Record<string, unknown>;
export const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
export const rows = (value: unknown): ObjectValue[] => Array.isArray(value) ? value.map(object) : [];
export const text = (value: unknown) => typeof value === 'string' ? value : '';
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
export interface Credential { accessToken: string; refreshToken?: string; mode: 'oauth' | 'token' }

export async function providerRequest(provider: Provider, path: string, credential?: Credential, init: RequestInit = {}) {
  const origin = { github: 'https://api.github.com', figma: 'https://api.figma.com', miro: 'https://api.miro.com' }[provider];
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new ApiError(400, 'Invalid provider endpoint.');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (provider === 'github') { headers.set('X-GitHub-Api-Version', '2022-11-28'); headers.set('User-Agent', 'PlacePMS'); }
  if (credential) headers.set(provider === 'figma' && credential.mode === 'token' ? 'X-Figma-Token' : 'Authorization', provider === 'figma' && credential.mode === 'token' ? credential.accessToken : `Bearer ${credential.accessToken}`);
  let response: Response;
  try { response = await fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { throw new ApiError(502, `${provider} could not be reached. Please try again.`); }
  if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new ApiError(429, `${provider} API rate limit reached. ${response.headers.get('retry-after') ? `Retry after ${response.headers.get('retry-after')} seconds.` : 'Wait before refreshing, or use an authorized connection.'}`);
  if (response.status === 401) throw new ApiError(401, `${provider} credentials have expired or are invalid. Reconnect this integration.`);
  if (response.status === 403) throw new ApiError(403, `${provider} denied access. Check the token scopes, organization SSO authorization, and resource permissions.`);
  if (response.status === 404) throw new ApiError(404, 'Resource not found or not accessible to this connection. Check the URL and permissions.');
  if (response.status === 409) throw new ApiError(409, 'This repository has no commit history yet.');
  if (!response.ok) throw new ApiError(502, `${provider} returned an error (${response.status}). Please try again.`);
  if (Number(response.headers.get('content-length')) > 8_000_000) throw new ApiError(413, 'This provider response is too large. Select a smaller resource.');
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) for (;;) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.length;
    if (size > 8_000_000) { await reader.cancel(); throw new ApiError(413, 'This resource is too large to inspect.'); }
    chunks.push(next.value);
  }
  try { return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, headers: response.headers }; }
  catch { throw new ApiError(502, `${provider} returned an unreadable response.`); }
}

export async function connectionAccount(provider: Provider, credential: Credential) {
  const path = provider === 'github' ? '/user' : provider === 'figma' ? '/v1/me' : '/v2/boards?limit=1';
  const { data } = await providerRequest(provider, path, credential);
  const account = object(data);
  return provider === 'github' ? text(account.login) : provider === 'figma' ? text(account.handle) || text(account.email) : 'Authorized Miro workspace';
}

const pageNumber = (value: unknown) => Math.min(100, Math.max(1, Math.floor(Number(value) || 1)));
const githubItem = (row: ObjectValue): InsightItem => ({ id: String(row.id ?? row.name), title: text(row.full_name) || text(row.title) || text(row.name), description: text(row.description) || text(row.state), url: text(row.html_url), date: text(row.pushed_at) || text(row.updated_at), kind: row.private ? 'Private' : 'Public' });

export async function listResources(provider: Provider, input: ObjectValue, credential: Credential): Promise<ResourcePage> {
  if (provider === 'github') {
    const page = pageNumber(input.page);
    const result = await providerRequest(provider, `/user/repos?per_page=50&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`, credential);
    return { items: rows(result.data).map(githubItem), nextPage: result.headers.get('link')?.includes('rel="next"') ? page + 1 : undefined };
  }
  if (provider === 'figma') {
    const id = text(input.parentId).trim();
    if (!/^\d{1,40}$/.test(id)) throw new ApiError(400, 'Enter a numeric Figma team ID or project ID from its URL.');
    const projects = input.level !== 'files';
    const result = object((await providerRequest(provider, projects ? `/v1/teams/${id}/projects` : `/v1/projects/${id}/files`, credential)).data);
    return { items: rows(projects ? result.projects : result.files).map(row => ({ id: String(row.id ?? row.key), title: text(row.name), kind: projects ? 'project' : 'file', date: text(row.last_modified), url: projects ? undefined : `https://www.figma.com/design/${row.key}` })) };
  }
  const cursor = text(input.cursor);
  if (cursor.length > 1000) throw new ApiError(400, 'Invalid pagination cursor.');
  const result = object((await providerRequest(provider, `/v2/boards?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, credential)).data);
  return { items: rows(result.data).map(row => ({ id: text(row.id), title: text(row.name), description: text(row.description), url: text(row.viewLink), date: text(row.modifiedAt), kind: 'board' })), nextCursor: text(result.cursor) || undefined };
}

export async function inspectGitHub(input: ObjectValue, credential?: Credential): Promise<Inspection> {
  const repository = repositoryPath(input.target);
  const base = `/repos/${repository}`;
  const repo = object((await providerRequest('github', base, credential)).data);
  const branch = text(input.branch) || text(repo.default_branch);
  if (branch.length > 250 || [...branch].some(char => char.charCodeAt(0) < 32)) throw new ApiError(400, 'Invalid branch name.');
  const days = (input.days === 'all' ? 'all' : [7, 30, 90, 365].includes(Number(input.days)) ? Number(input.days) : 30) as GitHubAnalysis['window']['days'];
  const untilDate = input.until === undefined ? new Date() : new Date(text(input.until));
  if (!Number.isFinite(untilDate.getTime()) || untilDate.getTime() > Date.now() + 60_000 || untilDate.getTime() < Date.UTC(2008, 0, 1)) throw new ApiError(400, 'Invalid analysis snapshot date.');
  const until = untilDate.toISOString();
  const start = new Date(untilDate); start.setUTCHours(0, 0, 0, 0);
  if (days !== 'all') start.setUTCDate(start.getUTCDate() - days + 1);
  const since = days === 'all' ? null : start.toISOString();
  const page = pageNumber(input.page);
  const warnings: string[] = [];
  const optional = async (path: string, label: string) => {
    try { return await providerRequest('github', path, credential); }
    catch (cause) {
      if (label === 'Commits' && cause instanceof ApiError && cause.status === 409) return { data: [], headers: new Headers() };
      warnings.push(`${label}: ${cause instanceof ApiError ? cause.message : 'Unavailable'}`); return { data: null, headers: new Headers() };
    }
  };
  const intelligenceRequest = page === 1 ? Promise.all([
    optional(`${base}/actions/workflows?per_page=30`, 'CI workflows'), optional(`${base}/actions/runs?per_page=20`, 'Recent workflow runs'),
    optional(`${base}/releases?per_page=10`, 'Releases'), optional(`${base}/community/profile`, 'Repository conventions'),
  ]).then(([workflows, runs, releases, standards]): GitHubRepositoryIntelligence => {
    const workflowData = object(workflows.data); const runData = object(runs.data); const profile = object(standards.data); const files = object(profile.files);
    return {
      capturedAt: new Date().toISOString(),
      coverage: {
        workflows: { available: Array.isArray(workflowData.workflows), hasMore: Boolean(workflows.headers.get('link')?.includes('rel="next"')) },
        runs: { available: Array.isArray(runData.workflow_runs), hasMore: Boolean(runs.headers.get('link')?.includes('rel="next"')) },
        releases: { available: Array.isArray(releases.data), hasMore: Boolean(releases.headers.get('link')?.includes('rel="next"')) },
        standards: { available: Boolean(profile.files && typeof profile.files === 'object' && !Array.isArray(profile.files)), hasMore: false },
      },
      workflows: rows(workflowData.workflows).slice(0, 30).map(row => ({ id: String(row.id), name: text(row.name), path: text(row.path), state: text(row.state), url: text(row.html_url), updatedAt: text(row.updated_at) })),
      runs: rows(runData.workflow_runs).slice(0, 20).map(row => ({ id: String(row.id), name: text(row.name), branch: text(row.head_branch), sha: text(row.head_sha), event: text(row.event), status: text(row.status), conclusion: text(row.conclusion), url: text(row.html_url), startedAt: text(row.run_started_at), updatedAt: text(row.updated_at) })),
      releases: rows(releases.data).slice(0, 10).map(row => ({ id: String(row.id), title: text(row.name) || text(row.tag_name), tag: text(row.tag_name), body: text(row.body).slice(0, 20_000), url: text(row.html_url), author: text(object(row.author).login), publishedAt: text(row.published_at), draft: row.draft === true, prerelease: row.prerelease === true, assets: rows(row.assets).length })),
      standards: [['readme', 'README'], ['license', 'License'], ['contributing', 'Contribution guide'], ['code_of_conduct', 'Code of conduct'], ['issue_template', 'Issue template'], ['pull_request_template', 'Pull-request template']].map(([key, name]) => ({ name, present: Object.keys(object(files[key])).length > 0, url: text(object(files[key]).html_url) })),
      ...(typeof profile.health_percentage === 'number' ? { communityHealth: profile.health_percentage } : {}),
    };
  }) : Promise.resolve(undefined);
  const [commitsResult, languages, branches, pulls, issues, contributors, intelligence] = await Promise.all([
    optional(`${base}/commits?sha=${encodeURIComponent(branch)}${since ? `&since=${since}` : ''}&until=${until}&per_page=100&page=${page}`, 'Commits'),
    optional(`${base}/languages`, 'Languages'), optional(`${base}/branches?per_page=100`, 'Branches'),
    optional(`${base}/pulls?state=open&per_page=30&sort=updated`, 'Pull requests'),
    optional(`${base}/issues?state=open&per_page=50&sort=updated`, 'Issues'), optional(`${base}/contributors?per_page=30`, 'Contributors'),
    intelligenceRequest,
  ]);
  const commits = rows(commitsResult.data);
  const history = commits.map(normalizeGitHubCommit).filter(commit => /^[a-f0-9]{40}$/i.test(commit.sha));
  const authors = new Map<string, number>(); const dates = new Map<string, number>();
  for (const row of commits) {
    const commit = object(row.commit); const author = object(commit.author);
    const name = text(object(row.author).login) || text(author.name) || 'Unknown author';
    authors.set(name, (authors.get(name) || 0) + 1);
    const date = (text(object(commit.committer).date) || text(author.date)).slice(0, 10); if (date) dates.set(date, (dates.get(date) || 0) + 1);
  }
  const hasMore = Boolean(commitsResult.headers.get('link')?.includes('rel="next"'));
  if (hasMore && page === 100) warnings.push('This analysis is capped at 10,000 commits. Choose a shorter commit window to analyze recent activity in full.');
  const nextPage = hasMore && page < 100 ? page + 1 : undefined;
  const github: GitHubAnalysis = {
    repository: { name: text(repo.full_name), defaultBranch: text(repo.default_branch), visibility: repo.private ? 'Private' : 'Public', archived: repo.archived === true,
      createdAt: text(repo.created_at), pushedAt: text(repo.pushed_at), sizeKb: num(repo.size), license: text(object(repo.license).name), topics: Array.isArray(repo.topics) ? repo.topics.filter((value): value is string => typeof value === 'string') : [],
      stars: num(repo.stargazers_count), forks: num(repo.forks_count), openIssuesAndPulls: num(repo.open_issues_count) },
    branch, window: { days, since, until }, pages: [page], commitsAvailable: Array.isArray(commitsResult.data), historyTruncated: hasMore && page === 100, nextPage, commits: history,
    languages: Object.entries(object(languages.data)).map(([name, value]) => ({ name, bytes: num(value) })).filter(row => row.bytes > 0).sort((a, b) => b.bytes - a.bytes),
    branches: rows(branches.data).map(row => ({ name: text(row.name), sha: text(object(row.commit).sha), protected: row.protected === true })),
    contributors: rows(contributors.data).map(row => ({ login: text(row.login), commits: num(row.contributions), url: text(row.html_url) })),
    pulls: rows(pulls.data).map(normalizeGitHubWorkItem), issues: rows(issues.data).filter(row => !row.pull_request).map(normalizeGitHubWorkItem),
    ...(intelligence ? { intelligence } : {}),
  };
  return {
    provider: 'github', title: text(repo.full_name), description: text(repo.description), url: text(repo.html_url), repository, branch,
    branches: rows(branches.data).map(row => text(row.name)), warnings,
    nextPage, github,
    sampleNotice: `Commit analysis loads up to 100 commits per page on ${branch}${days === 'all' ? ' across its history' : ` within the last ${days} UTC calendar days`}. Load more pages to expand the graphs. Repository-wide languages and up to 30 contributors describe the default branch, not the selected window. Open PRs (30), issues (50 including PRs), branches (100), CI workflows (30), recent runs (20), and releases (10) are bounded API samples; CI, releases, and conventions are captured on the first page independently of the commit window.`,
    metrics: [{ label: 'Visibility', value: repo.private ? 'Private' : 'Public' }, { label: 'Stars', value: num(repo.stargazers_count) }, { label: 'Forks', value: num(repo.forks_count) }, { label: 'Commits on this page', value: commits.length }, { label: 'Authors on this page', value: authors.size }, { label: 'Active days on this page', value: dates.size }, { label: 'Open issues + PRs', value: num(repo.open_issues_count) }, { label: 'Default branch', value: text(repo.default_branch) }],
    sections: [
      { title: 'Commit history', items: commits.map(row => { const commit = object(row.commit); const author = object(commit.author); return { id: text(row.sha), title: text(commit.message).split('\n')[0], description: `${text(author.name)} · ${text(row.sha).slice(0, 7)}`, date: text(author.date), url: text(row.html_url), kind: 'commit' }; }) },
      { title: 'Commit activity by day', items: [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ id: date, title: date, value })) },
      { title: 'Contributions on this page', items: [...authors].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ id: name, title: name, value })) },
      { title: 'Languages (bytes)', items: Object.entries(object(languages.data)).map(([name, value]) => ({ id: name, title: name, value: num(value) })) },
      { title: 'Open pull requests', items: rows(pulls.data).map(githubItem) },
      { title: 'Open issues', items: rows(issues.data).filter(row => !row.pull_request).map(githubItem) },
      { title: 'All-time contributors', items: rows(contributors.data).map(row => ({ id: String(row.id), title: text(row.login), value: num(row.contributions), url: text(row.html_url) })) },
    ],
  };
}

function githubIdentity(git: ObjectValue, account: ObjectValue): GitHubIdentity {
  const login = text(account.login); const email = text(git.email); const name = text(git.name) || login || 'Unknown author';
  return { key: login ? `github:${login.toLowerCase()}` : email ? `email:${email.toLowerCase()}` : `name:${name}`, name, login, email, url: login ? `https://github.com/${encodeURIComponent(login)}` : '' };
}

function normalizeGitHubCommit(row: ObjectValue): GitHubCommit {
  const commit = object(row.commit); const author = object(commit.author); const committer = object(commit.committer); const verification = object(commit.verification);
  return { sha: text(row.sha), message: text(commit.message), url: text(row.html_url), author: githubIdentity(author, object(row.author)), committer: githubIdentity(committer, object(row.committer)),
    authoredAt: text(author.date), committedAt: text(committer.date) || text(author.date), parents: rows(row.parents).map(parent => text(parent.sha)).filter(sha => /^[a-f0-9]{40}$/i.test(sha)), verified: verification.verified === true, verificationReason: text(verification.reason) };
}

function normalizeGitHubWorkItem(row: ObjectValue): GitHubWorkItem {
  return { number: num(row.number), title: text(row.title), url: text(row.html_url), author: text(object(row.user).login), createdAt: text(row.created_at), updatedAt: text(row.updated_at), labels: rows(row.labels).map(label => text(label.name)), draft: row.draft === true };
}

function githubCommitStats(row: ObjectValue, headers: Headers): GitHubCommitStats {
  const stats = object(row.stats); const files = rows(row.files).slice(0, 100);
  if (typeof stats.additions !== 'number' || typeof stats.deletions !== 'number') throw new ApiError(502, 'GitHub did not return change statistics for this commit.');
  return { additions: num(stats.additions), deletions: num(stats.deletions), filesTruncated: Boolean(headers.get('link')?.includes('rel="next"')) || rows(row.files).length > 100,
    files: files.map(file => ({ name: text(file.filename), status: text(file.status), additions: num(file.additions), deletions: num(file.deletions) })) };
}

export async function githubCommitStatsPage(input: ObjectValue, credential?: Credential): Promise<GitHubStatsPage> {
  const repository = repositoryPath(input.target);
  if (!Array.isArray(input.shas) || !input.shas.length || input.shas.length > 10 || input.shas.some(sha => typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha))) throw new ApiError(400, 'Select between 1 and 10 full commit IDs for change analysis.');
  const shas = [...new Set(input.shas as string[])]; const result: GitHubStatsPage = { commits: [], errors: [] };
  // Two bounded waves keep this request within the server's execution window.
  for (let offset = 0; offset < shas.length; offset += 5) {
    await Promise.all(shas.slice(offset, offset + 5).map(async sha => {
      try {
        const response = await providerRequest('github', `/repos/${repository}/commits/${sha}?per_page=100`, credential);
        const row = object(response.data);
        if (text(row.sha).toLowerCase() !== sha.toLowerCase()) throw new ApiError(502, 'GitHub returned a different commit. Please retry.');
        result.commits.push({ sha, stats: githubCommitStats(row, response.headers) });
      } catch (cause) { result.errors.push({ sha, message: cause instanceof ApiError ? cause.message : 'Change statistics unavailable.' }); }
    }));
    if (result.errors.length) break;
  }
  return result;
}

export async function repositoryFiles(input: ObjectValue, credential?: Credential): Promise<RepositoryFiles> {
  const repository = repositoryPath(input.target); const path = filePath(input.path);
  const branch = text(input.branch);
  const result = await providerRequest('github', `/repos/${repository}/contents/${path}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`, credential);
  if (Array.isArray(result.data)) return { path: text(input.path), items: rows(result.data).filter(row => row.type === 'file' || row.type === 'dir').map(row => ({ id: text(row.path), title: text(row.name), path: text(row.path), kind: text(row.type), url: text(row.html_url), value: num(row.size) })) };
  const item = object(result.data);
  if (item.type !== 'file') throw new ApiError(400, 'Only ordinary files and directories can be inspected.');
  const size = num(item.size);
  if (size > 1_000_000 || item.encoding !== 'base64') return { path: text(item.path), size, binary: true, url: text(item.html_url) };
  const contents = Buffer.from(text(item.content), 'base64');
  const binary = contents.includes(0);
  return { path: text(item.path), size, binary, text: binary ? undefined : contents.toString('utf8'), url: text(item.html_url) };
}

export async function commitDetail(input: ObjectValue, credential?: Credential): Promise<CommitDetail> {
  const repository = repositoryPath(input.target); const sha = text(input.sha);
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) throw new ApiError(400, 'Select a valid commit.');
  const response = await providerRequest('github', `/repos/${repository}/commits/${sha}?per_page=100`, credential);
  const result = object(response.data);
  const commit = object(result.commit); const author = object(commit.author); const stats = object(result.stats);
  const files = rows(result.files);
  const normalized = normalizeGitHubCommit(result);
  return { sha: text(result.sha), message: text(commit.message), author: text(author.name), date: text(author.date), url: text(result.html_url), additions: num(stats.additions), deletions: num(stats.deletions), truncated: files.length >= 100 || files.some(row => text(row.patch).length > 50_000), files: files.slice(0, 100).map(row => ({ name: text(row.filename), status: text(row.status), additions: num(row.additions), deletions: num(row.deletions), patch: text(row.patch).slice(0, 50_000) })),
    authorIdentity: normalized.author, committerIdentity: normalized.committer, committedAt: normalized.committedAt, parents: normalized.parents, verified: normalized.verified, verificationReason: normalized.verificationReason };
}

export async function inspectDesign(provider: 'figma' | 'miro', input: ObjectValue, credential: Credential): Promise<Inspection> {
  const key = providerResource(provider, input.target);
  const warnings: string[] = [];
  const optional = async (path: string, label: string) => {
    try { return object((await providerRequest(provider, path, credential)).data); }
    catch (cause) { warnings.push(`${label}: ${cause instanceof ApiError ? cause.message : 'Unavailable'}`); return {}; }
  };
  if (provider === 'figma') {
    const file = object((await providerRequest(provider, `/v1/files/${key}?depth=2`, credential)).data);
    const [versions, comments] = await Promise.all([optional(`/v1/files/${key}/versions?page_size=30`, 'Version history'), optional(`/v1/files/${key}/comments`, 'Comments')]);
    const pages = rows(object(file.document).children);
    const frames: ObjectValue[] = pages.flatMap(page => rows(page.children).map(node => ({ ...node, page: page.name })));
    return { provider, title: text(file.name), description: `Last modified ${text(file.lastModified)}`, url: `https://www.figma.com/design/${key}`, warnings,
      sampleNotice: 'Design structure includes pages and their direct children (depth 2). Component details include up to 100 returned metadata entries; version history shows up to 30 revisions and comments up to 100.',
      metrics: [{ label: 'Pages', value: pages.length }, { label: 'Top-level layers', value: frames.length }, { label: 'Components returned', value: Object.keys(object(file.components)).length }, { label: 'Version', value: text(file.version) }],
      sections: [
        { title: 'Pages', items: pages.map(row => ({ id: text(row.id), title: text(row.name), kind: 'page', value: rows(row.children).length, details: [{ label: 'Node ID', value: text(row.id) }, { label: 'Type', value: text(row.type) }, { label: 'Direct layers returned', value: rows(row.children).length }] })) },
        { title: 'Frames & layers', items: frames.map(row => { const bounds = object(row.absoluteBoundingBox); return { id: text(row.id), title: text(row.name), kind: text(row.type), description: `${row.page} · ${row.type}`, url: `https://www.figma.com/design/${key}?node-id=${encodeURIComponent(text(row.id))}`, details: [{ label: 'Node ID', value: text(row.id) }, { label: 'Page', value: text(row.page) }, { label: 'Type', value: text(row.type) }, { label: 'Width', value: typeof bounds.width === 'number' ? bounds.width : 'Not provided' }, { label: 'Height', value: typeof bounds.height === 'number' ? bounds.height : 'Not provided' }, { label: 'Auto layout', value: text(row.layoutMode) || 'Not provided' }, { label: 'Visibility', value: typeof row.visible === 'boolean' ? row.visible ? 'Visible' : 'Hidden' : 'Not provided' }] }; }) },
        { title: 'Components', items: Object.entries(object(file.components)).slice(0, 100).map(([id, value]) => { const component = object(value); return { id, title: text(component.name) || id, kind: 'component', description: text(component.description), url: `https://www.figma.com/design/${key}?node-id=${encodeURIComponent(id)}`, details: [{ label: 'Node ID', value: id }, { label: 'Component key', value: text(component.key) || 'Not provided' }] }; }) },
        { title: 'Version history', items: rows(versions.versions).slice(0, 30).map(row => ({ id: text(row.id), title: text(row.label) || 'Saved version', description: `${text(object(row.user).handle)} · ${text(row.description)}`, date: text(row.created_at) })) },
        { title: 'Comments', items: rows(comments.comments).slice(0, 100).map(row => ({ id: text(row.id), title: text(object(row.user).handle), description: text(row.message), date: text(row.created_at) })) },
      ] };
  }
  const board = object((await providerRequest(provider, `/v2/boards/${encodeURIComponent(key)}`, credential)).data);
  const cursor = text(input.cursor); if (cursor.length > 1000) throw new ApiError(400, 'Invalid pagination cursor.');
  const result = await optional(`/v2/boards/${encodeURIComponent(key)}/items?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'Board items');
  const items = rows(result.data); const types = new Map<string, number>();
  for (const item of items) types.set(text(item.type), (types.get(text(item.type)) || 0) + 1);
  return { provider, title: text(board.name), description: text(board.description), url: text(board.viewLink) || `https://miro.com/app/board/${encodeURIComponent(key)}/`, warnings, nextCursor: text(result.cursor) || undefined,
    sampleNotice: 'Item counts describe this page of up to 50 board items. Load the next page to inspect larger boards.',
    metrics: [{ label: 'Items on this page', value: items.length }, { label: 'Item types', value: types.size }, { label: 'Last modified', value: text(board.modifiedAt) }, { label: 'Owner', value: text(object(board.owner).name) }],
    sections: [{ title: 'Board items', items: items.map(row => { const data = object(row.data); const position = object(row.position); const geometry = object(row.geometry); return { id: text(row.id), title: text(data.title) || text(row.type), description: text(data.content).replace(/<[^>]*>/g, '').slice(0, 4000), kind: text(row.type), date: text(row.modifiedAt), details: [{ label: 'Item ID', value: text(row.id) }, { label: 'Type', value: text(row.type) }, ...[['Position X', position.x], ['Position Y', position.y], ['Width', geometry.width], ['Height', geometry.height]].map(([label, value]) => ({ label: String(label), value: typeof value === 'number' ? value : 'Not provided' })), { label: 'Created', value: text(row.createdAt) || 'Not provided' }, { label: 'Updated', value: text(row.modifiedAt) || 'Not provided' }] }; }) }, { title: 'Items by type', items: [...types].map(([name, value]) => ({ id: name, title: name, value })) }] };
}
