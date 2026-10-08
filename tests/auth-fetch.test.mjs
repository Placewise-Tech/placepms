import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthFetch } from '../src/lib/auth-fetch.ts';

const project = 'https://auth-fixture.example.test';

test('blocked Auth hostname falls back to our origin and preserves password/refresh requests', async () => {
  for (const grant of ['password', 'refresh_token']) {
    const requests = [];
    const transport = createAuthFetch(project, async (url, init) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) throw new TypeError('Failed to fetch');
      return Response.json({ access_token: 'fixture-session' });
    });
    const body = JSON.stringify(grant === 'password' ? { email: 'student@example.test', password: 'fixture-password' } : { refresh_token: 'fixture-refresh' });
    const response = await transport(`${project}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: 'public-key', 'Content-Type': 'application/json' }, body });
    assert.equal((await response.json()).access_token, 'fixture-session');
    assert.equal(requests.length, 2);
    const fallback = new URL(requests[1].url, 'https://placepms.example.test');
    assert.equal(fallback.pathname, '/api/auth');
    assert.equal(fallback.searchParams.get('path'), '/token');
    assert.equal(fallback.searchParams.get('grant_type'), grant);
    assert.equal(requests[1].init.body, body);
    assert.equal(requests[1].init.headers.apikey, 'public-key');
  }
});

test('normal credential errors and unrelated URLs do not get retried through the Auth proxy', async () => {
  const requests = [];
  const transport = createAuthFetch(project, async url => { requests.push(String(url)); return Response.json({ message: 'Invalid login credentials' }, { status: 400 }); });
  assert.equal((await transport(`${project}/auth/v1/token`)).status, 400);
  await transport(`${project}/rest/v1/profiles`);
  await transport('https://another.example.test/auth/v1/token');
  assert.equal(requests.length, 3);
  assert.ok(requests.every(url => !url.startsWith('/api/auth')));
});

test('manual cancellation is preserved and a total network outage returns a structured error', async () => {
  const controller = new AbortController(); controller.abort();
  let attempts = 0;
  const transport = createAuthFetch(project, async () => { attempts++; throw new TypeError('Failed to fetch'); });
  await assert.rejects(transport(`${project}/auth/v1/user`, { signal: controller.signal }));
  assert.equal(attempts, 1);
  const response = await transport(`${project}/auth/v1/user`);
  assert.equal(attempts, 3);
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /Check your connection/);
});
