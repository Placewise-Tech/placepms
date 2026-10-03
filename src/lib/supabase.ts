import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: {
      getItem: name => sessionStorage.getItem(name) ?? localStorage.getItem(name),
      setItem: (name, value) => {
        const sessionOnly = sessionStorage.getItem('placepms:session-only') === 'true';
        (sessionOnly ? localStorage : sessionStorage).removeItem(name);
        (sessionOnly ? sessionStorage : localStorage).setItem(name, value);
      },
      removeItem: name => { sessionStorage.removeItem(name); localStorage.removeItem(name); },
    },
  },
}) : null;

export function setSessionPersistence(remember: boolean) {
  sessionStorage.setItem('placepms:session-only', String(!remember));
}

export const configurationError = 'Add your Supabase project URL and publishable key to .env, then restart the development server.';
