import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, KeyRound } from 'lucide-react';

export default function PasswordRecovery({ onComplete, onSignOut, requiredSetup = false, email }: { onComplete: () => void; onSignOut?: () => void; requiredSetup?: boolean; email?: string }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <div className="workspace-gate auth-recovery">
      <form className="workspace-gate-card dash-form" onSubmit={async event => {
        event.preventDefault();
        if (password !== confirmation) { setError('The passwords do not match.'); return; }
        if (password.length < 12) { setError('Use at least 12 characters for your new password.'); return; }
        setSaving(true);
        setError('');
        try {
          if (!supabase) throw new Error('Supabase is not configured.');
          const { error: updateError } = await supabase.auth.updateUser({ password });
          if (updateError) throw updateError;
          const { data, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) throw refreshError;
          if (!data.session) throw new Error('Please sign in again with your new password.');
          if (data.session.user.app_metadata.must_change_password === true) {
            throw new Error('Your password was updated, but account setup is not complete. Please contact the PlacePMS administrator.');
          }
          onComplete();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your password.'); }
        finally { setSaving(false); }
      }}>
        <img src="/PlacePMS-Logo-White.svg" alt="PlacePMS" width="120" />
        <span className="auth-recovery-icon"><KeyRound size={27} /></span>
        <h1>{requiredSetup ? 'Set your own password' : 'Choose a new password'}</h1>
        <p>{requiredSetup ? `You are signed in${email ? ` as ${email}` : ''}. Replace your temporary login code with your own password to continue to your workspace.` : `Choose a new password for your PlacePMS account${email ? ` (${email})` : ''}.`}</p>
        <p>Use at least 12 characters for your new password.</p>
        {error && <div role="alert" className="auth-feedback auth-feedback-error">{error}</div>}
        <label>New password<input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Confirm password<input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <div className="auth-password-checks"><span className={password.length >= 12 ? 'is-met' : ''}><CheckCircle2 size={13} />At least 12 characters</span><span className={confirmation && confirmation === password ? 'is-met' : ''}><CheckCircle2 size={13} />Passwords match</span></div>
        <button className="dash-button dash-button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save password & open workspace'}</button>
        <button type="button" className="dash-button" disabled={saving} onClick={async () => {
          setSaving(true);
          try {
            const result = await supabase?.auth.signOut();
            if (result?.error) throw result.error;
            onSignOut?.();
          } catch { setError('Unable to sign out. Please try again.'); }
          finally { setSaving(false); }
        }}>Sign out</button>
      </form>
    </div>
  );
}
