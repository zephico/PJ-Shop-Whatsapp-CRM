#!/usr/bin/env node
/**
 * Amplify SSR often does not pass env vars to the Next.js runtime.
 * Next.js only inlines `process.env.VAR` when accessed statically
 * (not process.env[name]). Writing vars into `.env.production` before
 * `next build` bakes them into server bundles.
 */
const fs = require('fs')
const path = require('path')

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'META_APP_SECRET',
]

const missing = REQUIRED_VARS.filter((name) => !process.env[name]?.trim())
if (missing.length > 0) {
  console.error(
    '[write-production-env] Missing required env vars:',
    missing.join(', '),
  )
  console.error(
    'Set them in Amplify → Hosting → Environment variables, then redeploy.',
  )
  process.exit(1)
}

const envPath = path.join(process.cwd(), '.env.production')
const lines = REQUIRED_VARS.map((name) => `${name}=${process.env[name].trim()}`)
fs.writeFileSync(
  envPath,
  `# generated at amplify build — do not commit\n${lines.join('\n')}\n`,
)
console.log(
  '[write-production-env] Wrote',
  REQUIRED_VARS.length,
  'vars to .env.production',
)
