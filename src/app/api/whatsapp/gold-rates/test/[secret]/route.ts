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

  const supabaseUrl = process.env.GOLD_RATES_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.GOLD_RATES_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error: 'Gold rates Supabase integration is not configured',
        hasGoldRatesSupabaseUrl: Boolean(supabaseUrl),
        hasGoldRatesSupabaseServiceRoleKey: Boolean(serviceRoleKey),
      },
      { status: 503 },
    )
  }

  try {
    const rates = await getLatestGoldRates()
    return NextResponse.json({
      ok: true,
      hasGoldRatesSupabaseUrl: true,
      hasGoldRatesSupabaseServiceRoleKey: true,
      rate22k: rates.rate22k,
      rateSilver: rates.rateSilver,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
        error instanceof Error
          ? error.message
          : 'Failed to load gold rates',
        hasGoldRatesSupabaseUrl: true,
        hasGoldRatesSupabaseServiceRoleKey: true,
      },
      { status: 502 },
    )
  }
}
