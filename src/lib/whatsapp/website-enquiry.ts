import {
  engineSendInteractiveButtons,
  engineSendInteractiveCtaUrl,
  engineSendText,
} from '@/lib/flows/meta-send'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ParsedCustomerAcquisition } from '@/lib/whatsapp/customer-acquisition'

export type WebsiteEnquiryId =
  | 'collection'
  | 'rings'
  | 'earrings'
  | 'necklaces'
  | 'custom'
  | 'metal_rates'
  | 'suvarna_vriddhi'

export interface WebsiteEnquiryDefinition {
  id: WebsiteEnquiryId
  matches: (normalized: string) => boolean
  collectionUrl?: string
  ctaLabel?: string
  welcomeBody: string
  acquisition: ParsedCustomerAcquisition
}

export const SUVARNA_SCHEME_URL = 'https://pradeepjewellers.in/scheme'

export const WEBSITE_ENQUIRIES: WebsiteEnquiryDefinition[] = [
  {
    id: 'collection',
    matches: (t) =>
      t.includes('enquire about your jewellery collection') ||
      t.includes('inquire about your jewellery collection'),
    collectionUrl: 'https://pradeepjewellers.in/products/',
    ctaLabel: 'Browse Collections',
    welcomeBody:
      '🙏 Welcome to Pradeep Jewellers!\n\nExplore our full collection of gold, diamond & silver jewellery crafted since 1983.',
    acquisition: {
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'collection_whatsapp_button',
      tracking_code: 'PJ_COLLECTION',
      landing_page: 'https://pradeepjewellers.in/products/',
    },
  },
  {
    id: 'rings',
    matches: (t) =>
      t.includes('gold') && t.includes('diamond') && t.includes('ring'),
    collectionUrl:
      'https://pradeepjewellers.in/products?category=ring&material=diamond',
    ctaLabel: 'View Ring Collection',
    welcomeBody:
      '🙏 Welcome to Pradeep Jewellers!\n\nDiscover our gold & diamond rings — modern, lightweight, and traditional designs.',
    acquisition: {
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'rings_whatsapp_button',
      tracking_code: 'PJ_RINGS',
      landing_page:
        'https://pradeepjewellers.in/products?category=ring&material=diamond',
    },
  },
  {
    id: 'earrings',
    matches: (t) =>
      (t.includes('earring') || t.includes('jhumka')) &&
      (t.includes('pricing') || t.includes('share options')),
    collectionUrl: 'https://pradeepjewellers.in/products?category=earring',
    ctaLabel: 'View Earrings',
    welcomeBody:
      '🙏 Welcome to Pradeep Jewellers!\n\nBrowse earrings & jhumkas with transparent pricing. Tap below to explore the collection.',
    acquisition: {
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'earrings_whatsapp_button',
      tracking_code: 'PJ_EARRINGS',
      landing_page: 'https://pradeepjewellers.in/products?category=earring',
    },
  },
  {
    id: 'necklaces',
    matches: (t) =>
      t.includes('necklace') &&
      (t.includes('explore') || t.includes('necklace set')),
    collectionUrl:
      'https://pradeepjewellers.in/products?category=necklace-set&q=Necklaces',
    ctaLabel: 'Necklaces & Sets',
    welcomeBody:
      '🙏 Welcome to Pradeep Jewellers!\n\nExplore necklaces & necklace sets — crafted in hallmarked gold with transparent making charges.',
    acquisition: {
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'necklaces_whatsapp_button',
      tracking_code: 'PJ_NECKLACES',
      landing_page:
        'https://pradeepjewellers.in/products?category=necklace-set&q=Necklaces',
    },
  },
  {
    id: 'custom',
    matches: (t) =>
      t.includes('custom jewellery') ||
      (t.includes('custom') && t.includes('design') && t.includes('quote')),
    welcomeBody:
      '🙏 Welcome to Pradeep Jewellers!\n\nWe would love to help with your custom design. Tap below to share your requirements and get a quote.',
    acquisition: {
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'custom_jewellery_whatsapp_button',
      tracking_code: 'PJ_CUSTOM',
    },
  },
  {
    id: 'metal_rates',
    matches: (t) => t.includes('metal rate') || t.includes("today's metal rates"),
    welcomeBody:
      '🙏 Welcome to Pradeep Jewellers!\n\nTap below for today\'s gold & silver rates.',
    acquisition: {
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'metal_rates_whatsapp_button',
      tracking_code: 'PJ_METAL_RATES',
    },
  },
  {
    id: 'suvarna_vriddhi',
    matches: (t) =>
      t.includes('suvarna vriddhi') ||
      (t.includes('gold savings scheme') && t.includes('suvarna')),
    welcomeBody: buildSuvarnaVriddhiMessage(),
    acquisition: {
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'suvarna_vriddhi_whatsapp_button',
      tracking_code: 'PJ_SUVARNA_VRIDDHI',
      landing_page: SUVARNA_SCHEME_URL,
    },
  },
]

function normalizeInboundText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildSuvarnaVriddhiMessage(): string {
  return (
    '🙏 Welcome to Pradeep Jewellers!\n\n' +
    'Suvarna Vriddhi is our gold savings scheme — save monthly and get bonus months at completion.\n\n' +
    '📌 Minimum: ₹2,000/month\n\n' +
    '✨ Shubharambh Yojana (11+1)\n' +
    'Pay 11 months → get 1 month bonus\n' +
    'Example: ₹2,000/mo → ₹24,000 total\n\n' +
    '✨ Samruddhi Yojana (18+2)\n' +
    'Pay 18 months → get 2 months bonus\n' +
    'Example: ₹2,000/mo → ₹40,000 total\n\n' +
    '✨ Vishwas Yojana (24+3)\n' +
    'Pay 24 months → get 3 months bonus\n' +
    'Example: ₹2,000/mo → ₹54,000 total\n\n' +
    `🔗 Calculate your return: ${SUVARNA_SCHEME_URL}\n\n` +
    'Would you like to enroll or speak with our team?'
  )
}

export function detectWebsiteEnquiryIntent(
  text: string | null | undefined,
): WebsiteEnquiryDefinition | null {
  const inbound = text?.trim()
  if (!inbound) return null
  const normalized = normalizeInboundText(inbound)
  return WEBSITE_ENQUIRIES.find((entry) => entry.matches(normalized)) ?? null
}

export function getWebsiteEnquiryAcquisition(
  enquiry: WebsiteEnquiryDefinition,
  inboundText?: string,
): ParsedCustomerAcquisition {
  const acquisition = { ...enquiry.acquisition }
  if (inboundText) {
    const urlMatch = inboundText.match(/https?:\/\/[^\s]+/i)
    if (urlMatch?.[0]) acquisition.landing_page = urlMatch[0]
  }
  return acquisition
}

async function ensureEnglishPreference(contactId: string, accountId: string) {
  const { error } = await supabaseAdmin()
    .from('contacts')
    .update({
      preferred_language: 'en',
      conversation_state: 'FLOW_COMPLETED',
    })
    .eq('id', contactId)
    .eq('account_id', accountId)
    .is('preferred_language', null)

  if (error) {
    throw new Error(`Failed to set website enquiry language: ${error.message}`)
  }
}

export async function handleWebsiteEnquiryFromInbound(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  inboundText: string
}): Promise<boolean> {
  const enquiry = detectWebsiteEnquiryIntent(args.inboundText)
  if (!enquiry) return false

  await ensureEnglishPreference(args.contactId, args.accountId)

  const sendBase = {
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
  }

  switch (enquiry.id) {
    case 'collection':
    case 'rings':
    case 'earrings':
    case 'necklaces':
      await engineSendInteractiveCtaUrl({
        ...sendBase,
        bodyText: enquiry.welcomeBody,
        displayText: enquiry.ctaLabel!,
        url: enquiry.collectionUrl!,
      })
      return true

    case 'custom':
      await engineSendInteractiveButtons({
        ...sendBase,
        bodyText: enquiry.welcomeBody,
        buttons: [{ id: 'MENU_CUSTOM_JEWELLERY', title: 'Custom Jewellery' }],
      })
      return true

    case 'metal_rates':
      await engineSendInteractiveButtons({
        ...sendBase,
        bodyText: enquiry.welcomeBody,
        buttons: [{ id: 'MENU_GOLD_RATE', title: "Today's Rates" }],
      })
      return true

    case 'suvarna_vriddhi':
      await engineSendText({
        ...sendBase,
        text: enquiry.welcomeBody,
      })
      await engineSendInteractiveButtons({
        ...sendBase,
        bodyText: 'How would you like to proceed?',
        buttons: [
          { id: 'MENU_TALK_TO_EXECUTIVE', title: 'Talk to Executive' },
          { id: 'POST_BROWSE_MAIN_MENU', title: 'Main Menu' },
        ],
      })
      return true
  }
}
