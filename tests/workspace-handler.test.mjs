import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createWorkspaceHandler } from '../server/workspace.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const session = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner, session_id: session })).toString('base64url')}.fixture`;
const env = { SUPABASE_URL: 'https://workspace.example.test', SUPABASE_SECRET_KEY: 'fixture-admin', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public' };

async function fixture(t) {
  const project = { id: 'project', leader_email: 'owner@example.test', mentor_id: 'mentor-id' };
  const member = { id: 'member', squad_id: 'project', name: 'Teammate', email: 'member@example.test', role: 'Member', skills: [] };
  const milestone = { id: 'milestone', squad_id: 'project', status: 'PENDING' };
  const writes = []; let email = project.leader_email; let active = true;
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(String(input)); if (url.hostname === '127.0.0.1') return original(input, options);
    const headers = new Headers(options.headers); const method = options.method || 'GET'; const body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname === '/auth/v1/user') return Response.json({ id: owner, email, app_metadata: {} });
    if (url.pathname.endsWith('/workspace_session_active')) return Response.json(active);
    const row = url.pathname.endsWith('/pms_squads') ? project : url.pathname.endsWith('/squad_members') ? member : milestone;
    const matched = (!url.searchParams.has('id') || `eq.${row.id}` === url.searchParams.get('id')) && (!url.searchParams.has('email') || `eq.${row.email}` === url.searchParams.get('email')) && (!url.searchParams.has('status') || `eq.${row.status}` === url.searchParams.get('status'));
    if (method === 'PATCH') { writes.push({ path: url.pathname, filters: url.search, body }); if (matched) Object.assign(row, body); }
    return Response.json(headers.get('accept')?.includes('object') ? matched ? row : null : matched ? [row] : []);
  });
  const server = createServer(createWorkspaceHandler(env)); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/workspace`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ projectId: project.id, ...body }) });
  return { post, project, member, milestone, writes, asMember: () => { email = member.email; }, revoke: () => { active = false; } };
}

test('member editing is lead-only, project-scoped, and updates existing records without duplicates', async t => {
  const app = await fixture(t);
  const result = await app.post({ action: 'member.update', memberId: 'member', name: 'Updated teammate', email: 'member@example.test', role: 'Research lead', skills: 'Research, Figma, Research' });
  assert.equal(result.status, 200); assert.equal(app.member.name, 'Updated teammate'); assert.deepEqual(app.member.skills, ['Research', 'Figma']);
  assert.match(app.writes[0].filters, /squad_id=eq\.project/);
  app.asMember();
  assert.equal((await app.post({ action: 'member.update', memberId: 'member', name: 'Forged', email: 'member@example.test' })).status, 403);
  assert.equal(app.member.name, 'Updated teammate');
});

test('submission operations enforce expected state, withdrawal, completion, and active sessions', async t => {
  const app = await fixture(t);
  assert.equal((await app.post({ action: 'milestone.submit', milestoneId: 'milestone' })).status, 200);
  assert.equal(app.milestone.status, 'SUBMITTED'); assert.ok(app.milestone.submitted_at);
  assert.equal((await app.post({ action: 'milestone.submit', milestoneId: 'milestone' })).status, 409);
  assert.equal((await app.post({ action: 'milestone.submit', milestoneId: 'milestone', withdraw: true })).status, 200);
  assert.equal(app.milestone.status, 'PENDING'); assert.equal(app.milestone.submitted_at, null);
  app.milestone.status = 'APPROVED';
  assert.equal((await app.post({ action: 'milestone.submit', milestoneId: 'milestone' })).status, 409);
  app.revoke();
  assert.equal((await app.post({ action: 'milestone.submit', milestoneId: 'milestone' })).status, 401);
});
