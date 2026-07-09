import { supabaseAdmin } from '@/lib/supabase/admin'
import { engineSendInteractiveButtons, engineSendText } from '@/lib/flows/meta-send'

type PreferredLanguage = 'en' | 'hi' | 'gu'
type ConversationState = 'AWAITING_LANGUAGE_SELECTION' | 'MAIN_MENU'

const LANGUAGE_BUTTON_IDS = ['LANG_EN', 'LANG_HI', 'LANG_GU'] as const
const MAIN_MENU_BUTTON_IDS = [
  'MENU_BROWSE_JEWELLERY',
  'MENU_GOLD_RATE',
  'MENU_TALK_TO_EXECUTIVE',
] as const

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
        buttons: [
          { id: 'MENU_BROWSE_JEWELLERY', title: 'Jewellery देखें' },
          { id: 'MENU_GOLD_RATE', title: 'Gold Rate' },
          { id: 'MENU_TALK_TO_EXECUTIVE', title: 'Executive से बात' },
        ],
      }
    case 'gu':
      return {
        body: 'અમે તમારી કેવી રીતે મદદ કરી શકીએ?',
        buttons: [
          { id: 'MENU_BROWSE_JEWELLERY', title: 'Jewellery જુઓ' },
          { id: 'MENU_GOLD_RATE', title: 'Gold Rate' },
          { id: 'MENU_TALK_TO_EXECUTIVE', title: 'Executive સાથે વાત' },
        ],
      }
    default:
      return {
        body: 'How can we help you today?',
        buttons: [
          { id: 'MENU_BROWSE_JEWELLERY', title: 'Browse Jewellery' },
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
        return 'ज़रूर. हमारी टीम आपको jewellery collections देखने में जल्द मदद करेगी.'
      case 'gu':
        return 'હા જરૂર. અમારી ટીમ તમને jewellery collections જોવા માટે જલ્દી મદદ કરશે.'
      default:
        return 'Sure. Our team will help you explore jewellery collections shortly.'
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

  switch (language) {
    case 'hi':
      return 'ज़रूर. हमारे executive आपसे जल्द connect करेंगे.'
    case 'gu':
      return 'હા જરૂર. અમારા executive તમારી સાથે જલ્દી connect કરશે.'
    default:
      return 'Sure. Our executive will connect with you shortly.'
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
    buttons: copy.buttons,
  })
  await engineSendInteractiveButtons({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    bodyText: copy.body,
    buttons: copy.buttons,
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
  const text = menuReplyCopy(args.language, args.replyId)
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
    const language = preferredLanguage ?? 'en'
    await updateContactState(args.contactId, args.accountId, {
      conversation_state: 'MAIN_MENU',
    })
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
