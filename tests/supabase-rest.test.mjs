import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSupabaseRestProxy } from '../server/supabase-rest.ts';

const env = { SUPABASE_URL: 'https://workspace.example.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' };

test('Supabase REST proxy only forwards allowed REST paths with the user bearer token', async t => {
  const original = globalThis.fetch;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    if (new URL(String(input)).hostname === '127.0.0.1') return original(input, options);
    requests.push({ input: String(input), options });
    return Response.json([{ id: 'project' }], { headers: { 'content-range': '0-0/1' } });
  });
  const server = createServer(createSupabaseRestProxy(env));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/supabase`;
  const allowed = await fetch(`${base}?path=${encodeURIComponent('/rest/v1/pms_squads?select=id')}`, { headers: { Authorization: 'Bearer user-session', Prefer: 'return=representation' } });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json())[0].id, 'project');
  assert.equal(requests[0].input, 'https://workspace.example.test/rest/v1/pms_squads?select=id');
  assert.equal(requests[0].options.headers.get('apikey'), 'public-key');
  assert.equal(requests[0].options.headers.get('authorization'), 'Bearer user-session');
  const blocked = await fetch(`${base}?path=${encodeURIComponent('/auth/v1/user')}`);
  assert.equal(blocked.status, 400);
  assert.equal(requests.length, 1);
});
