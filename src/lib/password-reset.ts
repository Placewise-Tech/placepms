import { configurationError, supabase } from './supabase';

export async function requestPasswordReset(email: string) {
  if (!supabase) throw new Error(configurationError);
  const address = email.trim();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address) || address.length > 254) throw new Error('Enter a valid email address to receive a reset link.');
  // Keep the whitelisted /login callback. Verified recovery sessions are routed
  // internally to /reset-password, without requiring a new Supabase redirect URL.
  const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/login` });
  if (error) throw error;
}
