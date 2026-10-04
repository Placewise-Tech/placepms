import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createIntegrationsHandler } from '../server/integrations.ts';
import { seal, unseal } from '../server/integration-security.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env = { SUPABASE_URL: 'https://workspace-db.example.test', SUPABASE_SECRET_KEY: 'fixture-admin-key', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key', APP_URL: 'http://localhost:5173', GITHUB_CLIENT_ID: 'fixture-oauth-client', GITHUB_CLIENT_SECRET: 'fixture-oauth-secret' };
const jwt = userId => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString('base64url')}.test`;

async function fixture(t) {
  const connections = new Map(); const states = new Map(); let active = true; let authUnavailable = false; let disconnectOnRefresh = false; let exchanges = 0;
  const providerCalls = [];
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === '127.0.0.1') return originalFetch(input, options);
    if (url.hostname === 'api.github.com') {
      providerCalls.push({ url: url.href, authorization: new Headers(options.headers).get('authorization') });
      if (url.pathname.includes('/commits/')) return Response.json({ sha: url.pathname.split('/').at(-1), stats: { additions: 5, deletions: 1 }, files: [] });
      return Response.json({ login: 'provider-owner' });
    }
    if (url.hostname === 'github.com') { exchanges++; if (disconnectOnRefresh) connections.clear(); return Response.json({ access_token: 'private-oauth-token', token_type: 'bearer', expires_in: 3600 }); }
    assert.equal(url.hostname, 'workspace-db.example.test');
    const headers = new Headers(options.headers); const method = options.method || 'GET'; const body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname === '/auth/v1/user') {
      if (authUnavailable) return Response.json({ message: 'Temporarily unavailable' }, { status: 503 });
      const userId = headers.get('authorization') === `Bearer ${jwt(other)}` ? other : owner;
      return Response.json({ id: userId, email: `${userId}@example.test`, app_metadata: {}, user_metadata: {} });
    }
    if (url.pathname.endsWith('/workspace_session_active')) return Response.json(active);
    if (url.pathname.endsWith('/claim_workspace_request')) return Response.json(true);
    if (url.pathname.endsWith('/workspace_claim_token_refresh')) return Response.json(true);
    if (url.pathname.endsWith('/integration_connections')) {
      if (method === 'POST') { connections.set(`${body.user_id}:${body.provider}`, { id: 'connection-id', ...body }); return Response.json(null, { status: 201 }); }
      const userId = url.searchParams.get('user_id')?.slice(3); const provider = url.searchParams.get('provider')?.slice(3);
      const found = [...connections.values()].filter(row => row.user_id === userId && (!provider || provider === row.provider)
        && (!url.searchParams.has('id') || `eq.${row.id}` === url.searchParams.get('id'))
        && (!url.searchParams.has('credentials') || `eq.${row.credentials}` === url.searchParams.get('credentials')));
      if (method === 'DELETE') { for (const row of found) connections.delete(`${row.user_id}:${row.provider}`); return Response.json(null); }
      const select = url.searchParams.get('select');
      if (method === 'PATCH') { for (const row of found) Object.assign(row, body); if (!select) return Response.json(null); }
      const selected = found.map(row => select === '*' ? row : Object.fromEntries(select.split(',').map(key => [key, row[key]])));
      return Response.json(headers.get('accept')?.includes('object') ? selected[0] || null : selected);
    }
    if (url.pathname.endsWith('/integration_oauth_states')) {
      if (method === 'POST') { states.set(body.state_hash, body); return Response.json(null, { status: 201 }); }
      const hash = url.searchParams.get('state_hash')?.slice(3);
      if (!hash) return Response.json(null);
      const state = states.get(hash);
      if (!state || Date.parse(state.expires_at) <= Date.now()) return Response.json(null);
      states.delete(hash); return Response.json(state);
    }
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  });
  const server = createServer(createIntegrationsHandler(env)); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/integrations`;
  const post = (body, userId = owner) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt(userId)}` }, body: JSON.stringify(body) });
  return { url, post, connections, states, providerCalls, revoke: () => { active = false; }, failAuth: () => { authUnavailable = true; }, disconnectDuringRefresh: () => { disconnectOnRefresh = true; }, exchanges: () => exchanges };
}

test('authenticated token connection encrypts credentials and isolates status/disconnect by user', async t => {
  const app = await fixture(t);
  const connected = await app.post({ action: 'connect-token', provider: 'github', token: 'private-pat-credential' });
  assert.equal(connected.status, 200);
  const saved = app.connections.get(`${owner}:github`);
  assert.ok(saved.credentials.startsWith('v1.'));
  assert.ok(!saved.credentials.includes('private-pat-credential'));
  assert.equal(JSON.parse(unseal(saved.credentials, `${owner}:github`, env)).accessToken, 'private-pat-credential');
  const status = await (await app.post({ action: 'status' })).json();
  assert.equal(status.connections[0].account, 'provider-owner');
  assert.ok(!JSON.stringify(status).includes('credentials'));
  assert.ok(!JSON.stringify(status).includes('private-pat-credential'));
  assert.deepEqual((await (await app.post({ action: 'status' }, other)).json()).connections, []);
  await app.post({ action: 'disconnect', provider: 'github' }, other);
  assert.equal(app.connections.size, 1);
  await app.post({ action: 'disconnect', provider: 'github' });
  assert.equal(app.connections.size, 0);
});

test('OAuth uses cookie/PKCE state bound to the starting account and consumes it once', async t => {
  const app = await fixture(t);
  const start = await app.post({ action: 'connect-oauth', provider: 'github' });
  assert.equal(start.status, 200);
  const authorization = new URL((await start.json()).url);
  assert.equal(authorization.hostname, 'github.com');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorization.searchParams.get('code_challenge'));
  assert.ok(!authorization.href.includes(env.GITHUB_CLIENT_SECRET));
  const cookie = start.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
  const callback = `${app.url}?action=callback&provider=github&state=${authorization.searchParams.get('state')}&code=provider-code`;
  const result = await fetch(callback, { redirect: 'manual', headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(result.status, 303);
  assert.match(result.headers.get('location'), /connected=github/);
  assert.equal(app.connections.get(`${owner}:github`).mode, 'oauth');
  assert.equal(app.connections.has(`${other}:github`), false);
  assert.equal(app.exchanges(), 1);
  const replay = await fetch(callback, { redirect: 'manual', headers: { Cookie: cookie.split(';')[0] } });
  assert.match(replay.headers.get('location'), /connection_error=/);
  assert.equal(app.exchanges(), 1);
});

test('commit statistics use only the authenticated account connection and reject revoked sessions', async t => {
  const app = await fixture(t);
  app.connections.set(`${owner}:github`, { id: 'owner-connection', user_id: owner, provider: 'github', account: 'owner', mode: 'oauth', expires_at: null, credentials: seal(JSON.stringify({ accessToken: 'owner-private-oauth-token', mode: 'oauth' }), `${owner}:github`, env) });
  const input = { action: 'commit-stats', provider: 'github', access: 'oauth', target: 'team/repo', shas: ['a'.repeat(40)], token: 'ignored-browser-token' };
  const response = await app.post(input);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.commits[0].stats.additions, 5);
  assert.ok(!JSON.stringify(report).includes('owner-private-oauth-token'));
  assert.equal(app.providerCalls[0].authorization, 'Bearer owner-private-oauth-token');
  const count = app.providerCalls.length;
  assert.equal((await app.post(input, other)).status, 409);
  assert.equal(app.providerCalls.length, count);
  app.revoke();
  assert.equal((await app.post(input)).status, 401);
  assert.equal(app.providerCalls.length, count);
});

test('revoked sessions cannot use the integration vault or complete pending OAuth', async t => {
  const app = await fixture(t);
  const start = await app.post({ action: 'connect-oauth', provider: 'github' });
  const authorization = new URL((await start.json()).url); const cookie = start.headers.get('set-cookie');
  app.revoke();
  assert.equal((await app.post({ action: 'status' })).status, 401);
  const callback = await fetch(`${app.url}?action=callback&provider=github&state=${authorization.searchParams.get('state')}&code=provider-code`, { redirect: 'manual', headers: { Cookie: cookie.split(';')[0] } });
  assert.match(callback.headers.get('location'), /connection_error=/);
  assert.equal(app.exchanges(), 0);
  assert.equal(app.connections.size, 0);
});

test('an authentication service outage is retryable rather than an instruction to sign the user out', async t => {
  const app = await fixture(t); app.failAuth();
  const response = await app.post({ action: 'status' });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily unavailable/);
});

test('OAuth refresh preserves its refresh token and cannot resurrect a disconnected connection', async t => {
  const app = await fixture(t);
  const expired = () => ({ id: 'connection-id', user_id: owner, provider: 'github', account: 'provider-owner', mode: 'oauth', expires_at: '2020-01-01T00:00:00Z', credentials: seal(JSON.stringify({ accessToken: 'expired-token', refreshToken: 'private-refresh-token', mode: 'oauth' }), `${owner}:github`, env) });
  app.connections.set(`${owner}:github`, expired());
  const refreshed = await app.post({ action: 'list', provider: 'github', access: 'oauth' });
  assert.equal(refreshed.status, 200);
  const credential = JSON.parse(unseal(app.connections.get(`${owner}:github`).credentials, `${owner}:github`, env));
  assert.equal(credential.accessToken, 'private-oauth-token');
  assert.equal(credential.refreshToken, 'private-refresh-token');
  app.connections.set(`${owner}:github`, expired()); app.disconnectDuringRefresh();
  const disconnected = await app.post({ action: 'list', provider: 'github', access: 'oauth' });
  assert.equal(disconnected.status, 409);
  assert.equal(app.connections.size, 0);
});
