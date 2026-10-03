import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// Only public settings reach the browser. Also accepts the labelled keys in
// the original .env file; private keys are never used by the application.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const envPath = resolve(process.cwd(), '.env')
  const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  // Publishable configuration is intentionally public so Git-based Vercel
  // builds work without uploading the private .env file.
  const publicConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'supabase.public.json'), 'utf8'))
  const tokens = original.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []
  let projectRef = ''
  let anonKey = ''
  for (const token of tokens) {
    try {
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      if (claims.role === 'anon') {
        anonKey = token
        projectRef = typeof claims.ref === 'string' ? claims.ref : ''
      }
    } catch { /* Invalid pasted tokens are not used. */ }
  }
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL ||
    (projectRef ? `https://${projectRef}.supabase.co` : publicConfig.url)
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY ||
    original.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0] || anonKey || publicConfig.publishableKey

  let privateKey = key.startsWith('sb_secret_')
  try { privateKey ||= JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role === 'service_role' }
  catch { /* Publishable keys are not JWTs. */ }
  if (privateKey) throw new Error('Use a publishable or anon Supabase key for the frontend, never a server key.')

  // Catch accidentally public server credentials before Vite bundles them.
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue
    let privileged = value.startsWith('sb_secret_')
    try {
      privileged ||= JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString()).role === 'service_role'
    } catch { /* Not a JWT. */ }
    if (privileged || /SERVICE_ROLE|SECRET/i.test(name)) {
      throw new Error(`Remove the VITE_ prefix from the private environment variable ${name}.`)
    }
  }
  return {
    plugins: [react()],
    server: { watch: { usePolling: true, interval: 500 } },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key),
    },
  }
})
