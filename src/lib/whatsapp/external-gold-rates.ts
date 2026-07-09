import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface GoldRateRow {
  purity_label: string
  price: string | number
  unit: string
  created_at: string
}

export interface LatestGoldRates {
  rate22k: GoldRateRow | null
  rate24k: GoldRateRow | null
}

let goldRatesClient: SupabaseClient | null = null

function goldRatesSupabaseAdmin(): SupabaseClient {
  const url = process.env.GOLD_RATES_SUPABASE_URL?.trim()
  const key = process.env.GOLD_RATES_SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url) {
    throw new Error(
      'GOLD_RATES_SUPABASE_URL is not set on the server. ' +
        'Add it in Amplify → Environment variables (exact name), then redeploy.',
    )
  }

  if (!key) {
    throw new Error(
      'GOLD_RATES_SUPABASE_SERVICE_ROLE_KEY is not set on the server. ' +
        'Add it in Amplify → Environment variables (exact name), then redeploy.',
    )
  }

  if (!goldRatesClient) {
    goldRatesClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return goldRatesClient
}

export async function getLatestGoldRates(): Promise<LatestGoldRates> {
  const client = goldRatesSupabaseAdmin()

  const { data, error } = await client
    .schema('prod')
    .from('store_metal_prices')
    .select('purity_label, price, unit, created_at')
    .eq('metal', 'gold')
    .in('purity_label', ['22K', '24K'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new Error(`Failed to load external gold rates: ${error.message}`)
  }

  const latestTimestamp = data?.[0]?.created_at ?? null
  const latestRows = latestTimestamp
    ? data.filter((row) => row.created_at === latestTimestamp)
    : []

  return {
    rate22k: latestRows.find((row) => row.purity_label === '22K') ?? null,
    rate24k: latestRows.find((row) => row.purity_label === '24K') ?? null,
  }
}
