import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value.startsWith('--')) args.set(value.slice(2), process.argv[index + 1]?.startsWith('--') ? true : process.argv[++index]);
}

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const usersRequested = Number(args.get('users') || env.LOAD_TEST_USERS || 1000);
const provisionConcurrency = Math.max(1, Number(args.get('provision-concurrency') || env.LOAD_TEST_PROVISION_CONCURRENCY || 20));
const baseUrl = String(args.get('base-url') || env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const createUsers = args.get('create-users') === true || env.LOAD_TEST_CREATE_USERS === '1';
const keepUsers = args.get('keep-users') === true || env.LOAD_TEST_KEEP_USERS === '1';
const runId = randomUUID().slice(0, 12);

function required(name, value) {
  if (!value) throw new Error(`Missing ${name}. Set it in .env or the environment.`);
  return value;
}

const supabaseUrl = required('SUPABASE_URL', env.SUPABASE_URL || env.VITE_SUPABASE_URL);
const publicKey = required('VITE_SUPABASE_PUBLISHABLE_KEY', env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY);
const secret = required('SUPABASE_SECRET_KEY', env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
if (!Number.isSafeInteger(usersRequested) || usersRequested < 1 || usersRequested > 5000) throw new Error('Choose between 1 and 5000 load-test users.');

const admin = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const password = env.LOAD_TEST_PASSWORD || 'LoadTest!2026StrongPassword';

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summary(label, startedAt, results) {
  const durations = results.map(result => result.duration).filter(Number.isFinite);
  const failed = results.filter(result => !result.ok);
  const elapsed = Math.max(performance.now() - startedAt, 1);
  return {
    label,
    total: results.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
    elapsed_ms: Math.round(elapsed),
    operations_per_second: Math.round(results.length / (elapsed / 1000) * 100) / 100,
    latency_ms: durations.length ? {
      min: Math.round(Math.min(...durations)),
      mean: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
      p50: Math.round(percentile(durations, 0.50)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      max: Math.round(Math.max(...durations)),
    } : null,
    errors: failed.slice(0, 8).map(result => result.error),
  };
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try { results[index] = await worker(items[index], index); }
      catch (cause) { results[index] = { ok: false, error: cause instanceof Error ? cause.message : 'operation failed' }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));
  return results;
}

async function createLoadUsers() {
  if (!createUsers) {
    const configured = env.LOAD_TEST_USERS_JSON;
    if (!configured) throw new Error('Set LOAD_TEST_CREATE_USERS=1 to create disposable users, or provide LOAD_TEST_USERS_JSON with email/password/id records.');
    const parsed = JSON.parse(configured);
    if (!Array.isArray(parsed) || parsed.length < usersRequested) throw new Error(`LOAD_TEST_USERS_JSON must contain at least ${usersRequested} users.`);
    return parsed.slice(0, usersRequested).map((user, index) => ({ ...user, index, password: user.password || password }));
  }

  const created = await mapLimit(Array.from({ length: usersRequested }, (_, index) => index), provisionConcurrency, async index => {
    const email = `placepms-load-${runId}-${index}@example.com`;
    const result = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: `Load Test Student ${index + 1}`, college: 'PlacePMS capacity test', role: 'student' },
    });
    if (result.error || !result.data.user) throw new Error(result.error?.message || 'The disposable account could not be created.');
    return { index, id: result.data.user.id, email, password };
  });
  const failures = created.filter(result => !result?.id);
  if (failures.length) {
    await cleanup(created.filter(result => result?.id));
    throw new Error(`Provisioning failed for ${failures.length} users. No load phase was started. First error: ${created.find(result => !result?.id)?.error || 'unknown provider error'}`);
  }

  // The normal Auth trigger creates profiles in a deployed project. Upsert the
  // expected identity fields as a compatibility step for older installations.
  const profiles = created.map(user => ({ id: user.id, email: user.email, full_name: `Load Test Student ${user.index + 1}`, college: 'PlacePMS capacity test' }));
  for (let start = 0; start < profiles.length; start += 100) {
    const result = await admin.from('profiles').upsert(profiles.slice(start, start + 100));
    if (result.error) {
      await cleanup(created);
      throw new Error(`The load-test profiles could not be prepared: ${result.error.message || 'database error'}`);
    }
  }
  return created;
}

async function signIn(user) {
  const started = performance.now();
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }), signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.access_token !== 'string') throw new Error(`Auth returned HTTP ${response.status}.`);
    return { ...user, token: body.access_token, duration: performance.now() - started, ok: true };
  } catch (cause) {
    return { ...user, duration: performance.now() - started, ok: false, error: cause instanceof Error ? cause.message : 'login failed' };
  }
}

async function jsonRequest(path, token, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}${value?.error ? `: ${value.error}` : ''}`);
  return value;
}

async function restRequest(path, token) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: publicKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`/rest/v1 returned HTTP ${response.status}`);
  return response.json();
}

async function useWorkspace(user) {
  const started = performance.now();
  try {
    await Promise.all([
      restRequest(`profiles?select=id,email,full_name&id=eq.${encodeURIComponent(user.id)}`, user.token),
      restRequest('pms_squads?select=id,title,status&order=created_at.desc&limit=20', user.token),
      jsonRequest('/api/sessions', user.token, { action: 'heartbeat', event_type: 'heartbeat', route: '/dashboard', visibility: 'visible' }),
      jsonRequest('/api/management', user.token, { action: 'access' }),
    ]);
    return { ...user, duration: performance.now() - started, ok: true };
  } catch (cause) {
    return { ...user, duration: performance.now() - started, ok: false, error: cause instanceof Error ? cause.message : 'workspace operation failed' };
  }
}

async function cleanup(users) {
  if (!users?.length || keepUsers) return;
  for (let start = 0; start < users.length; start += 100) {
    const ids = users.slice(start, start + 100).map(user => user.id).filter(Boolean);
    if (!ids.length) continue;
    await Promise.all([
      admin.from('workspace_presence').delete().in('user_id', ids),
      admin.from('workspace_activity').delete().in('user_id', ids),
      admin.from('profiles').delete().in('id', ids),
    ].map(request => Promise.resolve(request).catch(() => undefined)));
  }
  await mapLimit(users.filter(user => user.id), provisionConcurrency, async user => {
    await admin.auth.admin.deleteUser(user.id);
    return { ok: true };
  });
}

async function main() {
  if (createUsers && keepUsers) console.warn('LOAD_TEST_KEEP_USERS=1: disposable accounts will remain for manual inspection.');
  console.log(`Preparing ${usersRequested} users for a simultaneous login/workspace workload against ${baseUrl}…`);
  let users = [];
  try {
    users = await createLoadUsers();
    const loginStarted = performance.now();
    const logins = await Promise.all(users.map(user => signIn(user)));
    const loginSummary = summary('simultaneous password login', loginStarted, logins);
    console.log(JSON.stringify(loginSummary, null, 2));
    if (loginSummary.failed) throw new Error(`Login phase failed for ${loginSummary.failed} users.`);

    const workspaceStarted = performance.now();
    const workspace = await Promise.all(logins.map(user => useWorkspace(user)));
    const workspaceSummary = summary('simultaneous workspace reads, heartbeat, and access check', workspaceStarted, workspace);
    console.log(JSON.stringify(workspaceSummary, null, 2));
    if (workspaceSummary.failed) throw new Error(`Workspace phase failed for ${workspaceSummary.failed} users.`);
    console.log(`PASS: ${usersRequested} users authenticated and completed the representative workspace workload concurrently.`);
  } finally {
    await cleanup(users);
    if (users.length && !keepUsers) console.log('Disposable load-test accounts and records cleaned up.');
  }
}

main().catch(cause => { console.error(cause instanceof Error ? cause.message : 'Load test failed.'); process.exitCode = 1; });
