import type { ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, serverClients, type Request } from './workspace-http.js';
import { managementAccount } from './management.js';
import { text } from './providers.js';

type AutomationTask = {
  id: string; project_id: string; manager_id: string; title: string; description: string;
  task_type: 'MILESTONE_AUDIT' | 'HTTP_CHECK'; target_url: string | null;
  frequency: 'ONCE' | 'DAILY' | 'WEEKLY'; scheduled_for?: string; next_run_at?: string;
};

function value(input: Record<string, unknown>, name: string, max: number, required = false) {
  const result = text(input[name]).trim();
  if ((required && !result) || result.length > max) throw new ApiError(400, `${name} must ${required ? 'be provided and ' : ''}contain at most ${max} characters.`);
  return result || null;
}

function id(valueToCheck: unknown, name: string) {
  const result = text(valueToCheck).trim();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result)) throw new ApiError(400, `Choose a valid ${name}.`);
  return result;
}

function externalUrl(valueToCheck: unknown) {
  const value = text(valueToCheck).trim();
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError(400, 'Enter a valid HTTP or HTTPS target URL.'); }
  const hostname = url.hostname.toLowerCase();
  const privateHost = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'metadata.google.internal' || hostname === 'metadata.google' || hostname === '0.0.0.0' || hostname === '::1' || hostname.startsWith('127.') || hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('169.254.') || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80.');
  const numeric = isIP(hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || privateHost || (numeric === 4 && /^172\.(1[6-9]|2\d|3[01])\./.test(hostname))) throw new ApiError(400, 'Use a public HTTP or HTTPS URL without embedded credentials.');
  if (url.href.length > 2000) throw new ApiError(400, 'The target URL is too long.');
  return url.href;
}

function isoDate(valueToCheck: unknown) {
  const value = text(valueToCheck).trim();
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new ApiError(400, 'Choose a valid first run date and time.');
  return date.toISOString();
}

function validTaskType(valueToCheck: unknown): AutomationTask['task_type'] {
  const value = text(valueToCheck);
  if (value !== 'MILESTONE_AUDIT' && value !== 'HTTP_CHECK') throw new ApiError(400, 'Choose a supported automation check.');
  return value;
}

function validFrequency(valueToCheck: unknown): AutomationTask['frequency'] {
  const value = text(valueToCheck);
  if (value !== 'ONCE' && value !== 'DAILY' && value !== 'WEEKLY') throw new ApiError(400, 'Choose a supported repeat schedule.');
  return value;
}

function automationError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code || '')) throw new ApiError(503, 'Apply the workspace automation migration in Supabase to enable cloud task scheduling.');
  databaseError(error);
}

async function projectFor(client: SupabaseClient, projectId: string) {
  const result = await client.from('pms_squads').select('id,leader_email,mentor_id').eq('id', projectId).maybeSingle();
  automationError(result.error);
  if (!result.data) throw new ApiError(403, 'You do not have access to this project.');
  return result.data;
}

async function userCanManage(project: { leader_email: string; mentor_id: string | null }, user: { id: string; email?: string }, administrator: boolean) {
  return administrator || project.leader_email.toLowerCase() === user.email?.toLowerCase() || project.mentor_id === user.id || project.mentor_id?.toLowerCase() === user.email?.toLowerCase();
}

async function userActions(input: Record<string, unknown>, user: { id: string; email?: string }, client: SupabaseClient, administrator: boolean) {
  const action = text(input.action);
  if (action === 'task.list') {
    const result = await client.from('workspace_automation_tasks').select('id,project_id,created_by,manager_id,title,description,task_type,target_url,frequency,next_run_at,status,locked_until,last_run_at,last_status,last_error,created_at,updated_at').order('next_run_at', { ascending: true }).limit(100);
    automationError(result.error); return { tasks: result.data || [] };
  }
  if (action === 'report.list') {
    const result = await client.from('workspace_automation_runs').select('id,task_id,project_id,manager_id,scheduled_for,started_at,completed_at,status,summary,details,error').order('started_at', { ascending: false }).limit(100);
    automationError(result.error); return { reports: result.data || [] };
  }
  if (action === 'work.list') {
    const result = await client.from('workspace_automation_work_items').select('id,project_id,report_id,manager_id,developer_id,assignee_role,title,description,due_at,status,created_at,updated_at').order('updated_at', { ascending: false }).limit(100);
    automationError(result.error); return { work: result.data || [] };
  }

  if (action === 'task.create') {
    const projectId = value(input, 'projectId', 100, true)!; const project = await projectFor(client, projectId);
    if (!await userCanManage(project, user, administrator)) throw new ApiError(403, 'Only the project lead, assigned mentor, or administrator can schedule an automation.');
    const taskType = validTaskType(input.taskType); const targetUrl = taskType === 'HTTP_CHECK' ? externalUrl(input.targetUrl) : null;
    const managerId = input.managerId ? id(input.managerId, 'manager') : user.id;
    const frequency = validFrequency(input.frequency); const nextRunAt = isoDate(input.nextRunAt);
    const result = await client.from('workspace_automation_tasks').insert({ project_id: projectId, created_by: user.id, manager_id: managerId, title: value(input, 'title', 200, true), description: value(input, 'description', 4000) || '', task_type: taskType, target_url: targetUrl, frequency, next_run_at: nextRunAt }).select('id').single();
    automationError(result.error); return { saved: true, id: result.data?.id };
  }

  if (action === 'task.pause' || action === 'task.resume') {
    const taskId = id(input.taskId, 'automation task');
    const existing = await client.from('workspace_automation_tasks').select('id,project_id,status').eq('id', taskId).maybeSingle(); automationError(existing.error);
    if (!existing.data) throw new ApiError(404, 'Automation task not found.');
    const project = await projectFor(client, existing.data.project_id); if (!await userCanManage(project, user, administrator)) throw new ApiError(403, 'Only the manager can change this automation.');
    const result = await client.from('workspace_automation_tasks').update({ status: action === 'task.pause' ? 'PAUSED' : 'ACTIVE', locked_until: null }).eq('id', taskId).select('id').maybeSingle(); automationError(result.error);
    if (!result.data) throw new ApiError(404, 'Automation task is no longer available.');
    return { saved: true };
  }

  if (action === 'work.create') {
    const projectId = value(input, 'projectId', 100, true)!; const project = await projectFor(client, projectId);
    if (!await userCanManage(project, user, administrator)) throw new ApiError(403, 'Only the project lead, assigned mentor, or administrator can assign follow-up work.');
    const developerId = id(input.developerId, 'assignee'); const reportId = input.reportId ? id(input.reportId, 'report') : null;
    const assigneeRole = text(input.assigneeRole).toUpperCase() || 'DEVELOPER';
    if (assigneeRole !== 'DEVELOPER' && assigneeRole !== 'TESTER') throw new ApiError(400, 'Choose a developer or tester assignment.');
    const result = await client.from('workspace_automation_work_items').insert({ project_id: projectId, report_id: reportId, manager_id: user.id, developer_id: developerId, assignee_role: assigneeRole, title: value(input, 'title', 200, true), description: value(input, 'description', 4000) || '', due_at: input.dueAt ? isoDate(input.dueAt) : null }).select('id').single();
    automationError(result.error); return { saved: true, id: result.data?.id };
  }

  if (action === 'work.status') {
    const workId = id(input.workId, 'work item'); const status = text(input.status);
    if (!['ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'].includes(status)) throw new ApiError(400, 'Choose a valid work status.');
    const result = await client.from('workspace_automation_work_items').update({ status }).eq('id', workId).select('id').maybeSingle(); automationError(result.error);
    if (!result.data) throw new ApiError(404, 'Work item not found or unavailable.');
    return { saved: true };
  }
  throw new ApiError(400, 'Unknown automation operation.');
}

async function executeTask(admin: SupabaseClient, task: AutomationTask) {
  if (task.task_type === 'MILESTONE_AUDIT') {
    const result = await admin.from('milestones').select('id,name,status,due_date').eq('squad_id', task.project_id);
    automationError(result.error);
    const milestones = result.data || []; const today = new Date().toISOString().slice(0, 10);
    const open = milestones.filter(item => !['APPROVED', 'COMPLETED', 'COMPLETE', 'DONE', 'ARCHIVED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes((item.status || '').toUpperCase()));
    const overdue = open.filter(item => item.due_date && item.due_date < today); const revisions = milestones.filter(item => item.status === 'REVISION_REQUESTED'); const submitted = milestones.filter(item => item.status === 'SUBMITTED');
    const success = overdue.length === 0 && revisions.length === 0;
    return { success, status: success ? 'PASS' : 'FAIL', summary: success ? `Milestone audit passed: ${milestones.length} milestones checked.` : `Milestone audit found ${overdue.length} overdue and ${revisions.length} revision-requested milestone${revisions.length === 1 ? '' : 's'}.`, details: { total: milestones.length, open: open.length, overdue: overdue.length, revisions: revisions.length, submitted: submitted.length } };
  }
  if (!task.target_url) throw new ApiError(400, 'HTTP check has no target URL.');
  const started = Date.now(); let response: Response;
  try { response = await fetch(task.target_url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { Accept: 'text/plain, application/json' } }); }
  catch (cause) { return { success: false, status: 'ERROR' as const, summary: `HTTP check could not reach ${task.target_url}.`, details: { duration_ms: Date.now() - started }, error: cause instanceof Error ? cause.message.slice(0, 500) : 'Request failed' }; }
  const success = response.status >= 200 && response.status < 400;
  return { success, status: success ? 'PASS' as const : 'FAIL' as const, summary: `HTTP check returned ${response.status} for ${task.target_url}.`, details: { status: response.status, duration_ms: Date.now() - started, redirected: response.status >= 300 && response.status < 400 } };
}

async function runDueTasks(admin: SupabaseClient) {
  const claimed = await admin.rpc('workspace_claim_due_automation_tasks', { p_limit: 10 }); automationError(claimed.error);
  const runClaimedTask = async (task: AutomationTask) => {
    try {
      const result = await executeTask(admin, task);
      const saved = await admin.from('workspace_automation_runs').insert({ task_id: task.id, project_id: task.project_id, manager_id: task.manager_id, scheduled_for: task.scheduled_for, completed_at: new Date().toISOString(), status: result.status, summary: result.summary, details: result.details, error: 'error' in result ? result.error || '' : '' }).select('id').single();
      automationError(saved.error);
      const completed = await admin.rpc('workspace_complete_automation_task', { p_task_id: task.id, p_success: result.success, p_status: result.status, p_error: 'error' in result ? result.error || '' : '' }); automationError(completed.error);
      return { id: task.id, status: result.status };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Automation execution failed.';
      const saved = await admin.from('workspace_automation_runs').insert({ task_id: task.id, project_id: task.project_id, manager_id: task.manager_id, scheduled_for: task.scheduled_for, completed_at: new Date().toISOString(), status: 'ERROR', summary: 'The automated check could not complete.', details: {}, error: message.slice(0, 2000) }).select('id').maybeSingle();
      automationError(saved.error);
      const completed = await admin.rpc('workspace_complete_automation_task', { p_task_id: task.id, p_success: false, p_status: 'ERROR', p_error: message }); automationError(completed.error);
      return { id: task.id, status: 'ERROR' };
    }
  };
  // Run independent checks concurrently so ten public checks cannot exceed the
  // serverless function timeout merely because one endpoint is slow.
  return Promise.all(((claimed.data || []) as AutomationTask[]).map(task => runClaimedTask(task)));
}

export function createAutomationHandler(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request, response: ServerResponse) => {
    try {
      if (request.method === 'GET') {
        const secret = env.CRON_SECRET || env.AUTOMATION_CRON_SECRET;
        if (!secret || request.headers.authorization !== `Bearer ${secret}`) throw new ApiError(401, 'Automation runner authorization required.');
        const { admin } = serverClients(env); const results = await runDueTasks(admin); jsonResponse(response, { processed: results.length, results }); return;
      }
      const input = await jsonBody(request); const { user, client, admin } = await authenticate(request, env); const account = await managementAccount(admin, user.id, env, user.email || '');
      jsonResponse(response, await userActions(input, user, client, account.role === 'admin'));
    } catch (cause) { errorResponse(response, cause); }
  };
}
