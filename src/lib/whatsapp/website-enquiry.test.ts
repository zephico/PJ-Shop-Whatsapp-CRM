import { describe, expect, it } from 'vitest'
import {
  detectWebsiteEnquiryIntent,
  SUVARNA_SCHEME_URL,
  WEBSITE_ENQUIRIES,
} from './website-enquiry'
import { parseCustomerAcquisitionFromInbound } from './customer-acquisition'

const ENQUIRY_MESSAGES = [
  {
    text: 'Hi! I would like to enquire about your jewellery collection.',
    id: 'collection',
    url: 'https://pradeepjewellers.in/products/',
    tracking: 'PJ_COLLECTION',
  },
  {
    text: 'Hi! I would like to know about your gold & diamond rings.',
    id: 'rings',
    url: 'https://pradeepjewellers.in/products?category=ring&material=diamond',
    tracking: 'PJ_RINGS',
  },
  {
    text: 'Hi! I am interested in earrings and jhumkas. Please share options and pricing.',
    id: 'earrings',
    url: 'https://pradeepjewellers.in/products?category=earring',
    tracking: 'PJ_EARRINGS',
  },
  {
    text: 'Hi! I would like to explore necklaces and necklace sets.',
    id: 'necklaces',
    url: 'https://pradeepjewellers.in/products?category=necklace-set&q=Necklaces',
    tracking: 'PJ_NECKLACES',
  },
  {
    text: 'Hi! I have a custom jewellery design in mind. Can you help with a quote?',
    id: 'custom',
    tracking: 'PJ_CUSTOM',
  },
  {
    text: "Hi! Please share today's metal rates.",
    id: 'metal_rates',
    tracking: 'PJ_METAL_RATES',
  },
  {
    text: 'Hi! I would like to know more about the Suvarna Vriddhi gold savings scheme.',
    id: 'suvarna_vriddhi',
    url: SUVARNA_SCHEME_URL,
    tracking: 'PJ_SUVARNA_VRIDDHI',
  },
] as const

describe('detectWebsiteEnquiryIntent', () => {
  it.each(ENQUIRY_MESSAGES)('detects $id enquiry', ({ text, id }) => {
    expect(detectWebsiteEnquiryIntent(text)?.id).toBe(id)
  })

  it('returns null for unrelated text', () => {
    expect(detectWebsiteEnquiryIntent('Hello there')).toBeNull()
  })
})

describe('website enquiry acquisition mapping', () => {
  it.each(ENQUIRY_MESSAGES)(
    'maps $id to pradeep_jewellers_website acquisition',
    ({ text, tracking, url }) => {
      const parsed = parseCustomerAcquisitionFromInbound({
        inboundText: text,
        isFirstInboundMessage: true,
      })
      expect(parsed).toMatchObject({
        source: 'pradeep_jewellers_website',
        medium: 'direct',
        tracking_code: tracking,
      })
      if (url) {
        expect(parsed?.landing_page).toBe(url)
      }
    },
  )
})

describe('website enquiry catalog', () => {
  it('covers all seven enquiry types', () => {
    expect(WEBSITE_ENQUIRIES).toHaveLength(7)
  })

  it('uses Meta-safe CTA labels (≤ 20 chars)', () => {
    for (const entry of WEBSITE_ENQUIRIES) {
      if (entry.ctaLabel) {
        expect(entry.ctaLabel.length).toBeLessThanOrEqual(20)
      }
    }
  })
})
