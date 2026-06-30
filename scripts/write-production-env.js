#!/usr/bin/env node
/**
 * Amplify (and some other hosts) expose NEXT_PUBLIC_* at build time but
 * omit server-only vars from the Next.js SSR runtime. Writing them into
 * .env.production during `amplify.yml` build makes them available to
 * API routes (whatsapp config, webhook, etc.).
 *
 * Safe to run locally — appends only when vars are set in the environment.
 */
const fs = require('fs')
const path = require('path')

const SERVER_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'META_APP_SECRET',
]

const missing = SERVER_VARS.filter((name) => !process.env[name]?.trim())
if (missing.length > 0) {
  console.error(
    '[write-production-env] Missing required server env vars:',
    missing.join(', '),
  )
  console.error(
    'Set them in Amplify → Hosting → Environment variables, then redeploy.',
  )
  process.exit(1)
}

const envPath = path.join(process.cwd(), '.env.production')
const lines = SERVER_VARS.map((name) => `${name}=${process.env[name].trim()}`)
fs.appendFileSync(envPath, `\n# amplify build — server-only secrets\n${lines.join('\n')}\n`)
console.log('[write-production-env] Wrote server env vars to .env.production')
