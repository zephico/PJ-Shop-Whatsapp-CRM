import { supabaseAdmin } from '@/lib/supabase/admin'
import { engineSendInteractiveButtons, engineSendInteractiveList, engineSendText } from '@/lib/flows/meta-send'
import { getLatestGoldRates } from '@/lib/whatsapp/external-gold-rates'

type PreferredLanguage = 'en' | 'hi' | 'gu'
type ConversationState = 'AWAITING_LANGUAGE_SELECTION' | 'MAIN_MENU'
const BROWSE_JEWELLERY_URL = 'https://pradeepjewellers.in/products'
type CustomRequestStatus =
  | 'awaiting_category'
  | 'awaiting_image'
  | 'awaiting_budget'
  | 'pending_review'
  | 'confirmed'
  | 'closed'

const LANGUAGE_BUTTON_IDS = ['LANG_EN', 'LANG_HI', 'LANG_GU'] as const
const MAIN_MENU_BUTTON_IDS = [
  'MENU_BROWSE_JEWELLERY',
  'MENU_CUSTOM_JEWELLERY',
  'MENU_GOLD_RATE',
  'MENU_TALK_TO_EXECUTIVE',
] as const

interface CustomJewelleryRequestRow {
  id: string
  account_id: string
  contact_id: string
  conversation_id: string
  status: CustomRequestStatus
  category: string | null
  reference_image_url: string | null
  budget_text: string | null
}

interface Phase1ContactRow {
  id: string
  account_id: string
  name: string | null
  preferred_language: PreferredLanguage | null
  conversation_state: ConversationState | null
}

interface HandlePhase1AutoReplyArgs {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  contactName: string | null
  inboundText: string | null
  interactiveReplyId: string | null
  inboundContentType: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'template' | 'interactive'
  inboundMediaUrl: string | null
  inboundStoredMediaUrl: string | null
  inboundMediaMimeType: string | null
}

const isDev = process.env.NODE_ENV !== 'production'

function logDev(message: string, data: Record<string, unknown>) {
  if (isDev) console.info(message, data)
}

function normalizeLanguage(value: string | null | undefined): PreferredLanguage | null {
  if (value === 'en' || value === 'hi' || value === 'gu') return value
  return null
}

function fallbackName(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return 'मित्र'
    case 'gu':
      return 'મિત્ર'
    default:
      return 'there'
  }
}

function resolveDisplayName(contactName: string | null, language: PreferredLanguage): string {
  const trimmed = contactName?.trim()
  return trimmed || fallbackName(language)
}

function languageSelectionBody(contactName: string | null): string {
  const displayName = resolveDisplayName(contactName, 'en')
  return `🙏 Welcome to Pradeep Jewellers, ${displayName}!\n\nWe are happy to assist you.\n\nPlease choose your preferred language:`
}

function mainMenuCopy(language: PreferredLanguage) {
  switch (language) {
    case 'hi':
      return {
        body: 'हम आपकी कैसे मदद कर सकते हैं?',
        rows: [
          { id: 'MENU_BROWSE_JEWELLERY', title: 'Jewellery देखें' },
          { id: 'MENU_CUSTOM_JEWELLERY', title: 'Custom बनवाना है' },
          { id: 'MENU_GOLD_RATE', title: 'Gold Rate' },
          { id: 'MENU_TALK_TO_EXECUTIVE', title: 'Executive से बात' },
        ],
      }
    case 'gu':
      return {
        body: 'અમે તમારી કેવી રીતે મદદ કરી શકીએ?',
        rows: [
          { id: 'MENU_BROWSE_JEWELLERY', title: 'Jewellery જુઓ' },
          { id: 'MENU_CUSTOM_JEWELLERY', title: 'Custom બનાવવું છે' },
          { id: 'MENU_GOLD_RATE', title: 'Gold Rate' },
          { id: 'MENU_TALK_TO_EXECUTIVE', title: 'Executive સાથે વાત' },
        ],
      }
    default:
      return {
        body: 'How can we help you today?',
        rows: [
          { id: 'MENU_BROWSE_JEWELLERY', title: 'Browse Jewellery' },
          { id: 'MENU_CUSTOM_JEWELLERY', title: 'Get Custom Made' },
          { id: 'MENU_GOLD_RATE', title: 'Gold Rate' },
          { id: 'MENU_TALK_TO_EXECUTIVE', title: 'Talk to Executive' },
        ],
      }
  }
}

function menuReplyCopy(language: PreferredLanguage, replyId: string): string {
  if (replyId === 'MENU_BROWSE_JEWELLERY') {
    switch (language) {
      case 'hi':
        return `💎 कलेक्शन देखें\n${BROWSE_JEWELLERY_URL}`
      case 'gu':
        return `💎 કલેક્શન જુઓ\n${BROWSE_JEWELLERY_URL}`
      default:
        return `💎 View Collection\n${BROWSE_JEWELLERY_URL}`
    }
  }

  if (replyId === 'MENU_GOLD_RATE') {
    switch (language) {
      case 'hi':
        return 'कृपया प्रतीक्षा करें, हम आज के gold और silver rates share करते हैं.'
      case 'gu':
        return 'કૃપા કરીને રાહ જુઓ, અમે આજના gold અને silver rates share કરીએ છીએ.'
      default:
        return "Please wait while we share today's gold and silver rates."
    }
  }

  if (replyId === 'MENU_CUSTOM_JEWELLERY') {
    switch (language) {
      case 'hi':
        return '✨ ज़रूर। पहले jewellery category बताइए:\n💍 Ring\n👂 Earrings\n📿 Necklace\n🔹 Other'
      case 'gu':
        return '✨ હા જરૂર. પહેલા jewellery category જણાવો:\n💍 Ring\n👂 Earrings\n📿 Necklace\n🔹 Other'
      default:
        return '✨ Sure. First, please tell us the jewellery category:\n💍 Ring\n👂 Earrings\n📿 Necklace\n🔹 Other'
    }
  }

  switch (language) {
    case 'hi':
      return 'ज़रूर. हमारे executive आपसे जल्द connect करेंगे.'
    case 'gu':
      return 'હા જરૂર. અમારા executive તમારી સાથે જલ્દી connect કરશે.'
    default:
      return 'Sure. Our executive will connect with you shortly.'
  }
}

function customRequestPrompt(
  language: PreferredLanguage,
  status: CustomRequestStatus,
): string {
  switch (status) {
    case 'awaiting_category':
      switch (language) {
        case 'hi':
          return '✨ कृपया jewellery category बताइए:\n💍 Ring\n👂 Earrings\n📿 Necklace\n🔹 Other'
        case 'gu':
          return '✨ કૃપા કરીને jewellery category જણાવો:\n💍 Ring\n👂 Earrings\n📿 Necklace\n🔹 Other'
        default:
          return '✨ Please tell us the jewellery category:\n💍 Ring\n👂 Earrings\n📿 Necklace\n🔹 Other'
      }
    case 'awaiting_image':
      switch (language) {
        case 'hi':
          return 'कृपया jewellery की reference image भेजिए जिसे आप बनवाना चाहते हैं.'
        case 'gu':
          return 'કૃપા કરીને jewellery ની reference image મોકલો જે તમે બનાવડાવા માંગો છો.'
        default:
          return 'Please send the reference image of the jewellery you want us to make.'
      }
    case 'awaiting_budget':
      switch (language) {
        case 'hi':
          return 'कृपया अपना approximate budget बताइए.'
        case 'gu':
          return 'કૃપા કરીને તમારું approximate budget જણાવો.'
        default:
          return 'Please share your approximate budget.'
      }
    default:
      switch (language) {
        case 'hi':
          return '✨ धन्यवाद! हमें आपकी requirements मिल गई हैं.\n\n📌 हमारी team इन्हें review करके आपको जल्द reply करेगी.'
        case 'gu':
          return '✨ આભાર! અમને તમારી requirements મળી ગઈ છે.\n\n📌 અમારી team review કરીને તમને જલ્દી reply કરશે.'
        default:
          return '✨ Thank you for providing us the requirements.\n\n📌 Our team will review them and reply to you shortly.'
      }
  }
}

function formatGoldRatesMessage(
  language: PreferredLanguage,
  rates: Awaited<ReturnType<typeof getLatestGoldRates>>
): string {
  const line22 =
    rates.rate22k
      ? `22K Gold: INR ${rates.rate22k.price}/${rates.rate22k.unit.replace('_', ' ')}`
      : language === 'hi'
        ? '22K Gold: उपलब्ध नहीं'
        : language === 'gu'
          ? '22K Gold: ઉપલબ્ધ નથી'
          : '22K Gold: unavailable'

  const line24 =
    rates.rate24k
      ? `24K Gold: INR ${rates.rate24k.price}/${rates.rate24k.unit.replace('_', ' ')}`
      : language === 'hi'
        ? '24K Gold: उपलब्ध नहीं'
        : language === 'gu'
          ? '24K Gold: ઉપલબ્ધ નથી'
          : '24K Gold: unavailable'

  switch (language) {
    case 'hi':
      return `आज के gold rates:\n${line22}\n${line24}`
    case 'gu':
      return `આજના gold rates:\n${line22}\n${line24}`
    default:
      return `Today's gold rates:\n${line22}\n${line24}`
  }
}

async function updateContactState(
  contactId: string,
  accountId: string,
  updates: Partial<Pick<Phase1ContactRow, 'preferred_language' | 'conversation_state'>>,
) {
  const { error } = await supabaseAdmin()
    .from('contacts')
    .update(updates)
    .eq('id', contactId)
    .eq('account_id', accountId)

  if (error) {
    throw new Error(`Failed to update contact flow state: ${error.message}`)
  }
}

async function sendLanguageSelection(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  contactName: string | null
}) {
  const bodyText = languageSelectionBody(args.contactName)
  logDev('[phase1] sending language selection', {
    conversationId: args.conversationId,
    contactId: args.contactId,
    bodyText,
  })
  await engineSendInteractiveButtons({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    bodyText,
    buttons: [
      { id: 'LANG_EN', title: 'English' },
      { id: 'LANG_HI', title: 'हिन्दी' },
      { id: 'LANG_GU', title: 'ગુજરાતી' },
    ],
  })
}

async function sendMainMenu(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  language: PreferredLanguage
}) {
  const copy = mainMenuCopy(args.language)
  logDev('[phase1] sending main menu', {
    conversationId: args.conversationId,
    contactId: args.contactId,
    language: args.language,
    bodyText: copy.body,
    rows: copy.rows,
  })
  await engineSendInteractiveList({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    bodyText: copy.body,
    buttonLabel: args.language === 'hi' ? 'Options' : args.language === 'gu' ? 'Options' : 'Options',
    sections: [
      {
        rows: copy.rows.map((row) => ({
          id: row.id,
          title: row.title,
        })),
      },
    ],
  })
}

async function sendMenuReply(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  language: PreferredLanguage
  replyId: string
}) {
  let text = menuReplyCopy(args.language, args.replyId)
  if (args.replyId === 'MENU_GOLD_RATE') {
    try {
      const rates = await getLatestGoldRates()
      text = formatGoldRatesMessage(args.language, rates)
    } catch (error) {
      console.error('[phase1] failed to load external gold rates:', {
        conversationId: args.conversationId,
        contactId: args.contactId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }
  logDev('[phase1] sending menu follow-up', {
    conversationId: args.conversationId,
    contactId: args.contactId,
    language: args.language,
    replyId: args.replyId,
    text,
  })
  await engineSendText({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    text,
  })
}

async function markNeedsHumanAttention(conversationId: string, accountId: string) {
  const { error } = await supabaseAdmin()
    .from('conversations')
    .update({
      status: 'open',
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('account_id', accountId)

  if (error) {
    console.error('[phase1] failed to mark conversation open:', error.message)
  }
}

async function getContactRow(contactId: string, accountId: string): Promise<Phase1ContactRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('contacts')
    .select('id, account_id, name, preferred_language, conversation_state')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load contact auto-reply state: ${error.message}`)
  }
  return data as Phase1ContactRow | null
}

async function getOpenCustomRequest(
  contactId: string,
  conversationId: string,
): Promise<CustomJewelleryRequestRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('custom_jewellery_requests')
    .select('id, account_id, contact_id, conversation_id, status, category, reference_image_url, budget_text')
    .eq('contact_id', contactId)
    .eq('conversation_id', conversationId)
    .in('status', ['awaiting_category', 'awaiting_image', 'awaiting_budget', 'pending_review'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load custom jewellery request: ${error.message}`)
  }

  return data as CustomJewelleryRequestRow | null
}

async function createCustomRequest(args: {
  accountId: string
  contactId: string
  conversationId: string
}): Promise<CustomJewelleryRequestRow> {
  const { data, error } = await supabaseAdmin()
    .from('custom_jewellery_requests')
    .insert({
      account_id: args.accountId,
      contact_id: args.contactId,
      conversation_id: args.conversationId,
      status: 'awaiting_category',
    })
    .select('id, account_id, contact_id, conversation_id, status, category, reference_image_url, budget_text')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create custom jewellery request: ${error?.message ?? 'unknown error'}`)
  }

  return data as CustomJewelleryRequestRow
}

async function updateCustomRequest(
  requestId: string,
  patch: Partial<Pick<CustomJewelleryRequestRow, 'status' | 'category' | 'reference_image_url' | 'budget_text'>>,
) {
  const updatePayload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  if (patch.status === 'pending_review') {
    updatePayload.completed_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin()
    .from('custom_jewellery_requests')
    .update(updatePayload)
    .eq('id', requestId)

  if (error) {
    throw new Error(`Failed to update custom jewellery request: ${error.message}`)
  }
}

async function handleOpenCustomRequest(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  language: PreferredLanguage
  inboundText: string | null
  inboundContentType: HandlePhase1AutoReplyArgs['inboundContentType']
  inboundMediaUrl: string | null
  inboundStoredMediaUrl: string | null
  inboundMediaMimeType: string | null
}): Promise<boolean> {
  const request = await getOpenCustomRequest(args.contactId, args.conversationId)
  if (!request) return false

  if (request.status === 'awaiting_category') {
    const category = args.inboundText?.trim()
    if (!category) {
      await engineSendText({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text: customRequestPrompt(args.language, 'awaiting_category'),
      })
      return true
    }

    await updateCustomRequest(request.id, {
      category,
      status: 'awaiting_image',
    })
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: customRequestPrompt(args.language, 'awaiting_image'),
    })
    return true
  }

  if (request.status === 'awaiting_image') {
    const isImageMessage = args.inboundContentType === 'image'
    const isImageDocument =
      args.inboundContentType === 'document' &&
      (args.inboundMediaMimeType?.toLowerCase().startsWith('image/') ?? false)

    if ((!isImageMessage && !isImageDocument) || !args.inboundMediaUrl) {
      await engineSendText({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text: customRequestPrompt(args.language, 'awaiting_image'),
      })
      return true
    }

    await updateCustomRequest(request.id, {
      reference_image_url: args.inboundStoredMediaUrl ?? args.inboundMediaUrl,
      status: 'awaiting_budget',
    })
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: customRequestPrompt(args.language, 'awaiting_budget'),
    })
    return true
  }

  if (request.status === 'awaiting_budget') {
    const budgetText = args.inboundText?.trim()
    if (!budgetText) {
      await engineSendText({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text: customRequestPrompt(args.language, 'awaiting_budget'),
      })
      return true
    }

    await updateCustomRequest(request.id, {
      budget_text: budgetText,
      status: 'pending_review',
    })
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: customRequestPrompt(args.language, 'pending_review'),
    })
    await markNeedsHumanAttention(args.conversationId, args.accountId)
    return true
  }

  return false
}

function isLanguageButtonReply(id: string | null): id is (typeof LANGUAGE_BUTTON_IDS)[number] {
  return Boolean(id && LANGUAGE_BUTTON_IDS.includes(id as (typeof LANGUAGE_BUTTON_IDS)[number]))
}

function isMainMenuReply(id: string | null): id is (typeof MAIN_MENU_BUTTON_IDS)[number] {
  return Boolean(id && MAIN_MENU_BUTTON_IDS.includes(id as (typeof MAIN_MENU_BUTTON_IDS)[number]))
}

function languageFromButton(id: (typeof LANGUAGE_BUTTON_IDS)[number]): PreferredLanguage {
  switch (id) {
    case 'LANG_HI':
      return 'hi'
    case 'LANG_GU':
      return 'gu'
    default:
      return 'en'
  }
}

export async function handlePhase1AutoReply(
  args: HandlePhase1AutoReplyArgs,
): Promise<boolean> {
  const contact = await getContactRow(args.contactId, args.accountId)
  if (!contact) return false

  const preferredLanguage = normalizeLanguage(contact.preferred_language)
  const conversationState = contact.conversation_state

  logDev('[phase1] inbound message', {
    type: args.interactiveReplyId ? 'interactive' : 'text',
    customerPhone: args.contactId,
    conversationId: args.conversationId,
    conversationState,
    selectedLanguage: preferredLanguage,
    interactiveReplyId: args.interactiveReplyId,
    inboundText: args.inboundText,
  })

  const language = preferredLanguage ?? 'en'
  const openCustomRequestHandled = await handleOpenCustomRequest({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    language,
    inboundText: args.inboundText,
    inboundContentType: args.inboundContentType,
    inboundMediaUrl: args.inboundMediaUrl,
    inboundStoredMediaUrl: args.inboundStoredMediaUrl,
    inboundMediaMimeType: args.inboundMediaMimeType,
  })
  if (openCustomRequestHandled) return true

  if (isLanguageButtonReply(args.interactiveReplyId)) {
    const selectedLanguage = languageFromButton(args.interactiveReplyId)
    await updateContactState(args.contactId, args.accountId, {
      preferred_language: selectedLanguage,
      conversation_state: 'MAIN_MENU',
    })
    await sendMainMenu({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      language: selectedLanguage,
    })
    return true
  }

  if (isMainMenuReply(args.interactiveReplyId)) {
    await updateContactState(args.contactId, args.accountId, {
      conversation_state: 'MAIN_MENU',
    })
    if (args.interactiveReplyId === 'MENU_CUSTOM_JEWELLERY') {
      await createCustomRequest({
        accountId: args.accountId,
        contactId: args.contactId,
        conversationId: args.conversationId,
      })
    }
    await sendMenuReply({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      language,
      replyId: args.interactiveReplyId,
    })
    if (args.interactiveReplyId === 'MENU_TALK_TO_EXECUTIVE') {
      await markNeedsHumanAttention(args.conversationId, args.accountId)
    }
    return true
  }

  const inboundText = args.inboundText?.trim()
  if (!inboundText) return false

  if (!preferredLanguage) {
    await updateContactState(args.contactId, args.accountId, {
      conversation_state: 'AWAITING_LANGUAGE_SELECTION',
    })
    await sendLanguageSelection({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      contactName: contact.name ?? args.contactName,
    })
    return true
  }

  await updateContactState(args.contactId, args.accountId, {
    conversation_state: 'MAIN_MENU',
  })
  await sendMainMenu({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    language: preferredLanguage,
  })
  return true
}
