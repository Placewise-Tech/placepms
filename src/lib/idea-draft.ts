import { validateIdeaPlan, type IdeaPlan } from './idea-plan';

export const ideaDraftKey = 'placepms:idea-plan:v1';
export interface IdeaDraft { version: 1; plan: IdeaPlan; pending: boolean; savedAt: string; ownerId?: string; importedProjectId?: string }

export function readIdeaDraft(storage?: Pick<Storage, 'getItem'>): IdeaDraft | null {
  try {
    const raw = (storage ?? localStorage).getItem(ideaDraftKey);
    if (!raw || raw.length > 32768) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.pending !== 'boolean' || typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return null;
    if (value.ownerId !== undefined && (typeof value.ownerId !== 'string' || value.ownerId.length > 100)) return null;
    return { version: 1, plan: validateIdeaPlan(value.plan), pending: value.pending, savedAt: value.savedAt, ownerId: value.ownerId, importedProjectId: typeof value.importedProjectId === 'string' ? value.importedProjectId : undefined };
  } catch { return null; }
}

export function saveIdeaDraft(plan: IdeaPlan, options: { pending?: boolean; ownerId?: string; importedProjectId?: string } = {}, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): IdeaDraft {
  const validated = validateIdeaPlan(plan);
  const previous = readIdeaDraft(storage);
  const same = previous?.plan.id === validated.id;
  const draft: IdeaDraft = { version: 1, plan: validated, pending: options.pending ?? (same ? previous!.pending : false), savedAt: new Date().toISOString(), ownerId: options.ownerId ?? (same ? previous!.ownerId : undefined), importedProjectId: options.importedProjectId ?? (same ? previous!.importedProjectId : undefined) };
  storage.setItem(ideaDraftKey, JSON.stringify(draft));
  return draft;
}

export function prepareIdeaHandoff(plan: IdeaPlan): IdeaDraft {
  const previous = readIdeaDraft();
  const fresh = (previous?.importedProjectId || previous?.ownerId) && previous?.plan.id === plan.id
    ? { ...plan, id: crypto.randomUUID(), phases: plan.phases.map(item => ({ ...item, id: crypto.randomUUID() })), milestones: plan.milestones.map(item => ({ ...item, id: crypto.randomUUID() })) }
    : plan;
  return saveIdeaDraft(fresh, { pending: true });
}

export function completeIdeaDraft(planId: string, ownerId: string, projectId: string) {
  const draft = readIdeaDraft();
  if (draft?.plan.id === planId && (!draft.ownerId || draft.ownerId === ownerId)) saveIdeaDraft(draft.plan, { pending: false, ownerId, importedProjectId: projectId });
}
export function clearIdeaDraft() { localStorage.removeItem(ideaDraftKey); }
