import os from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assessDatabase, databaseRates, estimateStudentCapacity, type DatabaseDetails, type DatabaseMetrics, type ServerMetrics } from '../src/lib/system-health.js';

const startedAt = Date.now();
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

let previousCpu = process.cpuUsage();
let previousCpuAt = performance.now();

type HealthStatus = 'healthy' | 'degraded' | 'down';

function rounded(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function databaseNumber(value: unknown) {
  const number = finiteNumber(value);
  if (number !== null) return number;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function databaseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function databaseStatus(connectionUtilization: number | null, latency: number): HealthStatus {
  return connectionUtilization !== null && connectionUtilization >= 90 || latency >= 1_000 ? 'degraded' : 'healthy';
}

function unavailableDatabase(latency: number, message: string): DatabaseMetrics {
  return {
    status: 'down',
    latency_ms: latency,
    metrics_available: false,
    database: null,
    server_version: null,
    active_connections: null,
    max_connections: null,
    connection_utilization_percent: null,
    cache_hit_ratio_percent: null,
    transactions: { committed: null, rolled_back: null },
    blocks: { read: null, hit: null },
    stats_reset: null,
    rates: null,
    details: null,
    message,
  };
}

async function fallbackPresence(client: SupabaseClient, admin: SupabaseClient): Promise<DatabaseDetails | null> {
  try {
    const accounts = await admin.from('workspace_accounts').select('user_id,role,enabled');
    if (accounts.error) return null;
    const accountRows = (accounts.data || []) as { user_id: string; role: string; enabled: boolean }[];
    const profiles = await admin.from('profiles').select('id,role');
    const profileRows = profiles.error ? [] : (profiles.data || []) as { id: string; role: string | null }[];
    const recent = await admin.from('workspace_activity').select('user_id,event_type,metadata,occurred_at')
      .gte('occurred_at', new Date(Date.now() - 5 * 60_000).toISOString())
      .in('event_type', ['heartbeat', 'page_view']).limit(10_000);
    const activityRows = recent.error ? [] : (recent.data || []) as { user_id: string; event_type: string; metadata: Record<string, unknown> | null; occurred_at: string }[];
    const onlineUsers = new Set(activityRows.filter(row => row.metadata?.visibility === 'visible' || row.event_type === 'page_view').map(row => row.user_id));
    const accountsByUser = new Map(profileRows.map(row => [row.id, { user_id: row.id, role: row.role || 'student', enabled: true }]));
    accountRows.forEach(row => accountsByUser.set(row.user_id, row));
    const sessions = await client.rpc('workspace_admin_list_sessions');
    const activeSessions = sessions.error ? null : Array.isArray(sessions.data) ? sessions.data.length : 0;
    return {
      sampled_at: new Date().toISOString(),
      connections: { cluster: null, usable: null, reserved: null, running: null, idle: null, idle_in_transaction: null, waiting_on_lock: null, longest_query_seconds: null },
      storage: { database_bytes: null, table_count: null, live_rows: null, dead_rows: null, temp_bytes: null, temp_files: null },
      rows: { inserted: null, updated: null, deleted: null }, deadlocks: null,
      presence: {
        online_students: [...onlineUsers].filter(userId => accountsByUser.get(userId)?.role === 'student' && accountsByUser.get(userId)?.enabled !== false).length,
        online_users: onlineUsers.size,
        active_sessions: activeSessions,
        registered_students: [...accountsByUser.values()].filter(row => row.role === 'student' && row.enabled !== false).length,
      },
      tables: [],
    };
  } catch {
    return null;
  }
}

export function serverMetrics(env: NodeJS.ProcessEnv = process.env): ServerMetrics {
  const now = performance.now();
  const cpu = process.cpuUsage();
  const elapsedMs = Math.max(now - previousCpuAt, 1);
  const cpuMicros = Math.max(0, cpu.user - previousCpu.user) + Math.max(0, cpu.system - previousCpu.system);
  previousCpu = cpu;
  previousCpuAt = now;

  const cpuCount = Math.max(os.cpus().length, 1);
  const [loadOne, loadFive, loadFifteen] = os.loadavg();
  const totalMemory = os.totalmem();
  const memory = process.memoryUsage();
  const memoryUsagePercent = totalMemory > 0 ? rounded(memory.rss / totalMemory * 100) : 0;
  const heapUsagePercent = memory.heapTotal > 0 ? rounded(memory.heapUsed / memory.heapTotal * 100) : 0;
  const processCpuPercent = rounded(cpuMicros / (elapsedMs * 1000) * 100 / cpuCount);
  const normalizedLoad = cpuCount > 0 ? loadOne / cpuCount : 0;
  const eventLoopP95 = eventLoop.percentile(95) / 1_000_000;
  const eventLoopP99 = eventLoop.percentile(99) / 1_000_000;
  eventLoop.reset();

  const status: HealthStatus = memoryUsagePercent >= 92 || normalizedLoad >= 1.5 || eventLoopP99 >= 500
    ? 'degraded'
    : 'healthy';

  return {
    status,
    runtime: 'node',
    node_version: process.version,
    environment: env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production' : 'local'),
    region: env.VERCEL_REGION || 'local',
    process_id: process.pid,
    started_at: new Date(startedAt).toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    memory: {
      rss_bytes: memory.rss,
      heap_used_bytes: memory.heapUsed,
      heap_total_bytes: memory.heapTotal,
      external_bytes: memory.external,
      array_buffers_bytes: memory.arrayBuffers,
      host_total_bytes: totalMemory,
      host_free_bytes: os.freemem(),
      host_usage_percent: memoryUsagePercent,
      heap_usage_percent: heapUsagePercent,
    },
    load: {
      one_minute: rounded(loadOne),
      five_minutes: rounded(loadFive),
      fifteen_minutes: rounded(loadFifteen),
      cpu_count: cpuCount,
      normalized_percent: rounded(normalizedLoad * 100),
      process_cpu_percent: processCpuPercent,
    },
    event_loop: {
      p95_ms: rounded(eventLoopP95),
      p99_ms: rounded(eventLoopP99),
    },
  };
}

let previousDatabase: DatabaseMetrics | undefined;

function testedStudentLimit(env: NodeJS.ProcessEnv) {
  const value = Number(env.PLACEPMS_LOAD_TEST_STUDENT_LIMIT);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export async function databaseMetrics(client: SupabaseClient, probeClient = client) {
  const started = performance.now();
  let result: Awaited<ReturnType<SupabaseClient['rpc']>>;
  try {
    result = await client.rpc('workspace_system_metrics');
  } catch {
    return unavailableDatabase(rounded(performance.now() - started), 'The database health probe failed.');
  }
  let latency = rounded(performance.now() - started);
  const stats = databaseObject(result.data);
  if (!result.error && Object.keys(stats).length > 0) {
    const activeConnections = databaseNumber(stats.active_connections);
    const maxConnections = databaseNumber(stats.max_connections);
    const connectionUtilization = databaseNumber(stats.connection_utilization_percent);
    const details = Object.keys(databaseObject(stats.details)).length
      ? databaseObject(stats.details) as unknown as DatabaseDetails
      : await fallbackPresence(client, probeClient);
    const metrics: DatabaseMetrics = {
      status: databaseStatus(connectionUtilization, latency),
      latency_ms: latency,
      metrics_available: true,
      database: typeof stats.database === 'string' ? stats.database : null,
      server_version: typeof stats.server_version === 'string' ? stats.server_version : null,
      active_connections: activeConnections,
      max_connections: maxConnections,
      connection_utilization_percent: connectionUtilization,
      cache_hit_ratio_percent: databaseNumber(stats.cache_hit_ratio_percent),
      transactions: {
        committed: databaseNumber(stats.transactions_committed),
        rolled_back: databaseNumber(stats.transactions_rolled_back),
      },
      blocks: {
        read: databaseNumber(stats.blocks_read),
        hit: databaseNumber(stats.blocks_hit),
      },
      stats_reset: typeof stats.stats_reset === 'string' ? stats.stats_reset : null,
      rates: null,
      details,
      message: details ? undefined : 'Apply supabase/migrations/202610120002_database_capacity_monitoring.sql for detailed PostgreSQL workload and capacity metrics.',
    };
    metrics.rates = databaseRates(previousDatabase, metrics);
    previousDatabase = metrics;
    return metrics;
  }

  // Keep the system page useful when the optional metrics migration has not
  // been applied yet. A normal table read distinguishes that from an outage.
  let available = false;
  try {
    const probe = await probeClient.from('workspace_settings').select('id').eq('id', true);
    available = !probe.error;
  } catch {
    available = false;
  }
  const details = available ? await fallbackPresence(client, probeClient) : null;
  latency = rounded(performance.now() - started);
  return {
    status: available ? 'degraded' : 'down',
    latency_ms: latency,
    metrics_available: false,
    database: null,
    server_version: null,
    active_connections: null,
    max_connections: null,
    connection_utilization_percent: null,
    cache_hit_ratio_percent: null,
    transactions: { committed: null, rolled_back: null },
    blocks: { read: null, hit: null },
    stats_reset: null,
    rates: null,
    details,
    message: available
      ? 'Apply supabase/migrations/202610120001_system_monitoring.sql and supabase/migrations/202610120002_database_capacity_monitoring.sql for full PostgreSQL load metrics. Student presence is shown from workspace activity when available.'
      : 'The database health probe failed.',
  } satisfies DatabaseMetrics;
}

export function systemHealth(server: ServerMetrics, database: DatabaseMetrics, env: NodeJS.ProcessEnv = process.env) {
  return { server, database, assessment: assessDatabase(database), capacity: estimateStudentCapacity(database, server, testedStudentLimit(env)) };
}
