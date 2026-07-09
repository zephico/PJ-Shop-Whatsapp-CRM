import { Pool } from 'pg'

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

let pool: Pool | null = null

function getPool(): Pool {
  const connectionString = process.env.GOLD_RATES_DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('GOLD_RATES_DATABASE_URL is not configured')
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 2,
    })
  }

  return pool
}

export async function getLatestGoldRates(): Promise<LatestGoldRates> {
  const db = getPool()
  const { rows } = await db.query<GoldRateRow>(
    `
      with latest_ts as (
        select max(created_at) as created_at
        from dev.store_metal_prices
        where metal = 'gold'
          and purity_label in ('22K', '24K')
      )
      select purity_label, price, unit, created_at
      from dev.store_metal_prices
      where metal = 'gold'
        and purity_label in ('22K', '24K')
        and created_at = (select created_at from latest_ts)
      order by purity_label;
    `
  )

  return {
    rate22k: rows.find((row) => row.purity_label === '22K') ?? null,
    rate24k: rows.find((row) => row.purity_label === '24K') ?? null,
  }
}
