import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createIdeaPlanHandler } from '../server/idea-plan.ts';

const input = { idea: 'Build a campus placement portal in six weeks', weeks: 6, startDate: '2026-10-10', teamSize: 4, domain: 'web' };
async function fixture(t, env = {}) {
  const server = createServer(createIdeaPlanHandler(env));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (body, method = 'POST') => fetch(`http://127.0.0.1:${server.address().port}/api/idea-plan`, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}

test('public planner works without an AI key and rejects malformed or oversized inputs', async t => {
  const post = await fixture(t);
  const response = await post(input);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { plan } = await response.json();
  assert.equal(plan.source, 'starter');
  assert.equal(plan.title, 'Campus Placement Portal');
  assert.equal((await post({ ...input, idea: 'short' })).status, 400);
  assert.equal((await post({ ...input, idea: 'x'.repeat(40000) })).status, 413);
  assert.equal((await post({}, 'GET')).status, 405);
});

test('AI planning stays server-side, validates generated content, and has a useful fallback', async t => {
  let failure = false; let allowed = true; let providerCalls = 0;
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.hostname === '127.0.0.1') return original(url, init);
    if (target.pathname.endsWith('claim_signup_attempt')) return Response.json(allowed);
    assert.equal(target.href, 'https://planner.example.test/v1/chat/completions');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-planner-secret');
    providerCalls++;
    if (failure) return Response.json({ error: 'Provider failed' }, { status: 503 });
    const request = JSON.parse(init.body); const context = JSON.parse(request.messages[1].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ title: 'Placement Compass', summary: 'A focused student placement platform.', objectives: ['Track applications and placement opportunities.'], milestones: context.phases.map(item => ({ name: `${item.title} checkpoint`, description: `Complete the ${item.title.toLowerCase()} checkpoint for the placement portal.` })), roles: Array.from({ length: context.teamSize }, (_, index) => ({ title: `Contributor ${index + 1}`, responsibility: 'Own the agreed project responsibilities.' })), chapterPrompts: context.chapters.map(title => `Write the ${title.toLowerCase()} from your project evidence.`) }) } }] });
  });
  const post = await fixture(t, { IDEA_PLANNER_API_KEY: 'fixture-planner-secret', IDEA_PLANNER_BASE_URL: 'https://planner.example.test/v1/', SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEY: 'fixture-admin', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public' });
  const generated = await (await post(input)).json();
  assert.equal(generated.plan.source, 'ai');
  assert.equal(generated.plan.title, 'Placement Compass');
  assert.equal(generated.plan.phases[0].startDate, input.startDate);
  assert.ok(!JSON.stringify(generated).includes('fixture-planner-secret'));
  failure = true;
  const fallback = await (await post(input)).json();
  assert.equal(fallback.plan.source, 'starter');
  assert.match(fallback.notice, /unavailable/);
  allowed = false;
  assert.equal((await post(input)).status, 429);
  assert.equal(providerCalls, 2);
});
