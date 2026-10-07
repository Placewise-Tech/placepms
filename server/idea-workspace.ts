import { createHash } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ideaChapterNames, ideaProjectSummary, planMarkdown, validateIdeaPlan, type IdeaPlan } from '../src/lib/idea-plan.js';
import { ApiError } from './integration-security.js';
import { databaseError } from './workspace-http.js';

function recordId(owner: string, plan: string, purpose: string) {
  const hash = createHash('sha256').update(`${owner}:${plan}:${purpose}`).digest('hex').slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
}

/** Stable record IDs make a partially completed handoff safe to resume. */
export async function createIdeaWorkspace(raw: unknown, user: User, client: SupabaseClient, admin: SupabaseClient) {
  let plan: IdeaPlan;
  try { plan = validateIdeaPlan(raw); } catch (cause) { throw new ApiError(400, cause instanceof Error ? cause.message : 'The project plan is invalid.'); }
  if (!user.email) throw new ApiError(400, 'Your account needs an email address to create a project.');
  const email = user.email.toLowerCase();
  const find = () => client.from('pms_squads').select('id,leader_email,status').eq('id', plan.id).maybeSingle();
  let project = await find(); databaseError(project.error);
  if (!project.data) {
    const result = await client.from('pms_squads').insert({ id: plan.id, title: plan.title, tagline: `From idea to delivery in ${plan.weeks} weeks`, domain: plan.domain,
      summary: ideaProjectSummary(plan), leader_email: email, current_phase: plan.phases[0].title, status: 'PENDING',
    }).select('id,leader_email,status').single();
    if (result.error?.code === '23505') { project = await find(); databaseError(project.error); }
    else { databaseError(result.error); project = result; }
  }
  if (!project.data || project.data.leader_email?.toLowerCase() !== email) throw new ApiError(403, 'This draft cannot be imported into that project. Build a fresh plan for your account.');
  if (['ARCHIVED', 'CANCELLED', 'REJECTED'].includes(project.data.status || '')) throw new ApiError(409, 'That project is inactive. Build a fresh plan or restore the project before retrying.');

  const milestones = plan.milestones.map(item => ({ id: item.id, squad_id: plan.id, name: item.name, phase: item.phase, description: item.description, start_date: item.startDate, due_date: item.dueDate, status: 'PENDING' }));
  const saved = await client.from('milestones').upsert(milestones, { onConflict: 'id', ignoreDuplicates: true }); databaseError(saved.error);
  const check = await client.from('milestones').select('id').eq('squad_id', plan.id).in('id', milestones.map(item => item.id)); databaseError(check.error);
  if (check.data?.length !== milestones.length) throw new ApiError(409, 'A planned milestone could not be attached to this project. Build a fresh draft and try again.');

  const documentFeature = await admin.rpc('workspace_feature_access', { p_user_id: user.id, p_feature: 'document' }); databaseError(documentFeature.error);
  let documentSaved = false; let blackbookSaved = false;
  if (documentFeature.data === true) {
    const document = await client.from('workspace_library').upsert({ id: recordId(user.id, plan.id, 'plan'), user_id: user.id, kind: 'document', title: `Project plan — ${plan.title}`.slice(0, 200), notes: planMarkdown(plan), tags: ['idea-plan', 'project-plan'], project_id: plan.id }, { onConflict: 'id', ignoreDuplicates: true });
    databaseError(document.error); documentSaved = true;
    const blackbookFeature = await admin.rpc('workspace_feature_access', { p_user_id: user.id, p_feature: 'blackbook' }); databaseError(blackbookFeature.error);
    if (blackbookFeature.data === true) {
      const sections = Object.fromEntries(ideaChapterNames.map((name, index) => [name, `[Planning outline — replace with your authored project content]\n${plan.chapters[index]?.prompt || 'Write this section using your actual project evidence.'}`]));
      const draft = await client.from('workspace_library').upsert({ id: recordId(user.id, plan.id, 'blackbook'), user_id: user.id, kind: 'document', title: `Blackbook draft — ${plan.title}`.slice(0, 200), notes: JSON.stringify({ version: 1, title: plan.title, sections, report: '' }), tags: ['blackbook-draft', 'idea-plan'], project_id: plan.id }, { onConflict: 'id', ignoreDuplicates: true });
      databaseError(draft.error); blackbookSaved = true;
    }
  }
  return { projectId: plan.id, milestones: milestones.length, documentSaved, blackbookSaved };
}
