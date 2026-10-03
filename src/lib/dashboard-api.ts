import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { DashboardData, Integration, Member, Milestone, Profile, Squad, UserSession } from './dashboard-data';
import { emptyDashboard } from './dashboard-data';

const squadColumns = 'id,title,tagline,domain,summary,leader_email,mentor_id,mentor_name,github_repo,figma_url,miro_url,current_phase,status,created_at,updated_at';

// Queries are scoped to the signed-in user. Supabase RLS is the authoritative
// access-control layer; no admin key is used in this module.
export async function loadDashboard(client: SupabaseClient, user: User): Promise<DashboardData> {
  const result: DashboardData = { ...emptyDashboard, errors: [] };
  const email = user.email;
  if (!email) throw new Error('This workspace requires an account with an email address.');

  function collect<T>(section: string, response: { data: unknown; error: { message: string } | null }): T[] {
    if (response.error) result.errors.push({ section, message: response.error.message });
    return (response.data ?? []) as T[];
  }

  const [profile, membership, ledSquads, mentoredSquads, emailMentoredSquads, integrations, sessions] = await Promise.all([
    client.from('profiles').select('id,email,full_name,role,roll_number,division,batch,program,college,avatar_url').eq('id', user.id),
    client.from('squad_members').select('squad_id').eq('email', email),
    client.from('pms_squads').select(squadColumns).eq('leader_email', email),
    client.from('pms_squads').select(squadColumns).eq('mentor_id', user.id),
    client.from('pms_squads').select(squadColumns).eq('mentor_id', email),
    client.from('connected_integrations').select('id,tool_name,account,is_connected,updated_at').eq('user_email', email).order('updated_at', { ascending: false }),
    client.from('user_sessions').select('id,device_name,device_type,browser,os,location,status,created_at,last_active_at').eq('user_email', email).order('last_active_at', { ascending: false }),
  ]);

  result.profile = collect<Profile>('Profile', profile)[0] ?? null;
  result.integrations = collect<Integration>('Integrations', integrations);
  result.sessions = collect<UserSession>('Sessions', sessions);
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

  const ids = result.squads.map(squad => squad.id);
  if (ids.length) {
    const [milestones, members] = await Promise.all([
      client.from('milestones').select('id,squad_id,name,phase,description,start_date,due_date,status,submission_files,mentor_feedback,score,submitted_at,created_at,updated_at').in('squad_id', ids).order('due_date', { ascending: true, nullsFirst: false }),
      client.from('squad_members').select('id,squad_id,name,email,role,skills').in('squad_id', ids),
    ]);
    result.milestones = collect<Milestone>('Milestones', milestones);
    result.members = collect<Member>('Team members', members);
  }
  return result;
}
