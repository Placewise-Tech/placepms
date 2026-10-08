import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAuthHandler } from '../server/auth.ts';

const env = { SUPABASE_URL: 'https://auth-fixture.example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key', SUPABASE_SECRET_KEY: 'fixture-private-key' };

async function fixture(t, upstream) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === '127.0.0.1') return originalFetch(input, init);
    calls.push({ url, init });
    assert.equal(url.hostname, 'auth-fixture.example.test');
    return upstream(url, init);
  });
  const server = createServer(createAuthHandler(env));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/auth`;
  const post = (path, body = { email: 'student@example.test', password: 'fixture-password' }, query = '') => fetch(`${url}?path=${encodeURIComponent(path)}${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'untrusted-browser-key' }, body: JSON.stringify(body) });
  return { url, post, calls };
}

test('Auth proxy uses the configured public key and returns sessions without storing credentials', async t => {
  const app = await fixture(t, () => Response.json({ access_token: 'fixture-session', refresh_token: 'fixture-refresh' }));
  const response = await app.post('/token', undefined, '&grant_type=password');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).access_token, 'fixture-session');
  assert.equal(app.calls[0].url.pathname, '/auth/v1/token');
  assert.equal(app.calls[0].url.searchParams.get('grant_type'), 'password');
  assert.equal(app.calls[0].init.headers.get('apikey'), 'fixture-public-key');
  assert.ok(!JSON.stringify([...app.calls[0].init.headers]).includes('fixture-private-key'));
  assert.equal(app.calls[0].init.redirect, 'error');
});

test('Auth proxy rejects admin routes, traversal, unsupported methods, and malformed payloads', async t => {
  const app = await fixture(t, () => { throw new Error('No upstream call should be made'); });
  for (const path of ['/admin/users', '/token/../admin/users', 'https://evil.test/token', '/signup']) assert.equal((await app.post(path)).status, 404);
  assert.equal((await fetch(`${app.url}?path=/token`)).status, 405);
  assert.equal((await app.post('/token', ['invalid'])).status, 400);
  assert.equal((await app.post('/token', { data: 'x'.repeat(17_000) })).status, 413);
  assert.equal(app.calls.length, 0);
});

test('Auth proxy preserves user authorization, invalid credentials, and logout status', async t => {
  const app = await fixture(t, url => url.pathname.endsWith('/logout') ? new Response(null, { status: 204 }) : url.pathname.endsWith('/user') ? Response.json({ id: 'fixture-user' }) : Response.json({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' }, { status: 400 }));
  const denied = await app.post('/token');
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).error_code, 'invalid_credentials');
  const user = await fetch(`${app.url}?path=/user`, { headers: { Authorization: 'Bearer fixture-user-token' } });
  assert.equal(user.status, 200);
  assert.equal(app.calls[1].init.headers.get('authorization'), 'Bearer fixture-user-token');
  assert.equal((await app.post('/logout')).status, 204);
});

test('Auth upstream network failures become retryable JSON responses without raw provider errors', async t => {
  const app = await fixture(t, () => { throw new TypeError('fetch failed with private provider details'); });
  const response = await app.post('/token');
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.match(result.error, /authentication service could not be reached/);
  assert.ok(!JSON.stringify(result).includes('private provider details'));
});
