import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Check, Mail, X } from 'lucide-react';
import { errorMessage, workspaceRequest, type WorkspaceInvitation } from '../../lib/workspace-api';

export default function WorkspaceInvitations({ user, onSaved, refreshKey }: { user: User; onSaved: (message: string) => Promise<void>; refreshKey: number }) {
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await workspaceRequest<{ invitations: WorkspaceInvitation[] }>('workspace', { action: 'invitation.list' });
      setInvitations(result.invitations || []);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  };

  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(initial); }, [user.id, refreshKey]);

  const respond = async (invitation: WorkspaceInvitation, action: 'invitation.accept' | 'invitation.reject') => {
    setBusy(invitation.id); setError('');
    try {
      await workspaceRequest('workspace', { action, invitationId: invitation.id });
      setInvitations(current => current.filter(item => item.id !== invitation.id));
      await onSaved(action === 'invitation.accept' ? `You joined ${invitation.projectTitle}.` : 'Invitation declined.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(null); }
  };

  if (loading || (!invitations.length && !error)) return null;
  return <section className="dash-panel workspace-invitations" aria-labelledby="workspace-invitations-title">
    <div className="dash-panel-heading"><div><h2 id="workspace-invitations-title"><Mail size={15} /> Team invitations</h2><p>Join registered teammates in a shared project workspace.</p></div><span className="dash-status">{invitations.length} pending</span></div>
    <div className="workspace-content">{error && <div className="dash-alert dash-alert-error" role="alert">{error}</div>}
      {invitations.map(invitation => <article className="workspace-callout" key={invitation.id}><Mail size={19} /><div><strong>{invitation.projectTitle}</strong><p>{invitation.inviterName} invited you to join this project.</p></div><div className="workspace-actions"><button className="dash-button dash-button-primary" disabled={busy !== null} onClick={() => void respond(invitation, 'invitation.accept')}><Check size={13} />{busy === invitation.id ? 'Joining…' : 'Accept'}</button><button className="dash-button" disabled={busy !== null} onClick={() => void respond(invitation, 'invitation.reject')}><X size={13} />Decline</button></div></article>)}
    </div>
  </section>;
}
