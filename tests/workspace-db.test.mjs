import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const mentor = '33333333-3333-4333-8333-333333333333';
const firstSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondSession = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherSession = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const mentorSession = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb, encrypted_password text);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), user_agent text, ip inet);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth to authenticated;
    create table public.profiles(id uuid primary key, full_name text);
    create table public.pms_squads(id text primary key, mentor_id text, leader_email text);
    create table public.squad_members(id text primary key, squad_id text, email text);
    create table public.milestones(id text primary key, squad_id text, status text, score numeric, mentor_feedback text);
    grant select, insert, update, delete on public.profiles, public.pms_squads, public.milestones to authenticated;
    alter table public.profiles enable row level security;
    create policy own_profile on public.profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
    create policy squad_access on public.pms_squads to authenticated using(true) with check(true);
    create policy milestone_access on public.milestones to authenticated using(true) with check(true);
    insert into auth.users values ('${owner}','{}','hash'), ('${other}','{}','hash'), ('${mentor}','{}','hash');
    insert into auth.sessions(id,user_id) values ('${firstSession}','${owner}'), ('${secondSession}','${owner}'), ('${otherSession}','${other}'), ('${mentorSession}','${mentor}');
    insert into public.profiles values ('${owner}','Owner'), ('${other}','Other');
    insert into public.pms_squads values ('project','${mentor}','owner@example.test');
    insert into public.milestones values ('milestone','project','SUBMITTED',null,null);
  `);
  for (const migration of ['202610030001_temporary_password_signup.sql', '202610030002_workspace_integrations.sql']) await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/202610030002_workspace_integrations.sql', import.meta.url), 'utf8'));
});
after(async () => db.close());
async function asUser(user, session, callback) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, session_id: session, role: 'authenticated', email: user === owner ? 'owner@example.test' : 'mentor@example.test' })]);
  await db.exec('set role authenticated');
  try { return await callback(); } finally { await db.exec("reset role; reset request.jwt.claims;"); }
}

test('integration tokens and OAuth states cannot be read by authenticated browser clients', async () => {
  await asUser(owner, firstSession, async () => {
    for (const table of ['integration_connections', 'integration_oauth_states', 'workspace_api_limits']) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
    await assert.rejects(db.query(`select public.workspace_session_active('${owner}','${firstSession}')`), /permission denied/);
  });
});

test('library entries are private, editable by their owner, and isolated from other accounts', async () => {
  await asUser(owner, firstSession, async () => {
    await db.query("insert into public.workspace_library(kind,title,notes) values ('research','A paper','Private notes')");
    assert.equal((await db.query('select * from public.workspace_library')).rows.length, 1);
    await assert.rejects(db.query(`insert into public.workspace_library(user_id,kind,title) values ('${other}','resource','Forged')`), /row-level security/);
  });
  await asUser(other, otherSession, async () => { assert.deepEqual((await db.query('select * from public.workspace_library')).rows, []); });
});

test('students cannot forge approval or feedback; assigned mentors can review', async () => {
  await asUser(owner, firstSession, async () => {
    await assert.rejects(db.query('update public.pms_squads set mentor_id=$1 where id=$2', [owner, 'project']), /cannot be their own/);
    await assert.rejects(db.query("update public.milestones set status='APPROVED' where id='milestone'"), /Only the assigned mentor/);
    await assert.rejects(db.query("update public.milestones set score=100 where id='milestone'"), /Only the assigned mentor/);
  });
  await asUser(mentor, mentorSession, async () => { await db.query("update public.milestones set status='APPROVED',score=90,mentor_feedback='Reviewed' where id='milestone'"); });
});

test('legacy permissive policies cannot expose another team’s projects or milestones', async () => {
  await asUser(other, otherSession, async () => {
    assert.deepEqual((await db.query('select * from public.pms_squads')).rows, []);
    assert.deepEqual((await db.query('select * from public.milestones')).rows, []);
    await assert.rejects(db.query("insert into public.pms_squads(id,leader_email) values ('forged','owner@example.test')"), /row-level security/);
  });
});

test('project creation with RETURNING works before the new row is visible to stable lookup functions', async () => {
  await asUser(owner, firstSession, async () => {
    const result = await db.query("insert into public.pms_squads(id,leader_email) values ('new-project','owner@example.test') returning id");
    assert.deepEqual(result.rows, [{ id: 'new-project' }]);
    const milestone = await db.query("insert into public.milestones(id,squad_id,status) values ('new-task','new-project','PENDING') returning id");
    assert.deepEqual(milestone.rows, [{ id: 'new-task' }]);
  });
});

test('sessions are scoped to the user and revoking another account session has no effect', async () => {
  await asUser(owner, firstSession, async () => {
    const sessions = (await db.query('select * from public.workspace_list_sessions()')).rows;
    assert.equal(sessions.length, 2);
    assert.equal(sessions.filter(row => row.current_session).length, 1);
    assert.equal((await db.query('select public.workspace_revoke_session($1,false) as count', [otherSession])).rows[0].count, 0);
    assert.equal((await db.query('select public.workspace_revoke_session(null,true) as count')).rows[0].count, 1);
  });
  await asUser(owner, secondSession, async () => {
    assert.deepEqual((await db.query('select * from public.profiles')).rows, []);
    assert.deepEqual((await db.query('select * from public.workspace_library')).rows, []);
    await assert.rejects(db.query("insert into public.workspace_library(kind,title) values ('document','Forged after revoke')"), /row-level security/);
  });
});

test('the refresh lease permits only one token refresh at a time', async () => {
  await db.query("insert into public.integration_connections(user_id,provider,mode,account,credentials) values ($1,'github','oauth','owner','encrypted')", [owner]);
  assert.equal((await db.query("select public.workspace_claim_token_refresh($1,'github') as allowed", [owner])).rows[0].allowed, true);
  assert.equal((await db.query("select public.workspace_claim_token_refresh($1,'github') as allowed", [owner])).rows[0].allowed, false);
});

test('provider request throttling is per account and resets by time window', async () => {
  for (let i = 0; i < 30; i++) assert.equal((await db.query('select public.claim_workspace_request($1) as allowed', [owner])).rows[0].allowed, true);
  assert.equal((await db.query('select public.claim_workspace_request($1) as allowed', [owner])).rows[0].allowed, false);
  assert.equal((await db.query('select public.claim_workspace_request($1) as allowed', [other])).rows[0].allowed, true);
});
