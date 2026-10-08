import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard } from '../src/lib/dashboard-api.ts';

class Query {
  constructor(table, results, attempts) {
    this.table = table;
    this.results = results;
    this.attempts = attempts;
    this.offset = 0;
  }
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  order() { return this; }
  range(offset) { this.offset = offset; return this; }
  abortSignal() { return this; }
  then(resolve, reject) {
    const attempt = this.attempts[this.table] || 0;
    this.attempts[this.table] = attempt + 1;
    if (this.table === 'milestones' && attempt === 0) return Promise.reject(new TypeError('Failed to fetch')).then(resolve, reject);
    const result = this.results[this.table];
    if (this.offset > 0 && Array.isArray(result?.data)) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return Promise.resolve(result).then(resolve, reject);
  }
}

test('dashboard returns core data quickly, retries transient reads, and preserves independent failures', async () => {
  const attempts = {};
  const results = {
    profiles: { data: [{ id: 'user', email: 'student@example.test', full_name: 'Student' }], error: null },
    pms_squads: { data: [{ id: 'project', title: 'Project', created_at: '2026-10-08' }], error: null },
    milestones: { data: [{ id: 'milestone', squad_id: 'project', name: 'First delivery', due_date: '2026-10-15', status: 'PENDING' }], error: null },
    squad_members: { data: null, error: { message: 'Members are temporarily unavailable.' }, status: 503 },
  };
  const client = { from: table => new Query(table, results, attempts) };
  let releaseIntegrations;
  const integrations = new Promise(resolve => { releaseIntegrations = resolve; });
  let resolveCore;
  const coreLoaded = new Promise(resolve => { resolveCore = resolve; });
  const load = loadDashboard(client, { id: 'user', email: 'student@example.test', app_metadata: {} }, {
    loadIntegrations: () => integrations,
    onCoreLoaded: data => resolveCore?.(data),
  });

  const core = await coreLoaded;
  assert.deepEqual(core.squads.map(project => project.id), ['project']);
  assert.deepEqual(core.milestones, []);

  releaseIntegrations([{ id: 'github', tool_name: 'github', account: 'student', is_connected: true, updated_at: null }]);
  const data = await load;
  assert.equal(data.milestones.length, 1);
  assert.equal(data.members.length, 0);
  assert.deepEqual(data.integrations.map(item => item.id), ['github']);
  assert.deepEqual(data.errors, [{ section: 'Team members', message: 'Members are temporarily unavailable.' }]);
  assert.equal(attempts.milestones, 2);
});
