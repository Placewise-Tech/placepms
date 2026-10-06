import type { ServerResponse } from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, providerName } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, type Request } from './workspace-http.js';
import { createServices, temporaryLoginEmail, temporaryPassword } from './signup.js';
import { designatedAdministratorEmail, featureLabels, type WorkspaceRole } from '../src/lib/workspace-roles.js';
import { text } from './providers.js';

export function managementError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (['PGRST202','PGRST205','42P01','42883'].includes(error.code || '')) throw new ApiError(503, 'Apply the workspace management migration in Supabase to enable administration.');
  if (error.code === 'P0001') throw new ApiError(403, 'The management change was rejected. Keep your own admin access and select an eligible account.');
  databaseError(error);
}
function configuredAdministratorEmail(env: NodeJS.ProcessEnv = process.env) {
  return (env.PLACEPMS_ADMIN_EMAIL || env.ADMIN_EMAIL || designatedAdministratorEmail).trim().toLowerCase();
}

export async function managementAccount(admin: SupabaseClient, userId: string, env: NodeJS.ProcessEnv = process.env, email = '') {
  let result = await admin.from('workspace_accounts').select('role,enabled,can_mentor,department').eq('user_id',userId).maybeSingle(); managementError(result.error);
  // Bootstrap the installation owner on first use when the database has no
  // administrator yet. The RPC remains the authority and prevents a second
  // administrator from being created through this convenience path.
  if (email.trim().toLowerCase() === configuredAdministratorEmail(env) && result.data?.role !== 'admin' && result.data?.enabled !== false) {
    const existingAdmin = await admin.from('workspace_accounts').select('user_id').eq('role','admin').limit(1); managementError(existingAdmin.error);
    if (!existingAdmin.data?.length) {
      const promoted = await admin.rpc('workspace_bootstrap_admin',{p_user_id:userId}); managementError(promoted.error);
      result = await admin.from('workspace_accounts').select('role,enabled,can_mentor,department').eq('user_id',userId).maybeSingle(); managementError(result.error);
    }
  }
  if (result.data?.enabled === false) throw new ApiError(403,'This account has been disabled by an administrator.');
  return result.data ? { ...result.data, managed:true } : { role: 'student', enabled: true, can_mentor: false, department: '', managed:false };
}
export async function assertFeature(admin: SupabaseClient, userId: string, feature: string) {
  const result = await admin.rpc('workspace_feature_access',{ p_user_id:userId,p_feature:feature }); managementError(result.error);
  if (result.data !== true) throw new ApiError(403,'This feature has been disabled by your administrator.');
}
const id = (value: unknown) => { const result=text(value); if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result)) throw new ApiError(400,'Select a valid account or report.'); return result; };
const roles: WorkspaceRole[] = ['admin','teacher','staff','student'];
function accountFields(input: Record<string,unknown>) {
  const role = text(input.role) as WorkspaceRole; const department=text(input.department).trim();
  if (!roles.includes(role) || department.length>120 || /[\r\n\0]/.test(department)) throw new ApiError(400,'Choose a valid role and department of up to 120 characters.');
  if (typeof input.can_mentor !== 'boolean' || (input.can_mentor && role==='student')) throw new ApiError(400,'Only teachers, staff, and administrators can be enabled as mentors.');
  return { role, department, can_mentor: input.can_mentor };
}

interface MonitoringProfile {
  id: string;
  email: string;
  full_name: string | null;
  college: string | null;
  role: string | null;
  roll_number?: string | null;
  division?: string | null;
  batch?: string | null;
  program?: string | null;
  avatar_url?: string | null;
}
interface MonitoringAccount { user_id: string; role: WorkspaceRole; enabled: boolean; can_mentor: boolean; department: string }
interface MonitoringSession { user_id: string; id: string; created_at: string; last_active_at: string; user_agent: string | null; ip: string | null; current_session: boolean }
interface MonitoringActivity { id: string; user_id: string; session_id: string | null; event_type: string; route: string; metadata: Record<string, unknown>; occurred_at: string }
interface MonitoringProject { id: string; title: string; leader_email: string; mentor_id: string | null; mentor_name: string | null; github_repo: string | null; figma_url: string | null; miro_url: string | null; current_phase: string | null; status: string | null; created_at: string | null; updated_at: string | null }
interface MonitoringMilestone { id: string; squad_id: string; name: string; phase: string; status: string | null; score: number | null; due_date: string | null; submitted_at: string | null; updated_at: string | null }
interface MonitoringMember { squad_id: string; email: string; name: string; role: string | null }
interface MonitoringConnection { user_id: string; provider: string; mode: string; account: string; expires_at: string | null; updated_at: string }
interface MonitoringReport { id: string; owner_id: string; project_id: string | null; repository: string; branch: string; snapshot_at: string; updated_at: string; loaded_commits: number; ai_marked: number }

function rows<T>(result: { data: T[] | null; error: { code?: string; message?: string } | null }) {
  managementError(result.error);
  return result.data || [];
}

async function readAll<T>(admin: SupabaseClient, table: string, columns: string, order = 'id', filter?: [string,string]) {
  const items: T[] = [];
  for (let offset=0;;offset+=500) {
    let query=admin.from(table).select(columns).order(order).range(offset,offset+499);
    if (filter) query=query.eq(filter[0],filter[1]);
    const result=await query; managementError(result.error);
    const page=(result.data || []) as unknown as T[]; items.push(...page);
    if (page.length<500) return items;
  }
}

function monitoringStatus(lastActive: string | null) {
  if (!lastActive) return 'offline';
  const age = Date.now() - Date.parse(lastActive);
  return age <= 5 * 60_000 ? 'online' : age <= 30 * 60_000 ? 'idle' : 'offline';
}

function latestTimestamp(values: (string | null | undefined)[]) {
  return values.filter((value): value is string => Boolean(value)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}

async function monitoringData(admin: SupabaseClient, client: SupabaseClient) {
  const [profiles, accounts, projects, milestones, members, connections, reports, activityResult, summaryResult, designReports] = await Promise.all([
    readAll<MonitoringProfile>(admin,'profiles','id,email,full_name,college,role,roll_number,division,batch,program,avatar_url'),
    readAll<MonitoringAccount>(admin,'workspace_accounts','user_id,role,enabled,can_mentor,department','user_id'),
    readAll<MonitoringProject>(admin,'pms_squads','id,title,leader_email,mentor_id,mentor_name,github_repo,figma_url,miro_url,current_phase,status,created_at,updated_at'),
    readAll<MonitoringMilestone>(admin,'milestones','id,squad_id,name,phase,status,score,due_date,submitted_at,updated_at'),
    readAll<MonitoringMember>(admin,'squad_members','squad_id,email,name,role'),
    readAll<MonitoringConnection>(admin,'integration_connections','user_id,provider,mode,account,expires_at,updated_at'),
    readAll<MonitoringReport>(admin,'workspace_repository_reports','id,owner_id,project_id,repository,branch,snapshot_at,updated_at,loaded_commits,ai_marked'),
    admin.from('workspace_activity').select('id,user_id,session_id,event_type,route,metadata,occurred_at').order('occurred_at',{ascending:false}).order('id').limit(10000),
    client.rpc('workspace_monitoring_activity_summary'),
    readAll<{id:string;owner_id:string;provider:string;title:string;url:string;snapshot_at:string}>(admin,'workspace_provider_reports','id,owner_id,provider,title,url,snapshot_at'),
  ]);
  managementError(summaryResult.error);
  const activitySummary = (summaryResult.data || { latest: [], activity_24h: 0, trends: [] }) as { latest: MonitoringActivity[]; activity_24h:number; trends:{at:string;count:number}[] };
  const activities = rows<MonitoringActivity>(activityResult);
  const sessions: MonitoringSession[] = [];
  for(let offset=0;;offset+=500) {
    const sessionResult=await client.rpc('workspace_admin_list_sessions').range(offset,offset+499);
    managementError(sessionResult.error);
    const page=(sessionResult.data || []) as unknown as MonitoringSession[];
    sessions.push(...page); if(page.length<500)break;
  }
  const accountByUser = new Map(accounts.map(account => [account.user_id, account]));
  const sessionsByUser = new Map<string, MonitoringSession[]>();
  sessions.forEach(session => { const list = sessionsByUser.get(session.user_id) || []; list.push(session); sessionsByUser.set(session.user_id, list); });
  const activityByUser = new Map<string, MonitoringActivity[]>();
  activities.forEach(activity => { const list = activityByUser.get(activity.user_id) || []; list.push(activity); activityByUser.set(activity.user_id, list); });
  const memberProjectsByEmail = new Map<string, Set<string>>();
  members.forEach(member => { const key = member.email.toLowerCase(); const ids = memberProjectsByEmail.get(key) || new Set<string>(); ids.add(member.squad_id); memberProjectsByEmail.set(key, ids); });
  const today = new Date().toISOString().slice(0, 10);
  const items = profiles.map(profile => {
    const userSessions = sessionsByUser.get(profile.id) || [];
    const userActivity = activityByUser.get(profile.id) || [];
    const latestActivity = userActivity[0];
    const latestPresence = userActivity.find(activity => activity.event_type === 'heartbeat' || activity.event_type === 'page_view');
    const lastActive = latestTimestamp([latestActivity?.occurred_at, ...userSessions.map(session => session.last_active_at)]);
    const projectIds = memberProjectsByEmail.get(profile.email.toLowerCase()) || new Set<string>();
    const userProjects = projects.filter(project => project.leader_email.toLowerCase() === profile.email.toLowerCase() || project.mentor_id === profile.id || project.mentor_id?.toLowerCase() === profile.email.toLowerCase() || projectIds.has(project.id));
    const projectIdSet = new Set(userProjects.map(project => project.id));
    const userMilestones = milestones.filter(milestone => projectIdSet.has(milestone.squad_id));
    const userConnections = connections.filter(connection => connection.user_id === profile.id);
    const userReports = reports.filter(report => report.owner_id === profile.id);
    const completed = userMilestones.filter(milestone => ['COMPLETED','COMPLETE','DONE','APPROVED'].includes((milestone.status || '').toUpperCase())).length;
    const activeMilestones = userMilestones.filter(milestone => !['CANCELLED','CANCELED','ARCHIVED','REJECTED'].includes((milestone.status || '').toUpperCase()));
    const account = accountByUser.get(profile.id);
    return {
      id: profile.id, email: profile.email, full_name: profile.full_name, college: profile.college,
      role: account?.role || 'student', enabled: account?.enabled !== false, can_mentor: account?.can_mentor || false,
      department: account?.department || '', status: account?.enabled === false || !userSessions.length ? 'offline' : monitoringStatus(lastActive), last_active_at: lastActive,
      last_route: latestPresence?.route || '', last_event_at: latestActivity?.occurred_at || null,
      active_sessions: userSessions.length, projects: userProjects.length, milestones: userMilestones.length,
      completed_milestones: completed, submitted_milestones: userMilestones.filter(milestone => milestone.status === 'SUBMITTED').length,
      overdue_milestones: activeMilestones.filter(milestone => milestone.due_date && milestone.due_date < today && !['COMPLETED','COMPLETE','DONE','APPROVED'].includes((milestone.status || '').toUpperCase())).length,
      completion: activeMilestones.length ? Math.round(completed / activeMilestones.length * 100) : 0,
      connections: userConnections.length, reports: userReports.length+designReports.filter(report=>report.owner_id===profile.id).length, ai_marked: userReports.reduce((sum, report) => sum + (report.ai_marked || 0), 0),
    };
  });
  return { profiles, accounts, projects, milestones, members, connections, reports, designReports, activities, activitySummary, sessions, items, accountByUser, activityByUser, sessionsByUser };
}

function filteredMonitoringUsers(items: Awaited<ReturnType<typeof monitoringData>>['items'], input: Record<string, unknown>, pageSize = 20) {
  const search = text(input.search).trim().toLowerCase().slice(0, 160);
  const role = text(input.role).trim(); const status = text(input.status).trim();
  const matching = items.filter(item => (!role || item.role === role) && (!status || item.status === status) && (!search || `${item.full_name || ''} ${item.email} ${item.college || ''} ${item.last_route}`.toLowerCase().includes(search)));
  matching.sort((a, b) => (b.status === 'online' ? 2 : b.status === 'idle' ? 1 : 0) - (a.status === 'online' ? 2 : a.status === 'idle' ? 1 : 0) || (Date.parse(b.last_active_at || '') || 0) - (Date.parse(a.last_active_at || '') || 0) || (a.full_name || a.email).localeCompare(b.full_name || b.email));
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  return { items: matching.slice((page - 1) * pageSize, page * pageSize), total: matching.length, page };
}

async function monitoringActivity(admin: SupabaseClient, input: Record<string, unknown>) {
  const page = Math.max(1, Math.min(100000, Math.floor(Number(input.page) || 1)));
  let query = admin.from('workspace_activity').select('id,user_id,session_id,event_type,route,metadata,occurred_at',{count:'exact'}).order('occurred_at',{ascending:false}).order('id').range((page - 1) * 40, page * 40 - 1);
  if (input.user_id) query = query.eq('user_id', id(input.user_id));
  if (text(input.event_type)) query = query.eq('event_type', text(input.event_type).slice(0, 64));
  if (text(input.search).trim()) query = query.ilike('route', `%${text(input.search).trim().slice(0, 80)}%`);
  const result = await query; managementError(result.error);
  const activity = (result.data || []) as MonitoringActivity[];
  const userIds = [...new Set(activity.map(item => item.user_id))];
  const profiles = userIds.length ? rows<Pick<MonitoringProfile,'id'|'email'|'full_name'>>(await admin.from('profiles').select('id,email,full_name').in('id', userIds)) : [];
  return { items: activity.map(item => ({ ...item, user: profiles.find(profile => profile.id === item.user_id) || null })), total: result.count || 0 };
}

export async function createManagedAccount(input: Record<string,unknown>, actor: string | null, env: NodeJS.ProcessEnv, suppliedServices?: ReturnType<typeof createServices>) {
  const fields = accountFields(input); const email=text(input.email).trim().toLowerCase(); const fullName=text(input.full_name).trim(); const organization=text(input.college).trim();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email) || email.length>254 || !fullName || fullName.length>120 || /[\r\n\0]/.test(fullName) || !organization || organization.length>200) throw new ApiError(400,'Provide a valid email, full name, and institution.');
  if (!actor && fields.role!=='admin') throw new ApiError(400,'First-account setup requires an administrator.');
  const services = suppliedServices || createServices(env); const { admin }=services;
  const code=temporaryPassword();
  const created=await admin.auth.admin.createUser({ email,password:code,email_confirm:true,user_metadata:{ full_name:fullName,college:organization,role:fields.role==='student'?'student':fields.role==='admin'?'college':'faculty' },app_metadata:{ must_change_password:true } });
  if (created.error?.code==='email_exists' || created.error?.code==='user_already_exists') throw new ApiError(409,'This email already has an account. Find it in Accounts and update its role.');
  if (created.error || !created.data.user) throw new ApiError(503,'The account could not be created. Please retry.');
  const userId=created.data.user.id;
  try {
    const registered=actor ? await admin.rpc('workspace_register_account',{ p_actor:actor,p_user:userId,p_role:fields.role,p_mentor:fields.can_mentor,p_department:fields.department }) : await admin.rpc('workspace_bootstrap_admin',{p_user_id:userId});
    managementError(registered.error);
    await services.sendMail(temporaryLoginEmail({ email,fullName,code,appUrl:services.appUrl,senderEmail:services.senderEmail,senderName:services.senderName }));
  } catch (cause) {
    const cleanup=await admin.auth.admin.deleteUser(userId).catch(()=>({ error:true }));
    if (cleanup.error) services.logError('Managed account setup failed; cleanup requires attention.');
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(502,'The account email could not be sent. Retry creation; existing accounts can use password recovery.');
  }
  return { id:userId, message:'Account created. The owner has been emailed a six-digit first-login code.' };
}

export function createManagementHandler(env: NodeJS.ProcessEnv=process.env, servicesFactory=createServices) {
  return async (request: Request,response: ServerResponse) => {
    try {
      const input=await jsonBody(request); const { user,admin,client }=await authenticate(request,env); const account=await managementAccount(admin,user.id,env,user.email || '');
      const settings=await admin.from('workspace_settings').select('registration_enabled,features').eq('id',true).single(); managementError(settings.error);
      const administrator=account.role==='admin'; const educator=administrator || ['teacher','staff'].includes(account.role);
      if (input.action==='access') { jsonResponse(response,{ ...account,settings:settings.data }); return; }
      if (input.action==='reports.list' || input.action==='reports.get') {
        if (!educator) throw new ApiError(403,'Administrator, teacher, or staff access is required.');
        if (input.action==='reports.get') {
          const result=await client.from('workspace_repository_reports').select('*').eq('id',id(input.id)).maybeSingle(); managementError(result.error);
          if (!result.data) throw new ApiError(404,'This saved analysis is not available to your account.');
          jsonResponse(response,result.data); return;
        }
        const page=Math.max(1,Math.min(100000,Number(input.page)||1)); const search=text(input.search).trim().slice(0,160);
        let query=client.from('workspace_repository_reports').select('id,owner_id,project_id,repository,branch,snapshot_at,updated_at,loaded_commits,ai_marked',{count:'exact'}).order('updated_at',{ascending:false}).order('id').range((page-1)*10,page*10-1);
        if (search) query=query.ilike('repository',`%${search}%`); if (input.ai_only===true) query=query.gt('ai_marked',0);
        const result=await query; managementError(result.error);
        const owners=[...new Set((result.data || []).map(row=>row.owner_id))];
        const profiles=owners.length ? await admin.from('profiles').select('id,email,full_name').in('id',owners) : {data:[],error:null}; managementError(profiles.error);
        jsonResponse(response,{ items:(result.data || []).map(row=>({ ...row,owner:profiles.data?.find(profile=>profile.id===row.owner_id) })),total:result.count || 0 }); return;
      }
      if (input.action==='educator.roster') {
        if (!educator) throw new ApiError(403,'Teacher or staff access is required.');
        const projectsResult=await client.from('pms_squads').select('id,title,leader_email,mentor_name,current_phase,status').order('updated_at',{ascending:false}); managementError(projectsResult.error);
        const projects=(projectsResult.data || []) as { id:string; title:string; leader_email:string; mentor_name:string|null; current_phase:string|null; status:string|null }[];
        const projectIds=projects.map(project=>project.id);
        const [membersResult,milestonesResult]=await Promise.all([
          projectIds.length ? client.from('squad_members').select('id,squad_id,email,name,role').in('squad_id',projectIds) : Promise.resolve({data:[],error:null}),
          projectIds.length ? client.from('milestones').select('id,squad_id,name,status,score,submitted_at,due_date').in('squad_id',projectIds) : Promise.resolve({data:[],error:null}),
        ]);
        managementError(membersResult.error); managementError(milestonesResult.error);
        const members=(membersResult.data || []) as { id:string; squad_id:string; email:string; name:string; role:string|null }[];
        const milestones=(milestonesResult.data || []) as { id:string; squad_id:string; name:string; status:string|null; score:number|null; submitted_at:string|null; due_date:string|null }[];
        const emails=[...new Set([...projects.map(project=>project.leader_email),...members.map(member=>member.email)].map(email=>email.toLowerCase()))];
        const profiles=emails.length ? await admin.from('profiles').select('id,email,full_name,college,program,batch,division,roll_number').in('email',emails) : {data:[],error:null}; managementError(profiles.error);
        const accounts=profiles.data?.length ? await admin.from('workspace_accounts').select('user_id,role,enabled').in('user_id',profiles.data.map(profile=>profile.id)) : {data:[],error:null}; managementError(accounts.error);
        const accountByUser=new Map((accounts.data || []).map(account=>[account.user_id,account]));
        const projectsByEmail=new Map<string,typeof projects>();
        projects.forEach(project=>{
          const emailsForProject=new Set([project.leader_email.toLowerCase(),...members.filter(member=>member.squad_id===project.id).map(member=>member.email.toLowerCase())]);
          emailsForProject.forEach(email=>projectsByEmail.set(email,[...(projectsByEmail.get(email) || []),project]));
        });
        const studentEmails=new Set([...projectsByEmail.keys()]);
        const students=[...studentEmails].map(email=>{
          const profile=profiles.data?.find(item=>item.email.toLowerCase()===email);
          const account=profile ? accountByUser.get(profile.id) : undefined;
          const linkedProjects=projectsByEmail.get(email) || [];
          const projectIdsForStudent=new Set(linkedProjects.map(project=>project.id));
          const studentMilestones=milestones.filter(milestone=>projectIdsForStudent.has(milestone.squad_id));
          const completed=studentMilestones.filter(milestone=>['APPROVED','COMPLETED','COMPLETE','DONE'].includes((milestone.status || '').toUpperCase())).length;
          return { id:profile?.id || email, email, full_name:profile?.full_name || members.find(member=>member.email.toLowerCase()===email)?.name || email.split('@')[0], college:profile?.college || null, program:profile?.program || null, batch:profile?.batch || null, division:profile?.division || null, roll_number:profile?.roll_number || null, role:account?.role || 'student', enabled:account?.enabled !== false, projects:linkedProjects.map(project=>({ id:project.id,title:project.title,phase:project.current_phase,status:project.status,mentor:project.mentor_name,milestones:studentMilestones.filter(milestone=>milestone.squad_id===project.id).map(milestone=>({ id:milestone.id,name:milestone.name,status:milestone.status,score:milestone.score,submitted_at:milestone.submitted_at,due_date:milestone.due_date })) })), milestone_count:studentMilestones.length, completed_count:completed, review_count:studentMilestones.filter(milestone=>milestone.status==='SUBMITTED').length };
        }).filter(student=>student.role==='student' || student.role==='disabled');
        jsonResponse(response,{ projects, students, updated_at:new Date().toISOString() }); return;
      }
      if (!administrator) throw new ApiError(403,'Administrator access is required.');
      if (input.action==='monitoring.overview' || input.action==='monitoring.users' || input.action==='monitoring.user') {
        const snapshot = await monitoringData(admin,client);
        if (input.action==='monitoring.user') {
          const target = id(input.id); const profile = snapshot.profiles.find(item => item.id === target);
          if (!profile) throw new ApiError(404,'Account not found.');
          const summary = snapshot.items.find(item => item.id === target);
          const projectIds = new Set(snapshot.projects.filter(project => project.leader_email.toLowerCase() === profile.email.toLowerCase() || project.mentor_id === target || project.mentor_id?.toLowerCase() === profile.email.toLowerCase() || snapshot.members.some(member => member.squad_id === project.id && member.email.toLowerCase() === profile.email.toLowerCase())).map(project => project.id));
          const projectDetails = snapshot.projects.filter(project => projectIds.has(project.id)).map(project => ({ ...project, milestones: snapshot.milestones.filter(milestone => milestone.squad_id === project.id), members: snapshot.members.filter(member => member.squad_id === project.id) }));
          const [reports, designReports] = await Promise.all([
            admin.from('workspace_repository_reports').select('id,owner_id,project_id,repository,branch,snapshot_at,scope_since,updated_at,loaded_commits,ai_marked,payload').eq('owner_id',target).order('updated_at',{ascending:false}).limit(100),
            admin.from('workspace_provider_reports').select('id,owner_id,provider,title,url,snapshot_at,payload').eq('owner_id',target).order('snapshot_at',{ascending:false}).limit(100),
          ]);
          managementError(reports.error); managementError(designReports.error);
          jsonResponse(response,{ profile, account:snapshot.accountByUser.get(target) || { user_id:target,role:'student',enabled:true,can_mentor:false,department:'' }, summary, sessions:snapshot.sessionsByUser.get(target) || [], activity:(snapshot.activityByUser.get(target) || []).slice(0,120), projects:projectDetails, connections:snapshot.connections.filter(connection => connection.user_id === target), analyses:reports.data || [], design_analyses:designReports.data || [] });
          return;
        }
        if (input.action==='monitoring.users') { jsonResponse(response,{ ...filteredMonitoringUsers(snapshot.items,input), updated_at:new Date().toISOString() }); return; }
        const visible = filteredMonitoringUsers(snapshot.items,{...input,page:1},12).items;
        const now = Date.now();
        const providerStats = ['github','figma','miro'].map(provider => ({ provider, accounts:snapshot.connections.filter(connection => connection.provider === provider).length, last_connected:snapshot.connections.filter(connection => connection.provider === provider).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))[0]?.updated_at || null }));
        const trends = snapshot.activitySummary.trends?.length ? snapshot.activitySummary.trends : Array.from({length:12},(_,index)=>{ const start=now-(11-index+1)*60*60*1000; const end=start+60*60*1000; return { at:new Date(start).toISOString(), count:snapshot.activities.filter(item=>{const time=Date.parse(item.occurred_at);return time>=start&&time<end;}).length }; });
        const userNames = new Map(snapshot.profiles.map(profile => [profile.id,profile.full_name || profile.email]));
        jsonResponse(response,{ counts:{accounts:snapshot.items.length,online:snapshot.items.filter(item=>item.status==='online').length,idle:snapshot.items.filter(item=>item.status==='idle').length,offline:snapshot.items.filter(item=>item.status==='offline').length,active_sessions:snapshot.sessions.length,projects:snapshot.projects.length,milestones:snapshot.milestones.length,submitted:snapshot.milestones.filter(item=>item.status==='SUBMITTED').length,completed:snapshot.milestones.filter(item=>['COMPLETED','COMPLETE','DONE','APPROVED'].includes((item.status||'').toUpperCase())).length,connections:snapshot.connections.length,reports:snapshot.reports.length,ai_marked:snapshot.reports.reduce((sum,report)=>sum+(report.ai_marked||0),0),activity_24h:snapshot.activitySummary.activity_24h},users:visible,activity:snapshot.activities.slice(0,24).map(item=>({...item,user_name:userNames.get(item.user_id)||'Unknown account',user_email:snapshot.profiles.find(profile=>profile.id===item.user_id)?.email||''})),providerStats,trends,updated_at:new Date().toISOString() });
        return;
      }
      if (input.action==='monitoring.activity') { jsonResponse(response,await monitoringActivity(admin,input)); return; }
      if (input.action==='accounts.list') {
        const role=text(input.role); if (role && !roles.includes(role as WorkspaceRole)) throw new ApiError(400,'Choose a valid role.');
        const result=await client.rpc('workspace_list_accounts',{p_search:text(input.search).trim().slice(0,160),p_role:role,p_page:Math.max(1,Math.floor(Number(input.page)||1))}); managementError(result.error); jsonResponse(response,result.data); return;
      }
      if (input.action==='accounts.create') { jsonResponse(response,await createManagedAccount(input,user.id,env,servicesFactory(env)),201); return; }
      if (input.action==='accounts.update') {
        const fields=accountFields(input); const target=id(input.id);
        if (typeof input.enabled!=='boolean') throw new ApiError(400,'Choose whether this account is enabled.');
        if (target===user.id && (fields.role!=='admin' || !input.enabled)) throw new ApiError(400,'You cannot remove your own administrator access.');
        const name=input.full_name===undefined?null:text(input.full_name).trim(); const college=input.college===undefined?null:text(input.college).trim();
        if (name!==null && (!name || name.length>120 || /[\r\n\0]/.test(name)) || college!==null && (!college || college.length>200)) throw new ApiError(400,'Enter a full name and institution within the allowed lengths.');
        const result=await client.rpc('workspace_update_account',{p_user:target,p_role:fields.role,p_enabled:input.enabled,p_mentor:fields.can_mentor,p_department:fields.department,p_name:name,p_college:college}); managementError(result.error);
        jsonResponse(response,{saved:true}); return;
      }
      if (input.action==='accounts.revoke') {
        const result=await client.rpc('workspace_revoke_user_sessions',{p_user:id(input.id)}); managementError(result.error); jsonResponse(response,{revoked:result.data}); return;
      }
      if (input.action==='accounts.reset') {
        const target=await admin.auth.admin.getUserById(id(input.id));
        if (target.error || !target.data.user?.email) throw new ApiError(404,'Account not found.');
        const services=servicesFactory(env); const link=await admin.auth.admin.generateLink({type:'recovery',email:target.data.user.email,options:{redirectTo:new URL('/reset-password',services.appUrl).href}});
        if (link.error || !link.data.properties?.action_link) throw new ApiError(503,'A password recovery link could not be generated.');
        await services.sendMail({ from:{name:services.senderName,address:services.senderEmail},to:target.data.user.email,subject:'Reset your PlacePMS password',text:`Your PlacePMS administrator requested a password reset. Open this link to choose your password:\n\n${link.data.properties.action_link}\n\nYour existing password remains valid until you change it.` });
        const logged=await admin.from('workspace_management_audit').insert({actor_id:user.id,action:'account.reset-email',subject:target.data.user.id}); managementError(logged.error);
        jsonResponse(response,{sent:true}); return;
      }
      if (input.action==='settings.update') {
        if (typeof input.registration_enabled!=='boolean' || !input.features || typeof input.features!=='object' || Array.isArray(input.features) || Object.entries(input.features).some(([key,value])=>!(key in featureLabels) || typeof value!=='boolean')) throw new ApiError(400,'Provide valid registration and feature settings.');
        const result=await client.rpc('workspace_manage_settings',{p_registration:input.registration_enabled,p_features:input.features}); managementError(result.error); jsonResponse(response,{saved:true}); return;
      }
      if (input.action==='connections.list') {
        const page=Math.max(1,Math.floor(Number(input.page)||1));
        const result=await admin.from('integration_connections').select('user_id,provider,mode,account,expires_at,updated_at',{count:'exact'}).order('updated_at',{ascending:false}).order('user_id').order('provider').range((page-1)*20,page*20-1); managementError(result.error);
        jsonResponse(response,{items:result.data || [],total:result.count || 0}); return;
      }
      if (input.action==='connections.disconnect') {
        const owner=id(input.id); const provider=providerName(input.provider);
        for (const table of ['integration_connections','integration_oauth_states']) { const result=await admin.from(table).delete().eq('user_id',owner).eq('provider',provider); managementError(result.error); }
        const logged=await admin.from('workspace_management_audit').insert({actor_id:user.id,action:`connection.disconnect.${provider}`,subject:owner}); managementError(logged.error); jsonResponse(response,{disconnected:true}); return;
      }
      if (input.action==='overview') {
        const counts=await Promise.all([['accounts','profiles'],['projects','pms_squads'],['milestones','milestones'],['connections','integration_connections'],['reports','workspace_repository_reports']].map(async ([name,table])=> { const result=await admin.from(table).select('*',{count:'exact',head:true}); managementError(result.error); return [name,result.count || 0]; }));
        const mentors=await admin.from('workspace_accounts').select('user_id',{count:'exact',head:true}).eq('enabled',true).eq('can_mentor',true); managementError(mentors.error);
        jsonResponse(response,{counts:{...Object.fromEntries(counts),mentors:mentors.count || 0},settings:settings.data}); return;
      }
      if (input.action==='audit.list') {
        const page=Math.max(1,Math.floor(Number(input.page)||1)); const result=await admin.from('workspace_management_audit').select('id,actor_id,action,subject,created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1); managementError(result.error); jsonResponse(response,{items:result.data || [],total:result.count || 0}); return;
      }
      throw new ApiError(400,'Unknown management action.');
    } catch(cause) { errorResponse(response,cause); }
  };
}
