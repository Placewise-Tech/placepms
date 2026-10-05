import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const users={admin:'11111111-1111-4111-8111-111111111111',teacher:'22222222-2222-4222-8222-222222222222',staff:'33333333-3333-4333-8333-333333333333',student:'44444444-4444-4444-8444-444444444444',other:'55555555-5555-4555-8555-555555555555'};
const sessions=Object.fromEntries(Object.keys(users).map((role,index)=>[role,`${String(index+1).repeat(8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`]));
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',encrypted_password text default 'hash');
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),user_agent text,ip inet);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    grant usage on schema auth to authenticated;
    create table public.profiles(id uuid primary key,email text,full_name text,college text,role text);
    create table public.pms_squads(id text primary key,leader_email text,mentor_id text);
    create table public.squad_members(id text primary key,squad_id text,email text);
    create table public.milestones(id text primary key,squad_id text,status text,score numeric,mentor_feedback text);
    grant select,insert,update,delete on public.profiles,public.pms_squads,public.squad_members,public.milestones to authenticated;
    alter table public.profiles enable row level security;
    create policy own_profile on public.profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
    create policy old_project_policy on public.pms_squads to authenticated using(true) with check(true);
    create policy old_milestone_policy on public.milestones to authenticated using(true) with check(true);`);
  for(const [role,id] of Object.entries(users)){
    await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${role}@example.test`]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[role],id]);
    await db.query('insert into public.profiles values($1,$2,$3,$4,$5)',[id,`${role}@example.test`,role,'College','student']);
  }
  await db.query("insert into public.pms_squads values('assigned','student@example.test',$1),('elsewhere','other@example.test',$2)",[users.teacher,users.staff]);
  await db.exec("insert into public.milestones values('delivery','assigned','SUBMITTED',null,null),('other-delivery','elsewhere','SUBMITTED',null,null)");
  for(const migration of ['202610030001_temporary_password_signup.sql','202610030002_workspace_integrations.sql','202610050001_workspace_management.sql','202610050001_workspace_management.sql'])await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
  await db.query('select public.workspace_bootstrap_admin($1)',[users.admin]);
  await db.query("select public.workspace_register_account($1,$2,'teacher',true,'Teaching')",[users.admin,users.teacher]);
  await db.query("select public.workspace_register_account($1,$2,'staff',true,'Support')",[users.admin,users.staff]);
  for(const role of ['admin','teacher','staff'])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[role],users[role]]);
});
after(async()=>db.close());
async function as(role,fn){
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:users[role],role:'authenticated',session_id:sessions[role],email:`${role}@example.test`,app_metadata:{workspace_role:'admin'}})]);
  await db.exec('set role authenticated');try{return await fn();}finally{await db.exec('reset role;reset request.jwt.claims;');}
}

test('privileged roles cannot be self-assigned through profile data, forged claims, or direct RPCs',async()=>{
  await as('student',async()=>{
    await db.exec("update public.profiles set role='admin' where email='student@example.test'");
    assert.equal((await db.query('select public.workspace_is_admin() as allowed')).rows[0].allowed,false);
    assert.deepEqual((await db.query('select id from public.pms_squads order by id')).rows,[{id:'assigned'}]);
    for(const sql of [`select * from public.workspace_accounts`,`select public.workspace_bootstrap_admin('${users.student}')`,`select public.workspace_list_accounts()`])await assert.rejects(db.query(sql),/permission denied|Administrator access/);
    await assert.rejects(db.query('select public.workspace_update_account($1,$2,true,true,$3)',[users.student,'admin','']),/Administrator access/);
  });
});
test('administrators see every project, manage other leads, and cannot demote or disable themselves',async()=>{
  await as('admin',async()=>{
    assert.equal((await db.query('select id from public.pms_squads')).rows.length,2);
    assert.equal((await db.query('select public.workspace_list_accounts() as value')).rows[0].value.total,5);
    await db.query("update public.pms_squads set leader_email='other@example.test' where id='elsewhere'");
    await assert.rejects(db.query('select public.workspace_update_account($1,$2,false,false,$3)',[users.admin,'student','']),/own administrator access/);
  });
});
test('teachers and staff are restricted to assigned projects and cannot choose their own mentor assignments',async()=>{
  await as('teacher',async()=>{
    assert.deepEqual((await db.query('select id from public.pms_squads')).rows,[{id:'assigned'}]);
    await assert.rejects(db.query('select public.workspace_list_accounts()'),/Administrator access/);
    await db.exec("update public.milestones set status='APPROVED',score=91,mentor_feedback='Reviewed' where id='delivery'");
  });
  await as('staff',async()=>{assert.deepEqual((await db.query('select id from public.pms_squads')).rows,[{id:'elsewhere'}]);});
  await as('student',async()=>{await assert.rejects(db.query("update public.pms_squads set mentor_id=$1 where id='assigned'",[users.student]),/Only an administrator/);});
  await as('admin',async()=>{
    await assert.rejects(db.query("update public.pms_squads set mentor_id=$1 where id='elsewhere'",[users.other]),/enabled teacher or staff/);
    await db.query("update public.pms_squads set mentor_id=$1 where id='elsewhere'",[users.staff]);
  });
});
test('feature controls protect direct library requests while preserving administrator management',async()=>{
  await as('student',()=>db.exec("insert into public.workspace_library(kind,title) values('research','Student notes')"));
  await as('teacher',async()=>{assert.equal((await db.query('select * from public.workspace_library')).rows.length,0);});
  await as('admin',async()=>{
    assert.equal((await db.query('select * from public.workspace_library')).rows.length,1);
    await db.query('select public.workspace_manage_settings(false,$1)',[JSON.stringify({research:false})]);
    assert.equal((await db.query('select * from public.workspace_library')).rows.length,1);
  });
  assert.equal((await db.query('select public.workspace_signup_open() as open')).rows[0].open,false);
  await as('student',async()=>{assert.equal((await db.query('select * from public.workspace_library')).rows.length,0);await assert.rejects(db.exec("insert into public.workspace_library(kind,title) values('research','Bypass')"),/row-level security/);});
});
test('saved GitHub pages deduplicate AI flags and are visible only to their owner, admin, and assigned educators',async()=>{
  const commit=(sha,flagged)=>({sha:sha.repeat(40),committedAt:'2026-01-01T00:00:00Z',aiAssistance:{flagged},message:flagged?'Change\n\nAI-Assisted: true':'Change'});
  const payload=(commits,pages)=>({provider:'github',github:{repository:{name:'owner/repo'},branch:'main',window:{since:null,until:'2026-01-04T00:00:00Z'},commits,pages,intelligence:{coverage:{}}}});
  const first=await db.query('select public.workspace_save_repository_report($1,$2,$3) as id',[users.student,'assigned',JSON.stringify(payload([commit('a',true)],[1]))]);
  const report=first.rows[0].id;
  const next=payload([commit('a',true),commit('b',false)],[2]);delete next.github.intelligence;
  await db.query('select public.workspace_save_repository_report($1,$2,$3)',[users.student,'assigned',JSON.stringify(next)]);
  const row=(await db.query('select * from public.workspace_repository_reports')).rows[0];
  assert.equal(row.loaded_commits,2);assert.equal(row.ai_marked,1);assert.deepEqual(row.payload.github.pages,[1,2]);assert.ok(row.payload.github.intelligence);
  for(const role of ['admin','teacher','student'])await as(role,async()=>{assert.equal((await db.query('select id from public.workspace_repository_reports')).rows.length,1);});
  for(const role of ['staff','other'])await as(role,async()=>{assert.equal((await db.query('select id from public.workspace_repository_reports')).rows.length,0);});
  await as('student',async()=>{await assert.rejects(db.query('select public.workspace_save_repository_report($1,null,$2)',[users.student,JSON.stringify(next)]),/permission denied/);});
  await db.query('select public.workspace_report_change_stats($1,$2,$3,$4)',[users.student,report,'owner/repo',JSON.stringify([{sha:'a'.repeat(40),stats:{additions:2,deletions:0,files:[]}}])]);
  const updated=(await db.query('select payload from public.workspace_repository_reports')).rows[0].payload;
  assert.equal(updated.github.commits.find(item=>item.sha==='a'.repeat(40)).stats.additions,2);
  await db.query('select public.workspace_save_repository_report($1,$2,$3)',[users.student,'assigned',JSON.stringify(next)]);
  assert.equal((await db.query('select payload from public.workspace_repository_reports')).rows[0].payload.github.commits.find(item=>item.sha==='a'.repeat(40)).stats.additions,2);
  await assert.rejects(db.query('select public.workspace_report_change_stats($1,$2,$3,$4)',[users.other,report,'owner/repo','[]']),/not found/);
});
test('disabling an account invalidates existing JWTs immediately and role metadata remains server-owned',async()=>{
  await as('admin',()=>db.query('select public.workspace_update_account($1,$2,false,true,$3)',[users.teacher,'teacher','Teaching']));
  assert.equal((await db.query('select public.workspace_session_active($1,$2) as active',[users.teacher,sessions.teacher])).rows[0].active,false);
  const metadata=(await db.query('select raw_app_meta_data from auth.users where id=$1',[users.teacher])).rows[0].raw_app_meta_data;
  assert.equal(metadata.workspace_role,'teacher');assert.equal(metadata.workspace_enabled,false);
  await as('teacher',async()=>{assert.equal((await db.query('select * from public.pms_squads')).rows.length,0);assert.equal((await db.query('select * from public.workspace_repository_reports')).rows.length,0);});
});
