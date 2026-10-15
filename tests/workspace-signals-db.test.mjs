import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const mentor = '33333333-3333-4333-8333-333333333333';
const ownerSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outsiderSession = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mentorSession = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, raw_app_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    create table public.profiles(id uuid primary key, full_name text);
    create table public.workspace_accounts(user_id uuid primary key, enabled boolean default true, can_mentor boolean default false);
    create table public.pms_squads(id text primary key, title text, leader_email text, mentor_id text);
    create table public.squad_members(id text primary key, squad_id text, user_id uuid, name text, email text);
    create table public.milestones(id text primary key, squad_id text, name text, status text, score numeric, mentor_feedback text);
    create function public.has_completed_password_setup() returns boolean language sql stable security definer set search_path = '' as $$ select true $$;
    create function public.workspace_is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select false $$;
    create function public.workspace_project_access(p_project_id text) returns boolean language sql stable security definer set search_path = '' as $$
      select public.has_completed_password_setup() and exists (
        select 1 from public.pms_squads p where p.id = p_project_id and (
          lower(p.leader_email) = lower(auth.jwt() ->> 'email')
          or p.mentor_id = auth.uid()::text or lower(p.mentor_id) = lower(auth.jwt() ->> 'email')
          or exists (select 1 from public.squad_members m where m.squad_id = p.id and (m.user_id = auth.uid() or lower(m.email) = lower(auth.jwt() ->> 'email')))
        )
      )
    $$;
    create function public.workspace_project_owner(p_project_id text) returns boolean language sql stable security definer set search_path = '' as $$
      select public.has_completed_password_setup() and exists (select 1 from public.pms_squads where id = p_project_id and lower(leader_email) = lower(auth.jwt() ->> 'email'))
    $$;
    grant usage on schema auth to authenticated;
    grant select on public.pms_squads, public.squad_members, public.milestones to authenticated;
    grant update on public.milestones to authenticated;
    alter table public.pms_squads enable row level security;
    alter table public.squad_members enable row level security;
    alter table public.milestones enable row level security;
    create policy project_read on public.pms_squads for select to authenticated using (public.workspace_project_access(id));
    create policy member_read on public.squad_members for select to authenticated using (public.workspace_project_access(squad_id));
    create policy milestone_access on public.milestones for all to authenticated using (public.workspace_project_access(squad_id)) with check (public.workspace_project_access(squad_id));
    insert into auth.users(id,email) values
      ('${owner}','owner@example.test'), ('${outsider}','outsider@example.test'), ('${mentor}','mentor@example.test');
    insert into public.profiles values ('${owner}','Project Owner'), ('${outsider}','Outside Student'), ('${mentor}','Assigned Mentor');
    insert into public.workspace_accounts values ('${owner}',true,false), ('${outsider}',true,false), ('${mentor}',true,true);
    insert into public.pms_squads values ('project','Connected Project','owner@example.test','${mentor}'), ('other-project','Other Project','outsider@example.test','${mentor}');
    insert into public.milestones values ('milestone','project','Project delivery','PENDING',null,null), ('other-milestone','other-project','Other delivery','PENDING',null,null);
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/202610140001_workspace_signals.sql', import.meta.url), 'utf8'));
});

after(async () => db.close());

async function asUser(user, session, email, callback) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, session_id: session, role: 'authenticated', email })]);
  await db.exec('set role authenticated');
  try { return await callback(); } finally { await db.exec('reset role; reset request.jwt.claims;'); }
}

test('evidence scope, milestone matching, and mentor verification are enforced', async () => {
  let evidenceId;
  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    const created = await db.query("insert into public.workspace_evidence(project_id,milestone_id,author_id,kind,title,url) values ('project','milestone',$1,'LINK','Owner evidence','https://example.test/evidence') returning id", [owner]);
    evidenceId = created.rows[0].id;
    await assert.rejects(
      db.query("insert into public.workspace_evidence(project_id,milestone_id,author_id,kind,title,url) values ('project','other-milestone',$1,'LINK','Wrong milestone','https://example.test/wrong')", [owner]),
      /Choose a milestone in this project/
    );
    await assert.rejects(
      db.query("insert into public.workspace_comments(project_id,milestone_id,author_id,body) values ('project','other-milestone',$1,'Wrong milestone comment')", [owner]),
      /Choose a milestone in this project/
    );
    await assert.rejects(
      db.query("insert into public.workspace_comments(project_id,author_id,body,mentions) values ('project',$1,'Outside mention',$2)", [owner, [outsider]]),
      /Mention only an enabled person connected to this project/
    );
    await db.query("insert into public.workspace_comments(project_id,author_id,body,mentions) values ('project',$1,'Mentor mention',$2)", [owner, [mentor]]);
    assert.equal((await db.query('select count(*)::int as count from public.workspace_evidence')).rows[0].count, 1);
    const summary = (await db.query("select project_id, recorded, verified from public.workspace_evidence_summary() where project_id='project'")).rows[0];
    assert.equal(summary.project_id, 'project');
    assert.equal(Number(summary.recorded), 1);
    assert.equal(Number(summary.verified), 0);
  });

  await asUser(outsider, outsiderSession, 'outsider@example.test', async () => {
    assert.deepEqual((await db.query("select id from public.workspace_evidence where project_id='project'")).rows, []);
    await assert.rejects(
      db.query("insert into public.workspace_evidence(project_id,author_id,kind,title,url) values ('project',$1,'LINK','Forged evidence','https://example.test/forged')", [outsider]),
      /row-level security|permission denied/
    );
  });

  await asUser(mentor, mentorSession, 'mentor@example.test', async () => {
    await db.query('update public.workspace_evidence set verified=true where id=$1', [evidenceId]);
    const verified = (await db.query('select verified,verified_by,verified_at from public.workspace_evidence where id=$1', [evidenceId])).rows[0];
    assert.equal(verified.verified, true);
    assert.equal(verified.verified_by, mentor);
    assert.ok(verified.verified_at);
    const summary = (await db.query("select project_id, recorded, verified from public.workspace_evidence_summary() where project_id='project'")).rows[0];
    assert.equal(summary.project_id, 'project');
    assert.equal(Number(summary.recorded), 1);
    assert.equal(Number(summary.verified), 1);
    const own = await db.query("insert into public.workspace_evidence(project_id,milestone_id,author_id,kind,title,url) values ('project','milestone',$1,'LINK','Mentor evidence','https://example.test/mentor') returning id", [mentor]);
    await assert.rejects(db.query('update public.workspace_evidence set verified=true where id=$1', [own.rows[0].id]), /You cannot verify your own evidence/);
  });

  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    assert.deepEqual((await db.query('delete from public.workspace_evidence where id=$1 returning id', [evidenceId])).rows, []);
    const removable = await db.query("insert into public.workspace_evidence(project_id,author_id,kind,title,url) values ('project',$1,'LINK','Removable evidence','https://example.test/removable') returning id", [owner]);
    await db.query('delete from public.workspace_evidence where id=$1', [removable.rows[0].id]);
    assert.equal((await db.query('select count(*)::int as count from public.workspace_evidence where id=$1', [removable.rows[0].id])).rows[0].count, 0);
  });
});

test('milestone and comment actions create scoped notifications and read ownership is enforced', async () => {
  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    await db.query("update public.milestones set status='SUBMITTED' where id='milestone'");
    assert.deepEqual((await db.query("select kind,title from public.workspace_notifications where user_id=$1", [owner])).rows, []);
  });

  let submittedId;
  await asUser(mentor, mentorSession, 'mentor@example.test', async () => {
    const submitted = (await db.query("select id,kind from public.workspace_notifications where user_id=$1 and kind='milestone.submitted'", [mentor])).rows;
    assert.equal(submitted.length, 1);
    submittedId = submitted[0].id;
    await db.query("update public.milestones set status='APPROVED',score=90,mentor_feedback='Approved delivery' where id='milestone'");
  });

  let ownerNotificationId;
  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    const decisions = (await db.query("select id,kind,project_id,milestone_id from public.workspace_notifications where user_id=$1 order by created_at", [owner])).rows;
    assert.deepEqual(decisions.map(item => item.kind), ['milestone.approved']);
    assert.equal(decisions[0].project_id, 'project');
    assert.equal(decisions[0].milestone_id, 'milestone');
    ownerNotificationId = decisions[0].id;
    await db.query('select public.workspace_mark_notification_read($1,true)', [ownerNotificationId]);
    assert.ok((await db.query('select read_at from public.workspace_notifications where id=$1', [ownerNotificationId])).rows[0].read_at);
    await assert.rejects(db.query('select public.workspace_mark_notification_read($1,true)', [submittedId]), /Notification no longer available/);
  });

  await asUser(mentor, mentorSession, 'mentor@example.test', async () => {
    await db.query("update public.milestones set status='SUBMITTED' where id='milestone'");
    await db.query("update public.milestones set status='REVISION_REQUESTED',mentor_feedback='Add more context' where id='milestone'");
    const kinds = (await db.query("select kind from public.workspace_notifications where user_id=$1 order by created_at", [mentor])).rows.map(row => row.kind);
    assert.deepEqual(kinds, ['comment.mention', 'milestone.submitted', 'milestone.approved', 'milestone.submitted', 'milestone.revision']);
  });

  await asUser(owner, ownerSession, 'owner@example.test', async () => {
    const ownerKinds = (await db.query("select kind from public.workspace_notifications where user_id=$1 order by created_at", [owner])).rows.map(row => row.kind);
    assert.deepEqual(ownerKinds, ['milestone.approved', 'milestone.revision']);
    assert.equal((await db.query("select count(*)::int as count from public.workspace_notifications where user_id=$1 and read_at is not null", [owner])).rows[0].count, 1);
  });
});
