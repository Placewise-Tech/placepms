import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, encrypted_password text, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles (id uuid primary key, name text);
    alter table public.profiles enable row level security;
    grant select, insert, update, delete on public.profiles to authenticated;
    create policy own_profile on public.profiles to authenticated using (id = auth.uid()) with check (id = auth.uid());
    insert into auth.users values ('${owner}', 'temporary-hash', '{"must_change_password":true,"provider":"email"}', '{}'), ('${other}', 'existing-hash', '{}', '{}');
    insert into public.profiles values ('${owner}', 'New account'), ('${other}', 'Existing account');
  `);
  const migration = readFileSync(new URL('../supabase/migrations/202610030001_temporary_password_signup.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  // Reapplying must not break existing policies or triggers.
  await db.exec(migration);
});
after(async () => { await db.close(); });

async function asUser(id, callback) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}';`);
  try { return await callback(); }
  finally { await db.exec('reset role; reset request.jwt.claim.sub;'); }
}

test('temporary-login accounts cannot read or change workspace data, including via direct requests', async () => {
  await asUser(owner, async () => {
    assert.deepEqual((await db.query('select * from public.profiles')).rows, []);
    assert.equal((await db.query("update public.profiles set name = 'Bypass' returning id")).rows.length, 0);
    await assert.rejects(db.query(`insert into public.profiles values ('${owner}', 'Bypass')`), /row-level security/);
    await assert.rejects(db.query(`select public.claim_signup_attempt('${'a'.repeat(64)}', '${'b'.repeat(64)}')`), /permission denied/);
    await assert.rejects(db.query('select * from public.signup_rate_limits'), /permission denied/);
  });
});

test('existing accounts keep their ownership-scoped access', async () => {
  await asUser(other, async () => {
    assert.deepEqual((await db.query('select id from public.profiles')).rows, [{ id: other }]);
  });
});

test('user metadata or unrelated account updates cannot clear mandatory password setup', async () => {
  await db.query(`update auth.users set raw_user_meta_data = '{"must_change_password":false}' where id = $1`, [owner]);
  await db.query('update auth.users set encrypted_password = encrypted_password where id = $1', [owner]);
  await asUser(owner, async () => {
    assert.deepEqual((await db.query('select * from public.profiles')).rows, []);
  });
});

test('real password changes clear the flag atomically and preserve other metadata and ownership rules', async () => {
  await db.query('update auth.users set encrypted_password = $1 where id = $2', ['new-password-hash', owner]);
  assert.deepEqual((await db.query('select raw_app_meta_data from auth.users where id = $1', [owner])).rows[0].raw_app_meta_data, { must_change_password: false, provider: 'email' });
  await asUser(owner, async () => {
    assert.deepEqual((await db.query('select id from public.profiles')).rows, [{ id: owner }]);
    assert.equal((await db.query("update public.profiles set name = 'Updated' returning id")).rows.length, 1);
  });
});

test('shared signup limits enforce per-email and per-IP quotas and reset after an hour', async () => {
  const claim = async (ip, email) => (await db.query('select public.claim_signup_attempt($1, $2) as allowed', [ip.repeat(64), email.repeat(64)])).rows[0].allowed;
  await db.exec('set role service_role');
  try {
    assert.equal(await claim('a', 'b'), true);
    assert.equal(await claim('a', 'b'), true);
    assert.equal(await claim('a', 'b'), true);
    assert.equal(await claim('a', 'b'), false);
    // Same source, different emails: 6 more allowed requests take the IP to 10.
    for (const email of ['c', 'c', 'c', 'd', 'd', 'd']) assert.equal(await claim('a', email), true);
    assert.equal(await claim('a', 'e'), false);
  } finally { await db.exec('reset role'); }
  await db.exec("update public.signup_rate_limits set window_start = now() - interval '61 minutes'");
  assert.equal(await claim('a', 'b'), true);
});
