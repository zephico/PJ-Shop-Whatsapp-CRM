import type { SupabaseClient } from '@supabase/supabase-js'
import {
  detectWebsiteEnquiryIntent,
  getWebsiteEnquiryAcquisition,
} from '@/lib/whatsapp/website-enquiry'

/** Meta referral object on the first inbound message after a CTWA ad click. */
export interface WhatsAppMessageReferral {
  source_url?: string
  source_id?: string
  source_type?: string
  headline?: string
  body?: string
  media_type?: string
  image_url?: string
  thumbnail_url?: string
  video_url?: string
  ctwa_clid?: string
  welcome_message?: { text?: string }
}

export type AcquisitionMedium =
  | 'organic_social'
  | 'paid_social'
  | 'organic_search'
  | 'paid_search'
  | 'direct'
  | 'referral'
  | 'offline'
  | 'email'
  | 'sms'
  | 'unknown'

export type AcquisitionTouchType =
  | 'first_touch'
  | 'last_touch'
  | 'repeat_touch'
  | 'conversion_touch'

export interface ParsedCustomerAcquisition {
  source: string
  medium: AcquisitionMedium
  campaign?: string
  content?: string
  term?: string
  source_detail?: string
  landing_page?: string
  referrer?: string
  tracking_code?: string
  click_id?: string
}

function parseUtmFromText(text: string): Partial<ParsedCustomerAcquisition> {
  const out: Partial<ParsedCustomerAcquisition> = {}
  const utmSource = text.match(/(?:^|[?&\s])utm_source=([^\s&]+)/i)?.[1]
  const utmMedium = text.match(/(?:^|[?&\s])utm_medium=([^\s&]+)/i)?.[1]
  const utmCampaign = text.match(/(?:^|[?&\s])utm_campaign=([^\s&]+)/i)?.[1]
  const utmContent = text.match(/(?:^|[?&\s])utm_content=([^\s&]+)/i)?.[1]
  const utmTerm = text.match(/(?:^|[?&\s])utm_term=([^\s&]+)/i)?.[1]

  if (utmSource) out.source = decodeURIComponent(utmSource.replace(/\+/g, ' '))
  if (utmCampaign) out.campaign = decodeURIComponent(utmCampaign.replace(/\+/g, ' '))
  if (utmContent) out.content = decodeURIComponent(utmContent.replace(/\+/g, ' '))
  if (utmTerm) out.term = decodeURIComponent(utmTerm.replace(/\+/g, ' '))
  if (utmMedium) {
    const normalized = decodeURIComponent(utmMedium.replace(/\+/g, ' ')).toLowerCase()
    out.medium = mapUtmMedium(normalized)
  }

  const urlMatch = text.match(/https?:\/\/[^\s]+/i)
  if (urlMatch?.[0]) out.landing_page = urlMatch[0]

  return out
}

function mapUtmMedium(raw: string): AcquisitionMedium {
  switch (raw) {
    case 'organic_social':
    case 'social':
      return 'organic_social'
    case 'paid_social':
    case 'cpc_social':
      return 'paid_social'
    case 'organic_search':
    case 'organic':
      return 'organic_search'
    case 'paid_search':
    case 'cpc':
      return 'paid_search'
    case 'referral':
      return 'referral'
    case 'email':
      return 'email'
    case 'sms':
      return 'sms'
    case 'offline':
      return 'offline'
    case 'direct':
      return 'direct'
    default:
      return 'unknown'
  }
}

function mapReferralSourceType(sourceType: string | undefined): AcquisitionMedium {
  switch ((sourceType ?? '').toLowerCase()) {
    case 'ad':
      return 'paid_social'
    case 'post':
      return 'organic_social'
    default:
      return 'unknown'
  }
}

function inferReferralSource(referral: WhatsAppMessageReferral): string {
  const url = (referral.source_url ?? '').toLowerCase()
  if (url.includes('instagram')) return 'instagram'
  if (url.includes('facebook') || url.includes('fb.me')) return 'facebook'
  return 'meta_ads'
}

/** Parse acquisition fields from Meta referral, website pre-fill, or UTM text. */
export function parseCustomerAcquisitionFromInbound(args: {
  inboundText: string | null | undefined
  referral?: WhatsAppMessageReferral | null
  isFirstInboundMessage: boolean
}): ParsedCustomerAcquisition | null {
  if (args.referral) {
    const medium = mapReferralSourceType(args.referral.source_type)
    return {
      source: inferReferralSource(args.referral),
      medium,
      campaign: args.referral.headline ?? args.referral.source_id ?? undefined,
      content: args.referral.body ?? args.referral.media_type ?? undefined,
      source_detail:
        args.referral.source_type === 'ad'
          ? 'click_to_whatsapp_ad'
          : args.referral.source_type === 'post'
            ? 'organic_social_post'
            : 'meta_referral',
      referrer: args.referral.source_url,
      click_id: args.referral.ctwa_clid,
      landing_page: args.referral.image_url ?? args.referral.video_url ?? undefined,
    }
  }

  const inboundText = args.inboundText?.trim()
  if (!inboundText) {
    if (args.isFirstInboundMessage) {
      return {
        source: 'whatsapp',
        medium: 'direct',
        source_detail: 'direct_message',
      }
    }
    return null
  }

  const websiteEnquiry = detectWebsiteEnquiryIntent(inboundText)
  if (websiteEnquiry) {
    return getWebsiteEnquiryAcquisition(websiteEnquiry, inboundText)
  }

  const utm = parseUtmFromText(inboundText)
  if (utm.source && utm.medium) {
    return {
      source: utm.source,
      medium: utm.medium,
      campaign: utm.campaign,
      content: utm.content,
      term: utm.term,
      landing_page: utm.landing_page,
      source_detail: 'utm_link',
    }
  }

  if (args.isFirstInboundMessage) {
    return {
      source: 'whatsapp',
      medium: 'direct',
      source_detail: 'direct_message',
    }
  }

  return null
}

export async function captureCustomerAcquisitionFromInbound(args: {
  supabase: SupabaseClient
  accountId: string
  customerId: string
  whatsappMessageId: string
  capturedAt: string
  inboundText: string | null | undefined
  referral?: WhatsAppMessageReferral | null
  isFirstInboundMessage: boolean
}): Promise<{ inserted: boolean; acquisitionId?: string }> {
  const parsed = parseCustomerAcquisitionFromInbound({
    inboundText: args.inboundText,
    referral: args.referral,
    isFirstInboundMessage: args.isFirstInboundMessage,
  })
  if (!parsed) return { inserted: false }

  const { data: existingFirstTouch } = await args.supabase
    .from('customer_acquisition')
    .select('id')
    .eq('customer_id', args.customerId)
    .eq('is_first_touch', true)
    .maybeSingle()

  const isFirstTouch = !existingFirstTouch
  const touchType: AcquisitionTouchType = isFirstTouch ? 'first_touch' : 'last_touch'

  if (!isFirstTouch) {
    const { error: clearLastTouchError } = await args.supabase
      .from('customer_acquisition')
      .update({ is_last_touch: false })
      .eq('customer_id', args.customerId)
      .eq('is_last_touch', true)

    if (clearLastTouchError) {
      throw new Error(
        `Failed to clear previous last-touch acquisition: ${clearLastTouchError.message}`,
      )
    }
  }

  const { data: inserted, error: insertError } = await args.supabase
    .from('customer_acquisition')
    .insert({
      account_id: args.accountId,
      customer_id: args.customerId,
      source: parsed.source,
      medium: parsed.medium,
      campaign: parsed.campaign ?? null,
      content: parsed.content ?? null,
      term: parsed.term ?? null,
      source_detail: parsed.source_detail ?? null,
      landing_page: parsed.landing_page ?? null,
      referrer: parsed.referrer ?? null,
      tracking_code: parsed.tracking_code ?? null,
      click_id: parsed.click_id ?? null,
      first_message_id: args.whatsappMessageId,
      touch_type: touchType,
      is_first_touch: isFirstTouch,
      is_last_touch: true,
      captured_at: args.capturedAt,
    })
    .select('id')
    .single()

  if (insertError) {
    // Duplicate webhook delivery for the same wamid — safe to ignore.
    if (insertError.code === '23505') {
      return { inserted: false }
    }
    throw new Error(`Failed to insert customer acquisition: ${insertError.message}`)
  }

  return { inserted: true, acquisitionId: inserted.id }
}
