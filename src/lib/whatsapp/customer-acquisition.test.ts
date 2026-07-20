import { describe, expect, it } from 'vitest'
import { parseCustomerAcquisitionFromInbound } from './customer-acquisition'

describe('parseCustomerAcquisitionFromInbound', () => {
  it('maps Meta CTWA referral to paid social acquisition', () => {
    expect(
      parseCustomerAcquisitionFromInbound({
        inboundText: 'Can I get more info?',
        isFirstInboundMessage: true,
        referral: {
          source_type: 'ad',
          source_url: 'https://fb.me/abc123',
          source_id: '120226305854810726',
          headline: 'Chat with us',
          body: 'Summer Succulents are here!',
          ctwa_clid: 'Aff-n8ZTODiE79d22KtAwQKj9',
        },
      }),
    ).toEqual({
      source: 'facebook',
      medium: 'paid_social',
      campaign: 'Chat with us',
      content: 'Summer Succulents are here!',
      source_detail: 'click_to_whatsapp_ad',
      referrer: 'https://fb.me/abc123',
      click_id: 'Aff-n8ZTODiE79d22KtAwQKj9',
      landing_page: undefined,
    })
  })

  it('maps website collection enquiry pre-fill', () => {
    expect(
      parseCustomerAcquisitionFromInbound({
        inboundText:
          'Hi! I would like to enquire about your jewellery collection.',
        isFirstInboundMessage: true,
      }),
    ).toMatchObject({
      source: 'pradeep_jewellers_website',
      medium: 'direct',
      source_detail: 'collection_whatsapp_button',
      tracking_code: 'PJ_COLLECTION',
    })
  })

  it('maps Suvarna Vriddhi website enquiry', () => {
    expect(
      parseCustomerAcquisitionFromInbound({
        inboundText:
          'Hi! I would like to know more about the Suvarna Vriddhi gold savings scheme.',
        isFirstInboundMessage: true,
      }),
    ).toMatchObject({
      tracking_code: 'PJ_SUVARNA_VRIDDHI',
      source_detail: 'suvarna_vriddhi_whatsapp_button',
    })
  })

  it('maps metal rates website enquiry', () => {
    expect(
      parseCustomerAcquisitionFromInbound({
        inboundText: "Hi! Please share today's metal rates.",
        isFirstInboundMessage: true,
      }),
    ).toMatchObject({
      tracking_code: 'PJ_METAL_RATES',
      source_detail: 'metal_rates_whatsapp_button',
    })
  })

  it('records direct WhatsApp on first inbound only', () => {
    expect(
      parseCustomerAcquisitionFromInbound({
        inboundText: 'Hello, is anyone there?',
        isFirstInboundMessage: true,
      }),
    ).toEqual({
      source: 'whatsapp',
      medium: 'direct',
      source_detail: 'direct_message',
    })

    expect(
      parseCustomerAcquisitionFromInbound({
        inboundText: 'Hello again',
        isFirstInboundMessage: false,
      }),
    ).toBeNull()
  })

  it('returns null for follow-up messages without attribution', () => {
    expect(
      parseCustomerAcquisitionFromInbound({
        inboundText: 'Thanks',
        isFirstInboundMessage: false,
      }),
    ).toBeNull()
  })
})
