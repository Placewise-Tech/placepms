import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { generateStarterPlan } from '../src/lib/idea-plan.ts';
import { createWorkspaceHandler } from '../server/workspace.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const session = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner, session_id: session })).toString('base64url')}.fixture`;
const env = { SUPABASE_URL: 'https://idea-workspace.example.test', SUPABASE_SECRET_KEY: 'fixture-admin', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public' };
const plan = () => generateStarterPlan({ idea: 'Build a campus placement portal', weeks: 6, startDate: '2026-10-10', teamSize: 4, domain: 'web' }, randomUUID);

async function fixture(t) {
  const tables = { pms_squads: new Map(), milestones: new Map(), workspace_library: new Map() };
  let failedMilestones = false; let failOnce = false; let docs = true; let passwordSetup = false;
  const original = globalThis.fetch;
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === '127.0.0.1') return original(input, options);
    const headers = new Headers(options.headers); const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname === '/auth/v1/user') return Response.json({ id: owner, email: 'owner@example.test', app_metadata: { must_change_password: passwordSetup } });
    if (url.pathname.endsWith('/workspace_session_active')) return Response.json(true);
    if (url.pathname.endsWith('/workspace_feature_access')) return Response.json(docs);
    if (url.pathname.endsWith('/workspace_accounts')) return Response.json(null);
    const table = url.pathname.split('/').at(-1); const rows = tables[table];
    assert.ok(rows, `Unexpected table ${table}`);
    if (method === 'POST') {
      if (table === 'milestones' && failOnce && !failedMilestones) { failedMilestones = true; return Response.json({ code: '08006', message: 'Transient database failure' }, { status: 503 }); }
      const inputRows = Array.isArray(body) ? body : [body];
      for (const row of inputRows) {
        if (rows.has(row.id) && !headers.get('prefer')?.includes('ignore-duplicates')) return Response.json({ code: '23505', message: 'Duplicate id' }, { status: 409 });
        if (!rows.has(row.id)) { rows.set(row.id, row); writes.push({ table, row, authorization: headers.get('authorization') }); }
      }
      return Response.json(headers.get('accept')?.includes('object') ? inputRows[0] : inputRows, { status: 201 });
    }
    const matched = [...rows.values()].filter(row => {
      for (const [key, filter] of url.searchParams) {
        if (filter.startsWith('eq.') && String(row[key]) !== filter.slice(3)) return false;
        if (filter.startsWith('in.(') && !filter.slice(4, -1).split(',').includes(String(row[key]))) return false;
      }
      return true;
    });
    return Response.json(headers.get('accept')?.includes('object') ? matched[0] || null : matched);
  });
  const server = createServer(createWorkspaceHandler(env));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = draft => fetch(`http://127.0.0.1:${server.address().port}/api/workspace`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'project.from-plan', plan: draft }) });
  return { post, tables, writes, failMilestones: () => { failOnce = true; }, disableDocs: () => { docs = false; }, requirePassword: () => { passwordSetup = true; } };
}

test('plan import creates owned project, pending milestones, and saved outlines once; retries preserve edited records', async t => {
  const app = await fixture(t); const draft = plan();
  const response = await app.post(draft);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projectId: draft.id, milestones: 5, documentSaved: true, blackbookSaved: true });
  assert.equal(app.tables.pms_squads.size, 1); assert.equal(app.tables.milestones.size, 5); assert.equal(app.tables.workspace_library.size, 2);
  assert.equal(app.tables.pms_squads.get(draft.id).leader_email, 'owner@example.test');
  assert.match(app.tables.pms_squads.get(draft.id).summary, /Suggested team responsibilities/);
  assert.ok(app.writes.every(write => write.authorization === `Bearer ${token}`));
  for (const row of app.tables.milestones.values()) assert.equal(row.status, 'PENDING');
  const book = [...app.tables.workspace_library.values()].find(row => row.tags.includes('blackbook-draft'));
  assert.match(JSON.parse(book.notes).sections.Abstract, /Planning outline/);
  app.tables.milestones.get(draft.milestones[0].id).name = 'User-edited delivery';
  assert.equal((await app.post(draft)).status, 200);
  assert.equal(app.tables.pms_squads.size, 1); assert.equal(app.tables.milestones.size, 5); assert.equal(app.tables.workspace_library.size, 2);
  assert.equal(app.tables.milestones.get(draft.milestones[0].id).name, 'User-edited delivery');
});

test('partial imports resume the same project and disabled documents do not block milestone creation', async t => {
  const app = await fixture(t); const draft = plan(); app.failMilestones();
  assert.equal((await app.post(draft)).status, 503);
  assert.equal(app.tables.pms_squads.size, 1); assert.equal(app.tables.milestones.size, 0);
  app.disableDocs();
  const response = await app.post(draft);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projectId: draft.id, milestones: 5, documentSaved: false, blackbookSaved: false });
  assert.equal(app.tables.pms_squads.size, 1); assert.equal(app.tables.milestones.size, 5);
});

test('invalid plans, another owner’s project, and unfinished password setup cannot be imported', async t => {
  const app = await fixture(t); const draft = plan();
  assert.equal((await app.post({ ...draft, title: '' })).status, 400);
  assert.equal(app.writes.length, 0);
  app.tables.pms_squads.set(draft.id, { id: draft.id, leader_email: 'other@example.test', status: 'PENDING' });
  assert.equal((await app.post(draft)).status, 403);
  assert.equal(app.tables.milestones.size, 0);
  app.requirePassword();
  assert.equal((await app.post(plan())).status, 403);
});
