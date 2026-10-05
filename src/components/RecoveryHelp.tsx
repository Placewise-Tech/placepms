import { useState } from 'react';
import { requestPasswordReset } from '../lib/password-reset';
import { Mail } from 'lucide-react';

export default function RecoveryHelp({ message, onBack, signedIn }: { message: string; onBack: () => void; signedIn: boolean }) {
  const [email, setEmail] = useState(''); const [sending, setSending] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  return <div className="workspace-gate auth-recovery"><form className="workspace-gate-card dash-form" onSubmit={async event => {
    event.preventDefault(); setSending(true); setError(''); setNotice('');
    try { await requestPasswordReset(email); setNotice('If an account exists for this email, a new reset link has been sent. Open the latest email to choose your password.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send the reset email. Please try again.'); }
    finally { setSending(false); }
  }}><img src="/PlacePMS-Logo-White.svg" alt="PlacePMS" width="120" /><span className="auth-recovery-icon"><Mail size={27} /></span><h1>Password reset link unavailable</h1><p role="alert">{message}</p>
    {error && <div className="auth-feedback auth-feedback-error" role="alert">{error}</div>}{notice && <div className="auth-feedback" role="status">{notice}</div>}
    <label>Email address<input type="email" required autoComplete="email" maxLength={254} value={email} disabled={sending} onChange={event => setEmail(event.target.value)} /></label>
    <button className="dash-button dash-button-primary" disabled={sending}>{sending ? 'Sending…' : 'Send a new reset link'}</button><button type="button" className="dash-button" disabled={sending} onClick={onBack}>{signedIn ? 'Return to workspace' : 'Back to sign in'}</button>
  </form></div>;
}
