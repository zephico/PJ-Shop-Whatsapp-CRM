import { format, isValid, parse } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { engineSendInteractiveButtons, engineSendInteractiveList, engineSendText } from '@/lib/flows/meta-send'
import { getLatestGoldRates } from '@/lib/whatsapp/external-gold-rates'

type PreferredLanguage = 'en' | 'hi' | 'gu'
type ConversationState =
  | 'AWAITING_LANGUAGE_SELECTION'
  | 'MAIN_MENU'
  | 'BROWSING_JEWELLERY'
  | 'CUSTOM_JEWELLERY'
  | 'GOLD_RATE'
  | 'AWAITING_BIRTHDAY_CONSENT'
  | 'AWAITING_BIRTHDAY'
  | 'HUMAN_HANDOFF'
  | 'FLOW_COMPLETED'
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
const POST_BROWSE_BUTTON_IDS = ['POST_BROWSE_EXPLORE_MORE', 'POST_BROWSE_TALK_TO_EXECUTIVE', 'POST_BROWSE_MAIN_MENU'] as const
const POST_CUSTOM_BUTTON_IDS = ['POST_CUSTOM_ADD_MORE_DETAILS', 'POST_CUSTOM_MAIN_MENU'] as const
const POST_GOLD_RATE_BUTTON_IDS = ['POST_GOLD_BROWSE_JEWELLERY', 'POST_GOLD_TALK_TO_EXECUTIVE', 'POST_GOLD_MAIN_MENU'] as const
const BIRTHDAY_CONSENT_BUTTON_IDS = ['BIRTHDAY_YES', 'BIRTHDAY_MAYBE_LATER', 'BIRTHDAY_NO_THANKS'] as const
const MAIN_MENU_TEXT_TOKENS = ['main menu', 'menu', 'mainmenu'] as const
type BirthdayPromptStatus = 'not_asked' | 'accepted' | 'maybe_later' | 'declined' | 'completed'

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
  last_menu_type: string | null
  last_menu_sent_at: string | null
  last_processed_inbound_message_id: string | null
  birth_date: string | null
  birth_day: number | null
  birth_month: number | null
  birth_year: number | null
  birthday_opt_in: boolean | null
  birthday_prompt_status: BirthdayPromptStatus | null
  birthday_source: string | null
  birthday_captured_at: string | null
  birthday_invalid_attempts: number | null
  birthday_prompt_conversation_id: string | null
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
  inboundMessageId: string
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

function mainMenuPrompt(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return 'कृपया नीचे दिए गए options में से चुनें.'
    case 'gu':
      return 'કૃપા કરીને નીચેના options માંથી પસંદ કરો.'
    default:
      return 'Please choose one of the options below.'
  }
}

function postBrowseCopy(language: PreferredLanguage) {
  switch (language) {
    case 'hi':
      return {
        body: 'क्या आप another category देखना चाहेंगे या हमारे jewellery expert से बात करना चाहेंगे?',
        buttons: [
          { id: 'POST_BROWSE_EXPLORE_MORE', title: 'Explore More' },
          { id: 'POST_BROWSE_TALK_TO_EXECUTIVE', title: 'Executive' },
          { id: 'POST_BROWSE_MAIN_MENU', title: 'Main Menu' },
        ],
      }
    case 'gu':
      return {
        body: 'શું તમે બીજી category જોવા માંગો છો કે અમારા jewellery expert સાથે વાત કરવી છે?',
        buttons: [
          { id: 'POST_BROWSE_EXPLORE_MORE', title: 'Explore More' },
          { id: 'POST_BROWSE_TALK_TO_EXECUTIVE', title: 'Executive' },
          { id: 'POST_BROWSE_MAIN_MENU', title: 'Main Menu' },
        ],
      }
    default:
      return {
        body: 'Would you like to explore another category or speak with our jewellery expert?',
        buttons: [
          { id: 'POST_BROWSE_EXPLORE_MORE', title: 'Explore More' },
          { id: 'POST_BROWSE_TALK_TO_EXECUTIVE', title: 'Executive' },
          { id: 'POST_BROWSE_MAIN_MENU', title: 'Main Menu' },
        ],
      }
  }
}

function postGoldRateCopy(language: PreferredLanguage) {
  switch (language) {
    case 'hi':
      return {
        body: 'क्या आप jewellery browse करना चाहेंगे या executive से बात करना चाहेंगे?',
        buttons: [
          { id: 'POST_GOLD_BROWSE_JEWELLERY', title: 'Browse' },
          { id: 'POST_GOLD_TALK_TO_EXECUTIVE', title: 'Executive' },
          { id: 'POST_GOLD_MAIN_MENU', title: 'Main Menu' },
        ],
      }
    case 'gu':
      return {
        body: 'શું તમે jewellery browse કરશો કે executive સાથે વાત કરશો?',
        buttons: [
          { id: 'POST_GOLD_BROWSE_JEWELLERY', title: 'Browse' },
          { id: 'POST_GOLD_TALK_TO_EXECUTIVE', title: 'Executive' },
          { id: 'POST_GOLD_MAIN_MENU', title: 'Main Menu' },
        ],
      }
    default:
      return {
        body: 'Would you like to browse jewellery or talk to an executive?',
        buttons: [
          { id: 'POST_GOLD_BROWSE_JEWELLERY', title: 'Browse' },
          { id: 'POST_GOLD_TALK_TO_EXECUTIVE', title: 'Executive' },
          { id: 'POST_GOLD_MAIN_MENU', title: 'Main Menu' },
        ],
      }
  }
}

function postCustomCopy(language: PreferredLanguage) {
  switch (language) {
    case 'hi':
      return {
        body: 'धन्यवाद. आपकी custom jewellery enquiry submit हो गई है. हमारा executive जल्द contact करेगा.',
        buttons: [
          { id: 'POST_CUSTOM_ADD_MORE_DETAILS', title: 'Add Details' },
          { id: 'POST_CUSTOM_MAIN_MENU', title: 'Main Menu' },
        ],
      }
    case 'gu':
      return {
        body: 'આભાર. તમારી custom jewellery enquiry submit થઈ ગઈ છે. અમારો executive જલ્દી સંપર્ક કરશે.',
        buttons: [
          { id: 'POST_CUSTOM_ADD_MORE_DETAILS', title: 'Add Details' },
          { id: 'POST_CUSTOM_MAIN_MENU', title: 'Main Menu' },
        ],
      }
    default:
      return {
        body: 'Thank you. Your custom jewellery enquiry has been submitted. Our executive will contact you shortly.',
        buttons: [
          { id: 'POST_CUSTOM_ADD_MORE_DETAILS', title: 'Add Details' },
          { id: 'POST_CUSTOM_MAIN_MENU', title: 'Main Menu' },
        ],
      }
  }
}

function languageConfirmedCopy(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return 'धन्यवाद! अब हम हिन्दी में आगे बढ़ेंगे.\n\nहम आपकी कैसे मदद कर सकते हैं? ✨'
    case 'gu':
      return 'આભાર! હવે અમે ગુજરાતી માં આગળ વધીએ છીએ.\n\nઅમે તમારી કેવી રીતે મદદ કરી શકીએ? ✨'
    default:
      return "Thank you! We'll continue in English.\n\nHow can we help you today? ✨"
  }
}

function welcomeBackCopy(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return 'Pradeep Jewellers में फिर से स्वागत है ✨'
    case 'gu':
      return 'Pradeep Jewellers માં ફરી સ્વાગત છે ✨'
    default:
      return 'Welcome back to Pradeep Jewellers ✨'
  }
}

function executiveConfirmationCopy(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return 'ज़रूर! हमारा executive आपसे जल्द connect करेगा. 😊'
    case 'gu':
      return 'હા જરૂર! અમારો executive તમારી સાથે જલ્દી connect કરશે. 😊'
    default:
      return 'Sure! Our executive will connect with you shortly. 😊'
  }
}

function birthdayConsentCopy(language: PreferredLanguage) {
  switch (language) {
    case 'hi':
      return {
        body:
          'इस बीच, क्या आप अपना birthday हमारे साथ share करना चाहेंगे? 🎁\n\nहम इसका उपयोग birthday wishes, exclusive offers और personalised jewellery suggestions भेजने के लिए करेंगे.',
        buttons: [
          { id: 'BIRTHDAY_YES', title: 'Yes, Share' },
          { id: 'BIRTHDAY_MAYBE_LATER', title: 'Maybe Later' },
          { id: 'BIRTHDAY_NO_THANKS', title: 'No, Thanks' },
        ],
      }
    case 'gu':
      return {
        body:
          'આ દરમિયાન, શું તમે તમારો birthday અમારી સાથે share કરવા માંગશો? 🎁\n\nઅમે તેનો ઉપયોગ birthday wishes, exclusive offers અને personalised jewellery suggestions મોકલવા માટે કરીશું.',
        buttons: [
          { id: 'BIRTHDAY_YES', title: 'Yes, Share' },
          { id: 'BIRTHDAY_MAYBE_LATER', title: 'Maybe Later' },
          { id: 'BIRTHDAY_NO_THANKS', title: 'No, Thanks' },
        ],
      }
    default:
      return {
        body:
          'Meanwhile, would you like to share your birthday with us? 🎁\n\nWe’ll use it to send you birthday wishes, exclusive offers and personalised jewellery suggestions.',
        buttons: [
          { id: 'BIRTHDAY_YES', title: 'Yes, Share Birthday' },
          { id: 'BIRTHDAY_MAYBE_LATER', title: 'Maybe Later' },
          { id: 'BIRTHDAY_NO_THANKS', title: 'No, Thanks' },
        ],
      }
  }
}

function birthdayInputPrompt(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return 'कृपया अपना birthday DD/MM/YYYY format में enter करें.\n\nExample: 16/02/1995\n\nBirth year आवश्यक है ताकि हम आपकी age calculate कर सकें और relevant offers व jewellery recommendations दे सकें.'
    case 'gu':
      return 'કૃપા કરીને તમારો birthday DD/MM/YYYY format માં enter કરો.\n\nExample: 16/02/1995\n\nBirth year જરૂરી છે જેથી અમે તમારી age calculate કરી શકીએ અને relevant offers તથા jewellery recommendations આપી શકીએ.'
    default:
      return 'Please enter your birthday in DD/MM/YYYY format.\n\nExample: 16/02/1995\n\nYour birth year is required so that we can calculate your age and provide relevant offers and jewellery recommendations.'
  }
}

function invalidBirthdayCopy(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return "यह date valid नहीं लगती.\n\nकृपया अपना complete birthday DD/MM/YYYY format में enter करें.\n\nExample: 16/02/1995\n\nBirth year आवश्यक है."
    case 'gu':
      return 'આ date valid લાગતી નથી.\n\nકૃપા કરીને તમારો complete birthday DD/MM/YYYY format માં enter કરો.\n\nExample: 16/02/1995\n\nBirth year જરૂરી છે.'
    default:
      return "That date doesn’t look valid.\n\nPlease enter your complete birthday in DD/MM/YYYY format.\n\nExample: 16/02/1995\n\nThe birth year is required."
  }
}

function birthdayTooManyAttemptsCopy(language: PreferredLanguage): string {
  switch (language) {
    case 'hi':
      return 'कोई बात नहीं. आप अपना birthday बाद में कभी भी share कर सकते हैं.\n\nहमारा executive जल्द आपकी सहायता करेगा.'
    case 'gu':
      return 'કોઈ વાંધો નહીં. તમે તમારો birthday પછી ક્યારેય share કરી શકો છો.\n\nઅમારો executive જલ્દી તમારી મદદ કરશે.'
    default:
      return 'No problem. You can share your birthday anytime later.\n\nOur executive will assist you shortly.'
  }
}

function birthdaySavedCopy(language: PreferredLanguage, formattedBirthday: string): string {
  switch (language) {
    case 'hi':
      return `धन्यवाद! 🎉\n\nआपका birthday ${formattedBirthday} के रूप में save हो गया है.\n\nआप कभी भी इसे update या remove करने के लिए कह सकते हैं.`
    case 'gu':
      return `આભાર! 🎉\n\nતમારો birthday ${formattedBirthday} તરીકે save થઈ ગયો છે.\n\nતમે ક્યારેય પણ તેને update અથવા remove કરવા કહી શકો છો.`
    default:
      return `Thank you! 🎉\n\nYour birthday has been saved as ${formattedBirthday}.\n\nYou can ask us to update or remove it anytime.`
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
  updates: Partial<Pick<Phase1ContactRow, 'preferred_language' | 'conversation_state' | 'last_menu_type' | 'last_menu_sent_at' | 'last_processed_inbound_message_id' | 'birth_date' | 'birth_day' | 'birth_month' | 'birth_year' | 'birthday_opt_in' | 'birthday_prompt_status' | 'birthday_source' | 'birthday_captured_at' | 'birthday_invalid_attempts' | 'birthday_prompt_conversation_id'>>,
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

function calculateAge(birthDate: Date): number {
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()

  const birthdayHasOccurred =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate())

  if (!birthdayHasOccurred) age--
  return age
}

function parseBirthdayInput(input: string): Date | null {
  const trimmed = input.trim().replace(/\s+/g, ' ')
  const formats = [
    'dd/MM/yyyy',
    'd/M/yyyy',
    'dd-MM-yyyy',
    'd-M-yyyy',
    'd MMMM yyyy',
    'dd MMMM yyyy',
    'd MMM yyyy',
    'dd MMM yyyy',
    'MMMM d, yyyy',
    'MMM d, yyyy',
  ]

  if (!/\b\d{4}\b/.test(trimmed)) return null
  if (/\b\d{2}\/\d{2}\/\d{2}\b/.test(trimmed) || /\b\d{2}-\d{2}-\d{2}\b/.test(trimmed)) {
    return null
  }

  for (const formatPattern of formats) {
    const parsed = parse(trimmed, formatPattern, new Date())
    if (!isValid(parsed)) continue
    const age = calculateAge(parsed)
    if (parsed > new Date()) return null
    if (age < 0 || age > 120) return null
    return parsed
  }

  return null
}

async function moveToHumanHandoff(args: {
  accountId: string
  contactId: string
  conversationId: string
  birthdayPromptStatus?: BirthdayPromptStatus
  birthdayInvalidAttempts?: number
}) {
  await markNeedsHumanAttention(args.conversationId, args.accountId)
  await updateContactState(args.contactId, args.accountId, {
    conversation_state: 'HUMAN_HANDOFF',
    last_menu_type: null,
    birthday_prompt_status: args.birthdayPromptStatus,
    birthday_invalid_attempts: args.birthdayInvalidAttempts,
  })
}

async function sendExecutiveFollowup(args: {
  accountId: string
  userId: string
  conversationId: string
  contact: Phase1ContactRow
  language: PreferredLanguage
}) {
  await markNeedsHumanAttention(args.conversationId, args.accountId)
  await engineSendText({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contact.id,
    text: executiveConfirmationCopy(args.language),
  })

  const hasBirthday =
    Boolean(args.contact.birth_date) &&
    args.contact.birth_day !== null &&
    args.contact.birth_month !== null &&
    args.contact.birth_year !== null

  const promptStatus = args.contact.birthday_prompt_status ?? 'not_asked'
  const sameConversationMaybeLater =
    promptStatus === 'maybe_later' &&
    args.contact.birthday_prompt_conversation_id === args.conversationId

  if (hasBirthday || promptStatus === 'declined' || sameConversationMaybeLater) {
    await moveToHumanHandoff({
      accountId: args.accountId,
      contactId: args.contact.id,
      conversationId: args.conversationId,
      birthdayPromptStatus: promptStatus,
      birthdayInvalidAttempts: 0,
    })
    return
  }

  const consent = birthdayConsentCopy(args.language)
  await sendActionButtons({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contact.id,
    bodyText: consent.body,
    buttons: consent.buttons,
  })
  await updateContactState(args.contact.id, args.accountId, {
    conversation_state: 'AWAITING_BIRTHDAY_CONSENT',
    birthday_prompt_conversation_id: args.conversationId,
    birthday_invalid_attempts: 0,
  })
}

function isGreeting(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  return ['hi', 'hello', 'hey', 'hii', 'namaste', 'namaskar'].includes(normalized)
}

function isMainMenuText(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  return MAIN_MENU_TEXT_TOKENS.some((token) => normalized === token)
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
  contact: Phase1ContactRow
  force?: boolean
}) {
  if (
    !args.force &&
    args.contact.conversation_state === 'MAIN_MENU' &&
    args.contact.last_menu_type === 'main_menu'
  ) {
    logDev('[phase1] skip duplicate main menu', {
      conversationId: args.conversationId,
      contactId: args.contactId,
    })
    return
  }
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
  await updateContactState(args.contactId, args.accountId, {
    conversation_state: 'MAIN_MENU',
    last_menu_type: 'main_menu',
    last_menu_sent_at: new Date().toISOString(),
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

async function sendActionButtons(args: {
  accountId: string
  userId: string
  conversationId: string
  contactId: string
  bodyText: string
  buttons: Array<{ id: string; title: string }>
}) {
  await engineSendInteractiveButtons({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    bodyText: args.bodyText,
    buttons: args.buttons,
  })
}

async function getContactRow(contactId: string, accountId: string): Promise<Phase1ContactRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('contacts')
    .select('id, account_id, name, preferred_language, conversation_state, last_menu_type, last_menu_sent_at, last_processed_inbound_message_id, birth_date, birth_day, birth_month, birth_year, birthday_opt_in, birthday_prompt_status, birthday_source, birthday_captured_at, birthday_invalid_attempts, birthday_prompt_conversation_id')
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
    const next = postCustomCopy(args.language)
    await sendActionButtons({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      bodyText: next.body,
      buttons: next.buttons,
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

function isPostBrowseReply(id: string | null): id is (typeof POST_BROWSE_BUTTON_IDS)[number] {
  return Boolean(id && POST_BROWSE_BUTTON_IDS.includes(id as (typeof POST_BROWSE_BUTTON_IDS)[number]))
}

function isPostCustomReply(id: string | null): id is (typeof POST_CUSTOM_BUTTON_IDS)[number] {
  return Boolean(id && POST_CUSTOM_BUTTON_IDS.includes(id as (typeof POST_CUSTOM_BUTTON_IDS)[number]))
}

function isPostGoldRateReply(id: string | null): id is (typeof POST_GOLD_RATE_BUTTON_IDS)[number] {
  return Boolean(id && POST_GOLD_RATE_BUTTON_IDS.includes(id as (typeof POST_GOLD_RATE_BUTTON_IDS)[number]))
}

function isBirthdayConsentReply(id: string | null): id is (typeof BIRTHDAY_CONSENT_BUTTON_IDS)[number] {
  return Boolean(id && BIRTHDAY_CONSENT_BUTTON_IDS.includes(id as (typeof BIRTHDAY_CONSENT_BUTTON_IDS)[number]))
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
    inboundMessageId: args.inboundMessageId,
  })

  if (contact.last_processed_inbound_message_id === args.inboundMessageId) {
    logDev('[phase1] skip already processed inbound id on contact', {
      contactId: args.contactId,
      inboundMessageId: args.inboundMessageId,
    })
    return true
  }

  await updateContactState(args.contactId, args.accountId, {
    last_processed_inbound_message_id: args.inboundMessageId,
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
      last_menu_type: null,
    })
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: languageConfirmedCopy(selectedLanguage),
    })
    await sendMainMenu({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      language: selectedLanguage,
      contact: {
        ...contact,
        preferred_language: selectedLanguage,
        conversation_state: 'FLOW_COMPLETED',
        last_menu_type: null,
      },
      force: true,
    })
    return true
  }

  if (conversationState === 'AWAITING_BIRTHDAY_CONSENT' && isBirthdayConsentReply(args.interactiveReplyId)) {
    if (args.interactiveReplyId === 'BIRTHDAY_YES') {
      await updateContactState(args.contactId, args.accountId, {
        conversation_state: 'AWAITING_BIRTHDAY',
        birthday_prompt_status: 'accepted',
        birthday_invalid_attempts: 0,
        birthday_prompt_conversation_id: args.conversationId,
      })
      await engineSendText({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text: birthdayInputPrompt(language),
      })
      return true
    }

    if (args.interactiveReplyId === 'BIRTHDAY_MAYBE_LATER') {
      await moveToHumanHandoff({
        accountId: args.accountId,
        contactId: args.contactId,
        conversationId: args.conversationId,
        birthdayPromptStatus: 'maybe_later',
        birthdayInvalidAttempts: 0,
      })
      return true
    }

    await moveToHumanHandoff({
      accountId: args.accountId,
      contactId: args.contactId,
      conversationId: args.conversationId,
      birthdayPromptStatus: 'declined',
      birthdayInvalidAttempts: 0,
    })
    return true
  }

  if (conversationState === 'AWAITING_BIRTHDAY') {
    const inboundText = args.inboundText?.trim()
    if (!inboundText) {
      await engineSendText({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text: invalidBirthdayCopy(language),
      })
      return true
    }

    const parsedBirthday = parseBirthdayInput(inboundText)
    if (!parsedBirthday) {
      const attempts = (contact.birthday_invalid_attempts ?? 0) + 1
      if (attempts >= 3) {
        await engineSendText({
          accountId: args.accountId,
          userId: args.userId,
          conversationId: args.conversationId,
          contactId: args.contactId,
          text: birthdayTooManyAttemptsCopy(language),
        })
        await moveToHumanHandoff({
          accountId: args.accountId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          birthdayPromptStatus: 'maybe_later',
          birthdayInvalidAttempts: 0,
        })
        return true
      }

      await updateContactState(args.contactId, args.accountId, {
        birthday_invalid_attempts: attempts,
      })
      await engineSendText({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        text: invalidBirthdayCopy(language),
      })
      return true
    }

    const formattedBirthday = format(parsedBirthday, 'd MMMM yyyy')
    await updateContactState(args.contactId, args.accountId, {
      birth_date: format(parsedBirthday, 'yyyy-MM-dd'),
      birth_day: parsedBirthday.getDate(),
      birth_month: parsedBirthday.getMonth() + 1,
      birth_year: parsedBirthday.getFullYear(),
      birthday_opt_in: true,
      birthday_prompt_status: 'completed',
      birthday_source: 'talk_to_executive_flow',
      birthday_captured_at: new Date().toISOString(),
      birthday_invalid_attempts: 0,
      conversation_state: 'HUMAN_HANDOFF',
      last_menu_type: null,
    })
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: birthdaySavedCopy(language, formattedBirthday),
    })
    await markNeedsHumanAttention(args.conversationId, args.accountId)
    return true
  }

  if (conversationState === 'HUMAN_HANDOFF') {
    if (isMainMenuText(args.inboundText ?? '') || isGreeting(args.inboundText ?? '')) {
      await updateContactState(args.contactId, args.accountId, {
        conversation_state: 'MAIN_MENU',
        last_menu_type: null,
      })
      await sendMainMenu({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        language,
        contact: {
          ...contact,
          conversation_state: 'FLOW_COMPLETED',
          last_menu_type: null,
        },
        force: true,
      })
    }
    return true
  }

  if (isMainMenuReply(args.interactiveReplyId)) {
    if (args.interactiveReplyId === 'MENU_CUSTOM_JEWELLERY') {
      await updateContactState(args.contactId, args.accountId, {
        conversation_state: 'CUSTOM_JEWELLERY',
        last_menu_type: null,
      })
      await createCustomRequest({
        accountId: args.accountId,
        contactId: args.contactId,
        conversationId: args.conversationId,
      })
      await sendMenuReply({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        language,
        replyId: args.interactiveReplyId,
      })
      return true
    }

    if (args.interactiveReplyId === 'MENU_TALK_TO_EXECUTIVE') {
      await sendExecutiveFollowup({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contact,
        language,
      })
      return true
    }

    if (args.interactiveReplyId === 'MENU_BROWSE_JEWELLERY') {
      await updateContactState(args.contactId, args.accountId, {
        conversation_state: 'BROWSING_JEWELLERY',
        last_menu_type: null,
      })
      await sendMenuReply({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        language,
        replyId: args.interactiveReplyId,
      })
      const next = postBrowseCopy(language)
      await sendActionButtons({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        bodyText: next.body,
        buttons: next.buttons,
      })
      await updateContactState(args.contactId, args.accountId, {
        conversation_state: 'FLOW_COMPLETED',
        last_menu_type: 'post_browse',
        last_menu_sent_at: new Date().toISOString(),
      })
      return true
    }

    await updateContactState(args.contactId, args.accountId, {
      conversation_state: 'GOLD_RATE',
      last_menu_type: null,
    })
    await sendMenuReply({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      language,
      replyId: args.interactiveReplyId,
    })
    const next = postGoldRateCopy(language)
    await sendActionButtons({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      bodyText: next.body,
      buttons: next.buttons,
    })
    await updateContactState(args.contactId, args.accountId, {
      conversation_state: 'FLOW_COMPLETED',
      last_menu_type: 'post_gold_rate',
      last_menu_sent_at: new Date().toISOString(),
    })
    return true
  }

  if (isPostBrowseReply(args.interactiveReplyId)) {
    if (args.interactiveReplyId === 'POST_BROWSE_MAIN_MENU') {
      await sendMainMenu({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        language,
        contact: {
          ...contact,
          conversation_state: 'FLOW_COMPLETED',
          last_menu_type: 'post_browse',
        },
        force: true,
      })
      return true
    }
    if (args.interactiveReplyId === 'POST_BROWSE_TALK_TO_EXECUTIVE') {
      await sendExecutiveFollowup({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contact,
        language,
      })
      return true
    }
    await sendMainMenu({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      language,
      contact: {
        ...contact,
        conversation_state: 'FLOW_COMPLETED',
        last_menu_type: 'post_browse',
      },
      force: true,
    })
    return true
  }

  if (isPostGoldRateReply(args.interactiveReplyId)) {
    if (args.interactiveReplyId === 'POST_GOLD_MAIN_MENU') {
      await sendMainMenu({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        language,
        contact: {
          ...contact,
          conversation_state: 'FLOW_COMPLETED',
          last_menu_type: 'post_gold_rate',
        },
        force: true,
      })
      return true
    }
    if (args.interactiveReplyId === 'POST_GOLD_TALK_TO_EXECUTIVE') {
      await sendExecutiveFollowup({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contact,
        language,
      })
      return true
    }
    await sendMenuReply({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      language,
      replyId: 'MENU_BROWSE_JEWELLERY',
    })
    const next = postBrowseCopy(language)
    await sendActionButtons({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      bodyText: next.body,
      buttons: next.buttons,
    })
    await updateContactState(args.contactId, args.accountId, {
      conversation_state: 'FLOW_COMPLETED',
      last_menu_type: 'post_browse',
      last_menu_sent_at: new Date().toISOString(),
    })
    return true
  }

  if (isPostCustomReply(args.interactiveReplyId)) {
    if (args.interactiveReplyId === 'POST_CUSTOM_MAIN_MENU') {
      await sendMainMenu({
        accountId: args.accountId,
        userId: args.userId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        language,
        contact: {
          ...contact,
          conversation_state: 'FLOW_COMPLETED',
          last_menu_type: 'post_custom',
        },
        force: true,
      })
      return true
    }
    await createCustomRequest({
      accountId: args.accountId,
      contactId: args.contactId,
      conversationId: args.conversationId,
    })
    await updateContactState(args.contactId, args.accountId, {
      conversation_state: 'CUSTOM_JEWELLERY',
      last_menu_type: null,
    })
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: customRequestPrompt(language, 'awaiting_category'),
    })
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

  if (!isGreeting(inboundText) && !isMainMenuText(inboundText)) return false

  await engineSendText({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    text: welcomeBackCopy(preferredLanguage),
  })
  await sendMainMenu({
    accountId: args.accountId,
    userId: args.userId,
    conversationId: args.conversationId,
    contactId: args.contactId,
    language: preferredLanguage,
    contact: {
      ...contact,
      conversation_state: 'FLOW_COMPLETED',
    },
    force: true,
  })
  return true
}
