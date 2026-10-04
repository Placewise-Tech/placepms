import type { ServerResponse } from 'node:http';
import { ApiError } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, type Request } from './workspace-http.js';
import { text } from './providers.js';

function field(input: Record<string, unknown>, name: string, max: number, required = false) {
  const value = text(input[name]).trim();
  if ((required && !value) || value.length > max) throw new ApiError(400, `${name.replace(/_/g, ' ')} must ${required ? 'be provided and ' : ''}contain at most ${max} characters.`);
  return value || null;
}
function external(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Reject unsupported links. */ }
  throw new ApiError(400, 'Use an HTTP or HTTPS link without embedded credentials.');
}
function date(value: unknown) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new ApiError(400, 'Enter a valid calendar date.');
  return value;
}

export function createWorkspaceHandler(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request, response: ServerResponse) => {
    try {
      const input = await jsonBody(request); const { user, admin, client } = await authenticate(request, env);
      const projectId = field(input, 'projectId', 100, true)!;
      const found = await client.from('pms_squads').select('id,leader_email,mentor_id,mentor_name').eq('id', projectId).maybeSingle();
      databaseError(found.error);
      if (!found.data) throw new ApiError(403, 'You do not have access to this project.');
      const project = found.data;
      const owner = project.leader_email?.toLowerCase() === user.email?.toLowerCase();
      const mentor = project.mentor_id === user.id || project.mentor_id?.toLowerCase() === user.email?.toLowerCase();
      if (['project.update', 'project.archive', 'member.add', 'member.update', 'member.remove', 'milestone.delete'].includes(text(input.action)) && !owner) throw new ApiError(403, 'Only the project lead can make this change.');
      if (input.action === 'project.update') {
        const values: Record<string, unknown> = {
          title: field(input, 'title', 160, true), tagline: field(input, 'tagline', 200), domain: field(input, 'domain', 120), summary: field(input, 'summary', 4000), current_phase: field(input, 'current_phase', 120),
          github_repo: external(field(input, 'github_repo', 2000)), figma_url: external(field(input, 'figma_url', 2000)), miro_url: external(field(input, 'miro_url', 2000)), updated_at: new Date().toISOString(),
        };
        if (typeof input.mentor_email === 'string') {
          const email = input.mentor_email.trim().toLowerCase();
          if (email) {
            if (email === user.email?.toLowerCase()) throw new ApiError(400, 'Choose a mentor other than yourself.');
            const result = await admin.from('profiles').select('id,full_name').eq('email', email).maybeSingle(); databaseError(result.error);
            if (!result.data) throw new ApiError(400, 'That mentor needs a registered PlacePMS profile first.');
            values.mentor_id = result.data.id; values.mentor_name = result.data.full_name || email;
          } else if (input.clear_mentor === true) { values.mentor_id = null; values.mentor_name = null; }
        }
        const result = await client.from('pms_squads').update(values).eq('id', projectId).eq('leader_email', project.leader_email).select('id').single(); databaseError(result.error);
      } else if (input.action === 'project.archive') {
        const result = await client.from('pms_squads').update({ status: input.restore === true ? 'PENDING' : 'ARCHIVED', updated_at: new Date().toISOString() }).eq('id', projectId).select('id').single(); databaseError(result.error);
      } else if (input.action === 'member.add' || input.action === 'member.update') {
        const email = field(input, 'email', 254, true)!.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid member email.');
        const existing = await admin.from('squad_members').select('id').eq('squad_id', projectId).eq('email', email); databaseError(existing.error);
        const memberId = input.action === 'member.update' ? field(input, 'memberId', 100, true)! : null;
        if (existing.data?.some(item => item.id !== memberId)) throw new ApiError(409, 'This member is already on the team.');
        const record = { squad_id: projectId, email, name: field(input, 'name', 160, true), role: field(input, 'role', 100) || 'Member', skills: [...new Set((field(input, 'skills', 500) || '').split(',').map(value => value.trim()).filter(Boolean))].slice(0, 12) };
        const result = memberId ? await admin.from('squad_members').update(record).eq('squad_id', projectId).eq('id', memberId).select('id').single() : await admin.from('squad_members').insert(record).select('id').single(); databaseError(result.error);
      } else if (input.action === 'member.remove') {
        const result = await admin.from('squad_members').delete().eq('squad_id', projectId).eq('id', field(input, 'memberId', 100, true)!); databaseError(result.error);
      } else if (['milestone.update', 'milestone.delete', 'milestone.review', 'milestone.submit'].includes(text(input.action))) {
        const id = field(input, 'milestoneId', 100, true)!;
        const milestone = await client.from('milestones').select('id,status').eq('id', id).eq('squad_id', projectId).maybeSingle(); databaseError(milestone.error);
        if (!milestone.data) throw new ApiError(404, 'Milestone not found.');
        if (input.action === 'milestone.submit') {
          if (['APPROVED', 'COMPLETED', 'COMPLETE', 'DONE', 'ARCHIVED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(milestone.data.status || '')) throw new ApiError(409, 'Completed or inactive milestones cannot be submitted.');
          const withdraw = input.withdraw === true;
          if (withdraw !== (milestone.data.status === 'SUBMITTED')) throw new ApiError(409, 'The milestone status changed. Refresh before trying again.');
          const result = await client.from('milestones').update({ status: withdraw ? 'PENDING' : 'SUBMITTED', submitted_at: withdraw ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('squad_id', projectId).eq('status', milestone.data.status).select('id').single(); databaseError(result.error);
        } else if (input.action === 'milestone.review') {
          if (!mentor) throw new ApiError(403, 'Only this project’s assigned mentor can review submissions.');
          if (milestone.data.status !== 'SUBMITTED') throw new ApiError(409, 'Only a submitted milestone can be reviewed.');
          const score = input.score === '' || input.score === null || input.score === undefined ? null : Number(input.score);
          if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new ApiError(400, 'Score must be between 0 and 100.');
          const result = await client.from('milestones').update({ status: input.approve === true ? 'APPROVED' : 'REVISION_REQUESTED', mentor_feedback: field(input, 'feedback', 4000, input.approve !== true), score, updated_at: new Date().toISOString() }).eq('id', id).eq('squad_id', projectId).eq('status', 'SUBMITTED').select('id').single(); databaseError(result.error);
        } else if (input.action === 'milestone.delete') {
          const result = await client.from('milestones').delete().eq('id', id).eq('squad_id', projectId); databaseError(result.error);
        } else {
          if (['APPROVED', 'COMPLETED', 'COMPLETE', 'DONE', 'SUBMITTED', 'ARCHIVED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(milestone.data.status || '')) throw new ApiError(409, 'Withdraw a submission before editing it. Completed and inactive milestones are read-only.');
          const start = date(input.start_date); const due = date(input.due_date);
          if (start && due && start > due) throw new ApiError(400, 'Due date must be on or after the start date.');
          const links = text(input.links).split('\n').map(value => value.trim()).filter(Boolean);
          if (links.length > 20) throw new ApiError(400, 'Attach at most 20 submission links.');
          const result = await client.from('milestones').update({ name: field(input, 'name', 160, true), phase: field(input, 'phase', 120, true), description: field(input, 'description', 4000), start_date: start, due_date: due, submission_files: links.map((url, index) => ({ name: `Submission ${index + 1}`, url: external(url) })), updated_at: new Date().toISOString() }).eq('id', id).eq('squad_id', projectId).eq('status', milestone.data.status).select('id').single(); databaseError(result.error);
        }
      } else throw new ApiError(400, 'Unknown project operation.');
      jsonResponse(response, { saved: true });
    } catch (cause) { errorResponse(response, cause); }
  };
}
