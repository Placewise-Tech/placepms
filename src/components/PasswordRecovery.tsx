import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function PasswordRecovery({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <div className="workspace-gate">
      <form className="workspace-gate-card dash-form" onSubmit={async event => {
        event.preventDefault();
        if (password !== confirmation) { setError('The passwords do not match.'); return; }
        setSaving(true);
        setError('');
        try {
          if (!supabase) throw new Error('Supabase is not configured.');
          const { error: updateError } = await supabase.auth.updateUser({ password });
          if (updateError) throw updateError;
          onComplete();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update your password.'); }
        finally { setSaving(false); }
      }}>
        <img src="/PlacePMS-Logo-Vector.svg" alt="PlacePMS" width="120" />
        <h1>Choose a new password</h1>
        <p>Update the password for your PlacePMS account.</p>
        {error && <div role="alert" className="auth-feedback auth-feedback-error">{error}</div>}
        <label>New password<input type="password" minLength={6} required autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>Confirm password<input type="password" minLength={6} required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <button className="dash-button dash-button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save password & open workspace'}</button>
      </form>
    </div>
  );
}
