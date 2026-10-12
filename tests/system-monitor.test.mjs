import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseMetrics, serverMetrics, systemHealth } from '../server/system-monitor.ts';

test('server metrics expose bounded runtime, memory, load, and event-loop readings', () => {
  const metrics = serverMetrics({ NODE_ENV: 'test', VERCEL_ENV: 'preview', VERCEL_REGION: 'fixture' });

  assert.equal(metrics.runtime, 'node');
  assert.equal(metrics.environment, 'preview');
  assert.equal(metrics.region, 'fixture');
  assert.ok(['healthy', 'degraded'].includes(metrics.status));
  assert.ok(metrics.uptime_seconds >= 0);
  assert.ok(metrics.process_id > 0);
  assert.ok(metrics.memory.rss_bytes > 0);
  assert.ok(metrics.memory.host_total_bytes >= metrics.memory.host_free_bytes);
  assert.ok(metrics.load.cpu_count >= 1);
  assert.ok(metrics.event_loop.p95_ms >= 0);
  assert.ok(metrics.event_loop.p99_ms >= 0);
});

test('database metrics return aggregate readings and degrade on high latency', async () => {
  const client = {
    rpc: async () => ({
      data: {
        database: 'fixture',
        server_version: 'PostgreSQL 16',
        active_connections: '9',
        max_connections: '10',
        connection_utilization_percent: '90',
        cache_hit_ratio_percent: 99.5,
        transactions_committed: '42',
        transactions_rolled_back: '1',
        blocks_read: '4',
        blocks_hit: '100',
        stats_reset: '2026-10-12T00:00:00.000Z',
        details: {
          sampled_at: new Date().toISOString(),
          connections: { cluster: 2, usable: 20, reserved: 3, running: 1, idle: 1, idle_in_transaction: 0, waiting_on_lock: 0, longest_query_seconds: 0.1 },
          storage: { database_bytes: 1000, table_count: 4, live_rows: 20, dead_rows: 0, temp_bytes: 0, temp_files: 0 },
          rows: { inserted: 5, updated: 4, deleted: 1 }, deadlocks: 0,
          presence: { online_students: 12, online_users: 14, active_sessions: 15, registered_students: 50 }, tables: [],
        },
      },
      error: null,
    }),
  };

  const metrics = await databaseMetrics(client);
  assert.equal(metrics.status, 'degraded');
  assert.equal(metrics.metrics_available, true);
  assert.equal(metrics.active_connections, 9);
  assert.equal(metrics.max_connections, 10);
  assert.equal(metrics.transactions.committed, 42);
  assert.equal(metrics.blocks.hit, 100);
  const health = systemHealth(serverMetrics({ NODE_ENV: 'test' }), metrics, { NODE_ENV: 'test' });
  assert.equal(health.assessment.rating, 'strained');
  assert.equal(health.capacity.estimated_total_students, null);
});

test('capacity reports a calibrated student estimate when a load-tested limit is configured', async () => {
  const client = {
    rpc: async () => ({ data: {
      database: 'fixture', server_version: 'PostgreSQL 16', active_connections: 20, max_connections: 100, connection_utilization_percent: 20,
      cache_hit_ratio_percent: 99.5, transactions_committed: 100, transactions_rolled_back: 0, blocks_read: 10, blocks_hit: 100, stats_reset: '2026-10-12T00:00:00.000Z',
      details: { sampled_at: new Date().toISOString(), connections: { cluster: 20, usable: 90, reserved: 10, running: 2, idle: 18, idle_in_transaction: 0, waiting_on_lock: 0, longest_query_seconds: 0.2 }, storage: { database_bytes: 100, table_count: 1, live_rows: 1, dead_rows: 0, temp_bytes: 0, temp_files: 0 }, rows: { inserted: 1, updated: 1, deleted: 0 }, deadlocks: 0, presence: { online_students: 12, online_users: 14, active_sessions: 15, registered_students: 50 }, tables: [] },
    }, error: null }),
  };
  const metrics = await databaseMetrics(client);
  const health = systemHealth(serverMetrics({ NODE_ENV: 'test' }), metrics, { PLACEPMS_LOAD_TEST_STUDENT_LIMIT: '500' });
  assert.equal(health.assessment.rating, 'super_healthy');
  assert.equal(health.capacity.basis, 'load_test');
  assert.equal(health.capacity.estimated_total_students, 500);
  assert.equal(health.capacity.estimated_additional_students, 488);
});

test('database metric failures fail closed with a down reading instead of leaking an exception', async () => {
  const metrics = await databaseMetrics({
    rpc: async () => { throw new Error('private database connection details'); },
  });

  assert.equal(metrics.status, 'down');
  assert.equal(metrics.metrics_available, false);
  assert.equal(metrics.message, 'The database health probe failed.');
  assert.ok(!JSON.stringify(metrics).includes('private database connection details'));
});

test('missing monitoring migration falls back to a probe and reports its total latency', async () => {
  const metrics = await databaseMetrics({
    rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
  }, {
    from: () => ({ select: () => ({ eq: async () => ({ error: null }) }) }),
  });

  assert.equal(metrics.status, 'degraded');
  assert.equal(metrics.metrics_available, false);
  assert.match(metrics.message, /202610120001_system_monitoring\.sql/);
  assert.ok(metrics.latency_ms >= 0);
});

test('missing metrics RPC still exposes student presence through the admin fallback', async () => {
  const query = value => ({
    select() { return this; }, eq() { return this; }, gte() { return this; }, in() { return this; },
    limit() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const client = {
    rpc: async name => name === 'workspace_system_metrics'
      ? { data: null, error: { code: 'PGRST202' } }
      : { data: [{ id: 'session-1' }], error: null },
  };
  const admin = {
    from: table => table === 'workspace_settings'
      ? query({ data: [{ id: true }], error: null })
      : table === 'workspace_accounts'
        ? query({ data: [{ user_id: 'student-1', role: 'student', enabled: true }, { user_id: 'admin-1', role: 'admin', enabled: true }], error: null })
        : table === 'profiles'
          ? query({ data: [], error: null })
          : query({ data: [{ user_id: 'student-1', event_type: 'heartbeat', metadata: { visibility: 'visible' }, occurred_at: new Date().toISOString() }], error: null }),
  };

  const metrics = await databaseMetrics(client, admin);
  assert.equal(metrics.metrics_available, false);
  assert.equal(metrics.details.presence.online_students, 1);
  assert.equal(metrics.details.presence.online_users, 1);
  assert.equal(metrics.details.presence.registered_students, 1);
  assert.equal(metrics.details.presence.active_sessions, 1);
  const health = systemHealth(serverMetrics({ NODE_ENV: 'test' }), metrics, { NODE_ENV: 'test' });
  assert.equal(health.capacity.current_students, 1);
  assert.equal(health.capacity.basis, 'insufficient_data');
});
