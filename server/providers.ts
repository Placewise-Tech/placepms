import { ApiError, filePath, providerResource, repositoryPath, type Provider } from './integration-security.js';
import type { CommitDetail, InsightItem, Inspection, RepositoryFiles, ResourcePage } from '../src/lib/integration-types.js';

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
  const days = [7, 30, 90, 365].includes(Number(input.days)) ? Number(input.days) : 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const page = pageNumber(input.page);
  const warnings: string[] = [];
  const optional = async (path: string, label: string) => {
    try { return await providerRequest('github', path, credential); }
    catch (cause) { warnings.push(`${label}: ${cause instanceof ApiError ? cause.message : 'Unavailable'}`); return { data: null, headers: new Headers() }; }
  };
  const [commitsResult, languages, branches, pulls, issues, contributors] = await Promise.all([
    optional(`${base}/commits?sha=${encodeURIComponent(branch)}&since=${since}&per_page=100&page=${page}`, 'Commits'),
    optional(`${base}/languages`, 'Languages'), optional(`${base}/branches?per_page=100`, 'Branches'),
    optional(`${base}/pulls?state=open&per_page=30&sort=updated`, 'Pull requests'),
    optional(`${base}/issues?state=open&per_page=50&sort=updated`, 'Issues'), optional(`${base}/contributors?per_page=30`, 'Contributors'),
  ]);
  const commits = rows(commitsResult.data);
  const authors = new Map<string, number>(); const dates = new Map<string, number>();
  for (const row of commits) {
    const commit = object(row.commit); const author = object(commit.author);
    const name = text(object(row.author).login) || text(author.name) || 'Unknown author';
    authors.set(name, (authors.get(name) || 0) + 1);
    const date = text(author.date).slice(0, 10); if (date) dates.set(date, (dates.get(date) || 0) + 1);
  }
  return {
    provider: 'github', title: text(repo.full_name), description: text(repo.description), url: text(repo.html_url), repository, branch,
    branches: rows(branches.data).map(row => text(row.name)), warnings,
    nextPage: commitsResult.headers.get('link')?.includes('rel="next"') ? page + 1 : undefined,
    sampleNotice: `Commit analysis covers page ${page} (up to 100 commits) on ${branch} within the last ${days} days. Contributors show up to 30 all-time contributors; issues/PRs and branches are bounded API samples.`,
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
  const result = object((await providerRequest('github', `/repos/${repository}/commits/${sha}?per_page=100`, credential)).data);
  const commit = object(result.commit); const author = object(commit.author); const stats = object(result.stats);
  const files = rows(result.files);
  return { sha: text(result.sha), message: text(commit.message), author: text(author.name), date: text(author.date), url: text(result.html_url), additions: num(stats.additions), deletions: num(stats.deletions), truncated: files.length >= 100 || files.some(row => text(row.patch).length > 50_000), files: files.map(row => ({ name: text(row.filename), status: text(row.status), additions: num(row.additions), deletions: num(row.deletions), patch: text(row.patch).slice(0, 50_000) })) };
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
      sampleNotice: 'Design structure includes pages and their direct children (depth 2). Version history shows up to 30 revisions; comments show up to 100.',
      metrics: [{ label: 'Pages', value: pages.length }, { label: 'Top-level layers', value: frames.length }, { label: 'Components returned', value: Object.keys(object(file.components)).length }, { label: 'Version', value: text(file.version) }],
      sections: [
        { title: 'Pages', items: pages.map(row => ({ id: text(row.id), title: text(row.name), value: rows(row.children).length })) },
        { title: 'Frames & layers', items: frames.map(row => ({ id: text(row.id), title: text(row.name), description: `${row.page} · ${row.type}`, url: `https://www.figma.com/design/${key}?node-id=${encodeURIComponent(text(row.id))}` })) },
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
    sections: [{ title: 'Board items', items: items.map(row => { const data = object(row.data); return { id: text(row.id), title: text(data.title) || text(row.type), description: text(data.content).replace(/<[^>]*>/g, '').slice(0, 4000), kind: text(row.type), date: text(row.modifiedAt) }; }) }, { title: 'Items by type', items: [...types].map(([name, value]) => ({ id: name, title: name, value })) }] };
}
