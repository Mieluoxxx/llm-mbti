import { createClient } from '@supabase/supabase-js'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }

/** Read-only access to the public_* views. */
export function publicClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_PUBLISHABLE_KEY'), options)
}

/** Bypasses RLS. Only for route handlers; never import from client components. */
export function serverClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), options)
}
