import type { ServerResponse } from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, providerName } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, type Request } from './workspace-http.js';
import { createServices, temporaryLoginEmail, temporaryPassword } from './signup.js';
import { featureLabels, type WorkspaceRole } from '../src/lib/workspace-roles.js';
import { text } from './providers.js';

export function managementError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (['PGRST202','PGRST205','42P01','42883'].includes(error.code || '')) throw new ApiError(503, 'Apply the workspace management migration in Supabase to enable administration.');
  if (error.code === 'P0001') throw new ApiError(403, 'The management change was rejected. Keep your own admin access and select an eligible account.');
  databaseError(error);
}
export async function managementAccount(admin: SupabaseClient, userId: string) {
  const result = await admin.from('workspace_accounts').select('role,enabled,can_mentor,department').eq('user_id',userId).maybeSingle(); managementError(result.error);
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
      const input=await jsonBody(request); const { user,admin,client }=await authenticate(request,env); const account=await managementAccount(admin,user.id);
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
      if (!administrator) throw new ApiError(403,'Administrator access is required.');
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
