import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { DashboardData, Member, Milestone, Profile, Squad } from './dashboard-data';
import { emptyDashboard } from './dashboard-data';
import { workspaceRequest } from './workspace-api';
import type { IntegrationStatus } from './integration-types';
import { workspaceRole } from './workspace-roles';

const squadColumns = 'id,title,tagline,domain,summary,leader_email,mentor_id,mentor_name,github_repo,figma_url,miro_url,current_phase,status,created_at,updated_at';

// Queries are scoped to the signed-in user. Supabase RLS is the authoritative
// access-control layer; no admin key is used in this module.
export async function loadDashboard(client: SupabaseClient, user: User): Promise<DashboardData> {
  const result: DashboardData = { ...emptyDashboard, squads: [], milestones: [], members: [], integrations: [], sessions: [], errors: [] };
  const email = user.email;
  if (!email) throw new Error('This workspace requires an account with an email address.');

  function collect<T>(section: string, response: { data: unknown; error: { message: string } | null }): T[] {
    if (response.error) result.errors.push({ section, message: response.error.message });
    return (response.data ?? []) as T[];
  }

  const [profile, membership, ledSquads, mentoredSquads, emailMentoredSquads, integrations] = await Promise.all([
    client.from('profiles').select('id,email,full_name,role,roll_number,division,batch,program,college,avatar_url').eq('id', user.id),
    client.from('squad_members').select('squad_id').eq('email', email),
    client.from('pms_squads').select(squadColumns).eq('leader_email', email),
    client.from('pms_squads').select(squadColumns).eq('mentor_id', user.id),
    client.from('pms_squads').select(squadColumns).eq('mentor_id', email),
    workspaceRequest<IntegrationStatus>('integrations', { action: 'status' }).then(value => ({ data: value.connections.map(item => ({ id: item.provider, tool_name: item.provider, account: item.account, is_connected: true, updated_at: item.updated_at })), error: null })).catch(cause => ({ data: [], error: { message: cause instanceof Error ? cause.message : 'Integrations unavailable.' } })),
  ]);

  result.profile = collect<Profile>('Profile', profile)[0] ?? null;
  result.integrations = collect('Integrations', integrations);
  const memberSquadIds = [...new Set(collect<{ squad_id: string }>('Memberships', membership).map(member => member.squad_id).filter(Boolean))];
  const squads = [
    ...collect<Squad>('Projects', ledSquads),
    ...collect<Squad>('Mentorship', mentoredSquads),
    ...collect<Squad>('Mentorship', emailMentoredSquads),
  ];
  if (memberSquadIds.length) {
    squads.push(...collect<Squad>('Team projects', await client.from('pms_squads').select(squadColumns).in('id', memberSquadIds)));
  }
  result.squads = [...new Map(squads.map(squad => [squad.id, squad])).values()]
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  if (workspaceRole(user)==='admin') {
    result.squads=[];
    for (let offset=0;;offset+=500) {
      const response=await client.from('pms_squads').select(squadColumns).order('created_at',{ascending:false}).order('id').range(offset,offset+499);
      const page=collect<Squad>('Projects',response); result.squads.push(...page);
      if (response.error || page.length<500) break;
    }
  }

  const ids = result.squads.map(squad => squad.id);
  if (ids.length) {
    for (let group=0;group<ids.length;group+=200) {
      const projectIds=ids.slice(group,group+200);
      for (const [table,columns,section] of [['milestones','id,squad_id,name,phase,description,start_date,due_date,status,submission_files,mentor_feedback,score,submitted_at,created_at,updated_at','Milestones'],['squad_members','id,squad_id,name,email,role,skills','Team members']]) {
        for (let offset=0;;offset+=500) {
          const response=await client.from(table).select(columns).in('squad_id',projectIds).order('id').range(offset,offset+499);
          const page=collect<Milestone | Member>(section,response);
          if (table==='milestones') result.milestones.push(...page as Milestone[]); else result.members.push(...page as Member[]);
          if (response.error || page.length<500) break;
        }
      }
    }
    result.milestones.sort((a,b)=>(a.due_date || '9999').localeCompare(b.due_date || '9999'));
  }
  return result;
}
