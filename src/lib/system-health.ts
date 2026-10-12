export type HealthStatus = 'healthy' | 'degraded' | 'down';

export interface DatabaseDetails {
  sampled_at: string;
  connections: { cluster: number | null; usable: number | null; reserved: number | null; running: number | null; idle: number | null; idle_in_transaction: number | null; waiting_on_lock: number | null; longest_query_seconds: number | null };
  storage: { database_bytes: number | null; table_count: number | null; live_rows: number | null; dead_rows: number | null; temp_bytes: number | null; temp_files: number | null };
  rows: { inserted: number | null; updated: number | null; deleted: number | null };
  deadlocks: number | null;
  presence: { online_students: number | null; online_users: number | null; active_sessions: number | null; registered_students: number | null };
  tables: { name: string; bytes: number | null; live_rows: number | null; dead_rows: number | null; last_analyze: string | null; last_vacuum: string | null }[];
}

export interface DatabaseMetrics {
  status: HealthStatus;
  latency_ms: number;
  metrics_available: boolean;
  database: string | null;
  server_version: string | null;
  active_connections: number | null;
  max_connections: number | null;
  connection_utilization_percent: number | null;
  cache_hit_ratio_percent: number | null;
  transactions: { committed: number | null; rolled_back: number | null };
  blocks: { read: number | null; hit: number | null };
  stats_reset: string | null;
  rates: { seconds: number; transactions_per_second: number; rollbacks_per_second: number; blocks_read_per_second: number } | null;
  details: DatabaseDetails | null;
  message?: string;
}

export interface ServerMetrics {
  status: HealthStatus; runtime: string; node_version: string; environment: string; region: string; process_id: number;
  started_at: string; uptime_seconds: number;
  memory: { rss_bytes: number; heap_used_bytes: number; heap_total_bytes: number; external_bytes: number; array_buffers_bytes: number; host_total_bytes: number; host_free_bytes: number; host_usage_percent: number; heap_usage_percent: number };
  load: { one_minute: number; five_minutes: number; fifteen_minutes: number; cpu_count: number; normalized_percent: number; process_cpu_percent: number };
  event_loop: { p95_ms: number; p99_ms: number };
}

export interface DatabaseAssessment {
  rating: 'super_healthy' | 'healthy' | 'busy' | 'strained' | 'unknown' | 'unavailable';
  label: string;
  reasons: string[];
}

export interface StudentCapacity {
  basis: 'load_test' | 'connection_model' | 'insufficient_data' | 'paused';
  confidence: 'configured' | 'low' | 'unavailable';
  current_students: number | null;
  estimated_additional_students: number | null;
  estimated_total_students: number | null;
  tested_student_limit: number | null;
  connection_budget: number | null;
  connection_headroom: number | null;
  reason: string;
  assumptions: string[];
}

export interface SystemHealthData {
  updated_at: string;
  server: ServerMetrics;
  database: DatabaseMetrics;
  assessment: DatabaseAssessment;
  capacity: StudentCapacity;
}

export function assessDatabase(db: DatabaseMetrics): DatabaseAssessment {
  if (db.status === 'down') return { rating: 'unavailable', label: 'Unavailable', reasons: [db.message || 'The database probe failed.'] };
  if (!db.metrics_available || !db.details) return { rating: 'unknown', label: 'Limited visibility', reasons: [db.message || 'Apply the database capacity monitoring migration for detailed health readings.'] };
  const { connections } = db.details;
  if (connections.cluster === null || connections.usable === null || connections.running === null || connections.waiting_on_lock === null || connections.idle_in_transaction === null || connections.longest_query_seconds === null || db.connection_utilization_percent === null) {
    return { rating: 'unknown', label: 'Limited visibility', reasons: ['Some database workload readings are unavailable.'] };
  }
  const urgent: string[] = [];
  const busy: string[] = [];
  if (db.connection_utilization_percent >= 90) urgent.push('At least 90% of usable PostgreSQL connections are occupied.');
  else if (db.connection_utilization_percent >= 70) busy.push('Connection use is above the 70% planning budget.');
  if (db.latency_ms >= 1_000) urgent.push('The database metrics round trip is taking at least one second.');
  else if (db.latency_ms >= 500) busy.push('The database metrics round trip is taking at least 500 ms.');
  if (connections.waiting_on_lock > 0) urgent.push(`${connections.waiting_on_lock} database queries are waiting on locks.`);
  if (connections.longest_query_seconds >= 30) busy.push('A running query has exceeded 30 seconds.');
  if (connections.idle_in_transaction > 0) busy.push(`${connections.idle_in_transaction} connections have open idle transactions.`);
  if (db.cache_hit_ratio_percent !== null && db.cache_hit_ratio_percent < 95) busy.push('The cumulative cache hit ratio is below 95%; check disk reads and workload.');
  if (urgent.length) return { rating: 'strained', label: 'Under pressure', reasons: [...urgent, ...busy] };
  if (busy.length) return { rating: 'busy', label: 'Busy', reasons: busy };
  if (db.latency_ms < 200 && db.connection_utilization_percent < 40 && db.cache_hit_ratio_percent !== null && db.cache_hit_ratio_percent >= 99) {
    return { rating: 'super_healthy', label: 'Super healthy', reasons: ['Round trip below 200 ms, connection use below 40%, cache hit ratio at least 99%, and no lock waits or long-running queries.'] };
  }
  return { rating: 'healthy', label: 'Healthy', reasons: ['Connection use, latency, and query pressure are within the monitoring thresholds.'] };
}

export function estimateStudentCapacity(db: DatabaseMetrics, server: Pick<ServerMetrics, 'status'>, testedLimit?: number): StudentCapacity {
  const details = db.details;
  const students = details?.presence.online_students ?? null;
  const online = details?.presence.online_users ?? null;
  const used = details?.connections.cluster ?? null;
  const usable = details?.connections.usable ?? null;
  const budget = usable !== null && usable > 0 ? Math.floor(usable * 0.7) : null;
  const headroom = budget !== null && used !== null ? Math.max(0, budget - used) : null;
  const tested = Number.isSafeInteger(testedLimit) && testedLimit! > 0 ? testedLimit! : null;
  const result: StudentCapacity = {
    basis: 'insufficient_data', confidence: 'unavailable', current_students: students,
    estimated_additional_students: null, estimated_total_students: null, tested_student_limit: tested,
    connection_budget: budget, connection_headroom: headroom,
    reason: 'Detailed database and student presence readings are required.',
    assumptions: [
      'Online means a visible workspace heartbeat or page view within five minutes from a valid session; each person is counted once.',
      'Reserve 30% of usable PostgreSQL connections; administrator-reserved slots are excluded.',
      'Connection headroom is not a throughput benchmark. Database CPU, I/O, pooler limits, API limits, and expensive student actions can reduce capacity.',
    ],
  };
  const health = assessDatabase(db);
  if (['strained', 'busy', 'unavailable'].includes(health.rating) || server.status !== 'healthy') {
    return { ...result, basis: 'paused', estimated_additional_students: 0, reason: 'Resolve the current health pressure before planning additional concurrent students.' };
  }
  if (health.rating === 'unknown' || students === null || online === null || used === null || headroom === null || students > online) return result;
  if (headroom === 0) return { ...result, basis: 'paused', estimated_additional_students: 0, reason: 'The 70% connection planning budget is exhausted.' };
  if (tested !== null) {
    return { ...result, basis: 'load_test', confidence: 'configured', estimated_additional_students: Math.max(0, tested - students), estimated_total_students: tested,
      reason: 'Remaining places against the operator-configured load-tested student limit. Revalidate after changing the hosting plan or workload.' };
  }
  if (students < 10 || used < 1) return { ...result, reason: 'At least 10 online students and a non-zero connection sample are needed for the connection-only planning estimate. Configure a load-tested limit for a calibrated target.' };
  // A one-connection minimum per additional student deliberately avoids treating
  // multiplexed pool connections as evidence for unlimited student throughput.
  const connectionsPerUser = Math.max(1, used / online);
  const additional = Math.floor(headroom / connectionsPerUser);
  return { ...result, basis: 'connection_model', confidence: 'low', estimated_additional_students: additional, estimated_total_students: students + additional,
    reason: 'Low-confidence, connection-only planning estimate for similar activity; validate with a representative load test.',
    assumptions: [...result.assumptions, `Additional students are budgeted at ${connectionsPerUser.toFixed(2)} connections each (current cluster connections / online users, minimum 1). Background database work is included.`] };
}

export function databaseRates(previous: DatabaseMetrics | undefined, current: DatabaseMetrics) {
  if (!previous?.details || !current.details || previous.database !== current.database || previous.stats_reset !== current.stats_reset) return null;
  const seconds = (Date.parse(current.details.sampled_at) - Date.parse(previous.details.sampled_at)) / 1000;
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120) return null;
  const delta = (before: number | null, after: number | null) => before === null || after === null || after < before ? null : after - before;
  const committed = delta(previous.transactions.committed, current.transactions.committed);
  const rollback = delta(previous.transactions.rolled_back, current.transactions.rolled_back);
  const reads = delta(previous.blocks.read, current.blocks.read);
  if (committed === null || rollback === null || reads === null) return null;
  return { seconds, transactions_per_second: (committed + rollback) / seconds, rollbacks_per_second: rollback / seconds, blocks_read_per_second: reads / seconds };
}
