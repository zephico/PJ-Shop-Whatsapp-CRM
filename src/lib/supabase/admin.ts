import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _adminClient: SupabaseClient | null = null

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `${name} is not set on the server. ` +
        'Add it in Amplify → Environment variables (exact name), then redeploy.',
    )
  }
  return value
}

/** Service-role Supabase client — bypasses RLS. Server-only. */
export function supabaseAdmin(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!_adminClient) {
    _adminClient = createClient(url, key)
  }
  return _adminClient
}
