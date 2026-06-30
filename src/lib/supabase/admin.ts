import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _adminClient: SupabaseClient | null = null

/** Service-role Supabase client — bypasses RLS. Server-only. */
export function supabaseAdmin(): SupabaseClient {
  // Static property access so Next.js inlines these at build time from
  // .env.production (Amplify does not pass env vars at SSR runtime).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set on the server. ' +
        'Add it in Amplify → Environment variables (exact name), then redeploy.',
    )
  }
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set on the server. ' +
        'Add it in Amplify → Environment variables (exact name), then redeploy.',
    )
  }

  if (!_adminClient) {
    _adminClient = createClient(url, key)
  }
  return _adminClient
}
