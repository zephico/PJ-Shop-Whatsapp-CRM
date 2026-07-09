import { NextResponse } from 'next/server'
import { getTelegramConfig } from '@/lib/telegram/config'
import { getLatestGoldRates } from '@/lib/whatsapp/external-gold-rates'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params
  const config = getTelegramConfig()

  if (!config.webhookSecret || secret !== config.webhookSecret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const connectionString = process.env.GOLD_RATES_DATABASE_URL?.trim()
  if (!connectionString) {
    return NextResponse.json(
      {
        error: 'GOLD_RATES_DATABASE_URL is not configured',
        hasGoldRatesDatabaseUrl: false,
      },
      { status: 503 },
    )
  }

  try {
    const rates = await getLatestGoldRates()
    return NextResponse.json({
      ok: true,
      hasGoldRatesDatabaseUrl: true,
      rate22k: rates.rate22k,
      rate24k: rates.rate24k,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load gold rates',
        hasGoldRatesDatabaseUrl: true,
      },
      { status: 502 },
    )
  }
}
