import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const invitee = '22222222-2222-4222-8222-222222222222';
const decliner = '33333333-3333-4333-8333-333333333333';
const ownerSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const inviteeSession = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const declinerSession = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    create table public.profiles(id uuid primary key, email text, full_name text);
    create table public.workspace_accounts(user_id uuid primary key, enabled boolean default true);
    create table public.pms_squads(id text primary key, title text, leader_email text, mentor_id text, status text default 'PENDING');
    create table public.squad_members(id text primary key default gen_random_uuid()::text, squad_id text, user_id uuid, name text, email text, role text, skills text[]);
    insert into auth.users(id,email) values ('${owner}','owner@example.test'), ('${invitee}','invitee@example.test'), ('${decliner}','decliner@example.test');
    insert into public.profiles values ('${owner}','owner@example.test','Project Owner'), ('${invitee}','invitee@example.test','Registered Teammate'), ('${decliner}','decliner@example.test','Declining Teammate');
    insert into public.workspace_accounts values ('${owner}',true),('${invitee}',true),('${decliner}',true);
    insert into public.pms_squads values ('project','Shared Project','owner@example.test',null,'PENDING');
    create function public.has_completed_password_setup() returns boolean language sql stable security definer set search_path = '' as $$ select true $$;
    create function public.workspace_is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select false $$;
    create function public.workspace_project_owner(p_project_id text) returns boolean language sql stable security definer set search_path = '' as $$
      select public.has_completed_password_setup() and exists(select 1 from public.pms_squads where id=p_project_id and lower(leader_email)=lower(auth.jwt()->>'email'))
    $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/202610080001_project_member_invitations.sql', import.meta.url), 'utf8'));
});

after(async () => db.close());

async function asUser(user, session, email, callback) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, session_id: session, role: 'authenticated', email })]);
  await db.exec('set role authenticated');
  try { return await callback(); } finally { await db.exec('reset role; reset request.jwt.claims;'); }
}

test('registered project invitations are owner-scoped and acceptance creates shared access', async () => {
  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    const directory = (await db.query("select public.workspace_project_directory('project','registered',1) as value")).rows[0].value;
    assert.deepEqual(directory.people, [{ id: invitee, email: 'invitee@example.test', full_name: 'Registered Teammate' }]);
    const sent = (await db.query('select public.workspace_send_project_invitation($1,$2) as value', ['project', invitee])).rows[0].value;
    assert.equal(sent.saved, true);
    await assert.rejects(db.query('select * from public.project_member_invitations'), /permission denied/);
  });

  await asUser(invitee, inviteeSession, 'invitee@example.test', async () => {
    const pending = (await db.query('select public.workspace_list_project_invitations() as value')).rows[0].value;
    assert.equal(pending.invitations[0].projectTitle, 'Shared Project');
    const accepted = (await db.query('select public.workspace_accept_project_invitation($1) as value', [pending.invitations[0].id])).rows[0].value;
    assert.equal(accepted.projectId, 'project');
    await db.exec('reset role');
    assert.deepEqual((await db.query('select name,email,user_id from public.squad_members')).rows, [{ name: 'Registered Teammate', email: 'invitee@example.test', user_id: invitee }]);
    await db.exec('set role authenticated');
    assert.equal((await db.query("select public.workspace_project_access('project') as allowed")).rows[0].allowed, true);
    await assert.rejects(db.query('select public.workspace_accept_project_invitation($1)', [pending.invitations[0].id]), /no longer available/);
  });

  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    await db.exec('reset role');
    assert.equal((await db.query('select status from public.project_member_invitations')).rows[0].status, 'accepted');
    await db.exec('set role authenticated');
  });

  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    await db.query('select public.workspace_send_project_invitation($1,$2)', ['project', decliner]);
  });
  await asUser(decliner, declinerSession, 'decliner@example.test', async () => {
    const pending = (await db.query('select public.workspace_list_project_invitations() as value')).rows[0].value;
    assert.equal(pending.invitations.length, 1);
    await db.query('select public.workspace_reject_project_invitation($1)', [pending.invitations[0].id]);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select name from public.squad_members')).rows, [{ name: 'Registered Teammate' }]);
    await db.exec('set role authenticated');
  });
  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    await db.exec('reset role');
    assert.equal((await db.query("select status from public.project_member_invitations where invitee_id=$1", [decliner])).rows[0].status, 'rejected');
    await db.exec('set role authenticated');
  });
});

test('a non-lead cannot list or send project invitations', async () => {
  await asUser(invitee, inviteeSession, 'invitee@example.test', async () => {
    await assert.rejects(db.query("select public.workspace_project_directory('project','',1)"), /Only the project lead/);
    await assert.rejects(db.query('select public.workspace_send_project_invitation($1,$2)', ['project', owner]), /Only the project lead/);
  });
});
