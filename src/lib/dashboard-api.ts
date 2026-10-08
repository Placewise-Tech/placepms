import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { DashboardData, Integration, Member, Milestone, Profile, Squad } from './dashboard-data';
import { emptyDashboard } from './dashboard-data';
import type { IntegrationStatus } from './integration-types';

const squadColumns = 'id,title,tagline,domain,summary,leader_email,mentor_id,mentor_name,github_repo,figma_url,miro_url,current_phase,status,created_at,updated_at';
const pageSize = 500;
const groupSize = 200;

interface QueryResponse<T> {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
  status?: number;
}

interface DashboardLoadOptions {
  signal?: AbortSignal;
  loadIntegrations?: (signal?: AbortSignal) => Promise<Integration[]>;
  onCoreLoaded?: (data: DashboardData) => void;
}

function causeMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause) return String(cause.message);
  return 'The workspace data could not be loaded. Please retry.';
}

// The authenticated client and database RLS determine which projects can be
// read, including leads, accepted members, mentors, and administrators. One
// paginated project query avoids duplicate lookups and case-sensitive emails.
export async function loadDashboard(client: SupabaseClient, user: User, options: DashboardLoadOptions = {}): Promise<DashboardData> {
  if (!user.email) throw new Error('This workspace requires an account with an email address.');
  const { signal, loadIntegrations, onCoreLoaded } = options;
  signal?.throwIfAborted();
  const result: DashboardData = { ...emptyDashboard, squads: [], milestones: [], members: [], integrations: [], sessions: [], errors: [] };
  const addError = (section: string, message: string) => {
    if (!result.errors.some(issue => issue.section === section && issue.message === message)) result.errors.push({ section, message });
  };

  async function readRows<T>(section: string, request: () => PromiseLike<QueryResponse<T>>) {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try {
        const response = await request();
        signal?.throwIfAborted();
        if (!response.error) return { rows: response.data || [], failed: false };
        // Retry only transient read failures, never permission/schema errors.
        if (attempt === 0 && (response.status === 408 || response.status === 429 || (response.status || 0) >= 500 || /Failed to fetch|fetch failed|network|timeout/i.test(response.error.message || ''))) continue;
        addError(section, response.error.message || 'The workspace data could not be loaded. Please retry.');
      } catch (cause) {
        signal?.throwIfAborted();
        if (attempt === 0 && /fetch|network|timeout/i.test(causeMessage(cause))) continue;
        addError(section, causeMessage(cause));
      }
      return { rows: [] as T[], failed: true };
    }
  }

  async function readPaged<T>(section: string, request: (offset: number) => PromiseLike<QueryResponse<T>>) {
    const rows: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await readRows(section, () => request(offset));
      rows.push(...page.rows);
      if (page.failed || page.rows.length < pageSize) return rows;
    }
  }

  // Start optional connection metadata immediately, but publish core workspace
  // data before waiting for it. Catch immediately to avoid unhandled rejections.
  const integrationLoader = loadIntegrations || (async (requestSignal?: AbortSignal) => {
    const { workspaceRequest } = await import('./workspace-api');
    const value = await workspaceRequest<IntegrationStatus>('integrations', { action: 'status' }, requestSignal);
    return value.connections.map(item => ({ id: item.provider, tool_name: item.provider, account: item.account, is_connected: true, updated_at: item.updated_at }));
  });
  const integrationTimeout = AbortSignal.timeout(8_000);
  const integrationSignal = signal ? AbortSignal.any([signal, integrationTimeout]) : integrationTimeout;
  const integrations = Promise.resolve().then(() => integrationLoader(integrationSignal)).then(rows => ({ rows, error: '' })).catch(cause => ({ rows: [] as Integration[], error: causeMessage(cause) }));

  const [profile, squads] = await Promise.all([
    readRows<Profile>('Profile', () => {
      const query = client.from('profiles').select('id,email,full_name,role,roll_number,division,batch,program,college,avatar_url').eq('id', user.id);
      return signal ? query.abortSignal(signal) : query;
    }),
    readPaged<Squad>('Projects', offset => {
      const query = client.from('pms_squads').select(squadColumns).order('created_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
      return signal ? query.abortSignal(signal) : query;
    }),
  ]);
  result.profile = profile.rows[0] ?? null;
  result.squads = squads;
  const publish = () => onCoreLoaded?.({
    ...result,
    squads: [...result.squads],
    milestones: [...result.milestones],
    members: [...result.members],
    integrations: [...result.integrations],
    errors: [...result.errors],
  });
  publish();

  // At most two project groups (four queries) run at once. Each group's member
  // and milestone pages run independently, avoiding a serial request waterfall.
  const ids = squads.map(squad => squad.id);
  for (let start = 0; start < ids.length; start += groupSize * 2) {
    await Promise.all([ids.slice(start, start + groupSize), ids.slice(start + groupSize, start + groupSize * 2)].filter(group => group.length).map(async projectIds => {
      const [milestones, members] = await Promise.all([
        readPaged<Milestone>('Milestones', offset => {
          const query = client.from('milestones').select('id,squad_id,name,phase,description,start_date,due_date,status,submission_files,mentor_feedback,score,submitted_at,created_at,updated_at').in('squad_id', projectIds).order('id').range(offset, offset + pageSize - 1);
          return signal ? query.abortSignal(signal) : query;
        }),
        readPaged<Member>('Team members', offset => {
          const query = client.from('squad_members').select('id,squad_id,name,email,role,skills').in('squad_id', projectIds).order('id').range(offset, offset + pageSize - 1);
          return signal ? query.abortSignal(signal) : query;
        }),
      ]);
      result.milestones.push(...milestones);
      result.members.push(...members);
    }));
  }
  result.milestones.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.id.localeCompare(b.id));
  signal?.throwIfAborted();
  publish();

  const connections = await integrations;
  signal?.throwIfAborted();
  result.integrations = connections.rows;
  if (connections.error) addError('Integrations', connections.error);
  publish();
  return result;
}
