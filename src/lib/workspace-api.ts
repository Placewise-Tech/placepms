import { supabase } from './supabase';

export class WorkspaceApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function workspaceRequest<T>(endpoint: 'integrations' | 'sessions' | 'workspace' | 'management', body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new WorkspaceApiError('Please sign in again.', 401);
  const timeout = AbortSignal.timeout(55_000);
  let response: Response;
  try {
    response = await fetch(`/api/${endpoint}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (cause) {
    if (cause instanceof TypeError && /fetch/i.test(cause.message)) throw new WorkspaceApiError('Unable to reach the workspace service. Check your connection and try again.', 0);
    throw cause;
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new WorkspaceApiError(result?.error || 'The workspace service is unavailable. Please retry.', response.status);
  if (!result) throw new Error('The workspace service returned an invalid response.');
  return result as T;
}

export function downloadText(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'The operation could not be completed.';
