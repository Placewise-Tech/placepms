import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseMetrics, serverMetrics } from '../server/system-monitor.ts';

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
  assert.match(metrics.message, /Apply the system monitoring migration/);
  assert.ok(metrics.latency_ms >= 0);
});
