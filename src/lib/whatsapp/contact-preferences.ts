import { isValid, parse } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'

type PromptKey =
  | 'birthday'
  | 'anniversary'
  | 'custom_occasion'
  | 'preferred_metal'
  | 'preferred_purity'
  | 'preferred_style'
  | 'preferred_budget'
  | 'favorite_category'
  | 'favorite_stone'
  | 'purchase_intent'

type OccasionType = 'birthday' | 'anniversary' | 'custom'

interface ExtractedPreferences {
  preferred_metal?: string
  preferred_purity?: string
  preferred_style?: string
  preferred_budget_min?: number
  preferred_budget_max?: number
  favorite_category?: string
  favorite_stone?: string
  purchase_intent?: string
  preferred_occasion?: string
}

interface ExtractedPersonalFact {
  factType: string
  factValue: string
  relatedPerson: string | null
}

interface ExtractedSpecialDate {
  occasionType: OccasionType
  occasionName: string | null
  occasionDate: string
  promptKey: PromptKey
}

interface ExtractedSignals {
  preferences: ExtractedPreferences
  promptKeys: Set<PromptKey>
  specialDates: ExtractedSpecialDate[]
  personalFacts: ExtractedPersonalFact[]
  occasionPerson: string | null
}

const CATEGORY_RULES: Array<{ value: string; terms: string[] }> = [
  { value: 'ring', terms: ['ring', 'rings'] },
  { value: 'earrings', terms: ['earring', 'earrings', 'jhumka', 'jhumkas', 'tops'] },
  { value: 'necklace', terms: ['necklace', 'necklaces', 'neck piece', 'neckpiece'] },
  { value: 'pendant', terms: ['pendant', 'pendants'] },
  { value: 'bangle', terms: ['bangle', 'bangles', 'kada', 'kadas'] },
  { value: 'bracelet', terms: ['bracelet', 'bracelets'] },
  { value: 'mangalsutra', terms: ['mangalsutra'] },
  { value: 'chain', terms: ['chain', 'chains'] },
]

const STYLE_RULES: Array<{ value: string; terms: string[] }> = [
  { value: 'long jhumka', terms: ['long jhumka', 'long jhumkas'] },
  { value: 'traditional', terms: ['traditional'] },
  { value: 'antique', terms: ['antique'] },
  { value: 'royal heritage', terms: ['royal heritage'] },
  { value: 'bridal', terms: ['bridal', 'bridal set'] },
  { value: 'lightweight', terms: ['lightweight', 'light weight', 'daily wear'] },
  { value: 'modern', terms: ['modern', 'minimal', 'minimalist'] },
  { value: 'occasional wear', terms: ['occasional wear', 'party wear'] },
]

const STONE_RULES: Array<{ value: string; terms: string[] }> = [
  { value: 'diamond', terms: ['diamond', 'diamonds', 'solitaire'] },
  { value: 'emerald', terms: ['emerald', 'emeralds', 'panna'] },
  { value: 'ruby', terms: ['ruby', 'rubies', 'manik'] },
  { value: 'sapphire', terms: ['sapphire', 'sapphires', 'neelam'] },
  { value: 'pearl', terms: ['pearl', 'pearls', 'moti'] },
  { value: 'polki', terms: ['polki'] },
  { value: 'kundan', terms: ['kundan'] },
]

const INTENT_RULES: Array<{ value: string; terms: string[] }> = [
  { value: 'gift', terms: ['gift', 'gifting'] },
  { value: 'self purchase', terms: ['self purchase', 'for myself', 'myself'] },
  { value: 'bridal trousseau', terms: ['bridal trousseau', 'wedding', 'bridal', 'engagement'] },
]

const OCCASION_RULES: Array<{ value: string; terms: string[] }> = [
  { value: 'birthday', terms: ['birthday'] },
  { value: 'anniversary', terms: ['anniversary'] },
  { value: 'wedding', terms: ['wedding', 'marriage'] },
  { value: 'engagement', terms: ['engagement'] },
  { value: 'gift', terms: ['gift'] },
  { value: 'festival', terms: ['diwali', 'akshaya tritiya', 'karva chauth'] },
]

const PERSON_RULES: Array<{ value: string; terms: string[] }> = [
  { value: 'wife', terms: ['wife', 'spouse'] },
  { value: 'husband', terms: ['husband'] },
  { value: 'mother', terms: ['mother', 'mom', 'mum'] },
  { value: 'father', terms: ['father', 'dad'] },
  { value: 'daughter', terms: ['daughter'] },
  { value: 'son', terms: ['son'] },
  { value: 'sister', terms: ['sister'] },
  { value: 'brother', terms: ['brother'] },
  { value: 'self', terms: ['myself', 'for myself', 'me'] },
]

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function detectValue(
  normalizedText: string,
  rules: Array<{ value: string; terms: string[] }>,
): string | undefined {
  return rules.find((rule) => includesAny(normalizedText, rule.terms))?.value
}

function normalizeAmountToken(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim().toLowerCase()
  const numeric = Number.parseFloat(cleaned.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(numeric)) return null

  if (cleaned.includes('lakh') || cleaned.endsWith('lac') || cleaned.endsWith('l')) {
    return numeric * 100000
  }
  if (cleaned.endsWith('k')) return numeric * 1000
  return numeric
}

function extractBudget(normalizedText: string): {
  preferred_budget_min?: number
  preferred_budget_max?: number
} {
  const betweenMatch = normalizedText.match(
    /(?:between|budget(?: is)?|range(?: is)?)\s*(?:inr|rs\.?|₹)?\s*([\d.,]+(?:\s*(?:k|lakh|lac|l))?)\s*(?:to|-|and)\s*(?:inr|rs\.?|₹)?\s*([\d.,]+(?:\s*(?:k|lakh|lac|l))?)/i,
  )
  if (betweenMatch) {
    const min = normalizeAmountToken(betweenMatch[1] ?? '')
    const max = normalizeAmountToken(betweenMatch[2] ?? '')
    if (min !== null && max !== null) {
      return {
        preferred_budget_min: Math.min(min, max),
        preferred_budget_max: Math.max(min, max),
      }
    }
  }

  const underMatch = normalizedText.match(
    /(?:under|below|upto|up to|less than|max(?:imum)?(?: budget)?(?: is)?)\s*(?:inr|rs\.?|₹)?\s*([\d.,]+(?:\s*(?:k|lakh|lac|l))?)/i,
  )
  if (underMatch) {
    const max = normalizeAmountToken(underMatch[1] ?? '')
    if (max !== null) return { preferred_budget_max: max }
  }

  const overMatch = normalizedText.match(
    /(?:above|over|more than|min(?:imum)?(?: budget)?(?: is)?)\s*(?:inr|rs\.?|₹)?\s*([\d.,]+(?:\s*(?:k|lakh|lac|l))?)/i,
  )
  if (overMatch) {
    const min = normalizeAmountToken(overMatch[1] ?? '')
    if (min !== null) return { preferred_budget_min: min }
  }

  const directBudgetMatch = normalizedText.match(
    /(?:budget(?: is)?|price(?: range)?(?: is)?)\s*(?:inr|rs\.?|₹)?\s*([\d.,]+(?:\s*(?:k|lakh|lac|l))?)/i,
  )
  if (directBudgetMatch) {
    const amount = normalizeAmountToken(directBudgetMatch[1] ?? '')
    if (amount !== null) {
      return {
        preferred_budget_min: amount,
        preferred_budget_max: amount,
      }
    }
  }

  return {}
}

function parseExplicitDate(rawDate: string): string | null {
  const trimmed = rawDate.trim().replace(/\s+/g, ' ')
  const now = new Date()
  const formats = [
    'yyyy-MM-dd',
    'dd-MM-yyyy',
    'd-M-yyyy',
    'dd/MM/yyyy',
    'd/M/yyyy',
    'MMMM d, yyyy',
    'MMM d, yyyy',
    'd MMMM yyyy',
    'd MMM yyyy',
    'MMMM d',
    'MMM d',
    'd MMMM',
    'd MMM',
  ]

  for (const format of formats) {
    const parsed = parse(trimmed, format, now)
    if (!isValid(parsed)) continue

    const needsCurrentYear = !/[yY]/.test(format)
    if (needsCurrentYear) parsed.setFullYear(now.getFullYear())

    return parsed.toISOString().slice(0, 10)
  }

  return null
}

function extractSpecialDates(normalizedText: string): ExtractedSpecialDate[] {
  const results: ExtractedSpecialDate[] = []
  const patterns: Array<{
    occasionType: OccasionType
    promptKey: PromptKey
    regex: RegExp
    occasionName: string | null
  }> = [
    {
      occasionType: 'birthday',
      promptKey: 'birthday',
      regex:
        /(?:my|our)\s+birthday\s+(?:is|on)\s+([a-z0-9,\-/ ]{4,40})/i,
      occasionName: null,
    },
    {
      occasionType: 'anniversary',
      promptKey: 'anniversary',
      regex:
        /(?:my|our|wedding)\s+anniversary\s+(?:is|on)\s+([a-z0-9,\-/ ]{4,40})/i,
      occasionName: null,
    },
  ]

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern.regex)
    if (!match?.[1]) continue
    const occasionDate = parseExplicitDate(match[1])
    if (!occasionDate) continue
    results.push({
      occasionType: pattern.occasionType,
      occasionName: pattern.occasionName,
      occasionDate,
      promptKey: pattern.promptKey,
    })
  }

  return results
}

function extractPersonalFacts(normalizedText: string): ExtractedPersonalFact[] {
  const facts: ExtractedPersonalFact[] = []
  const seen = new Set<string>()
  const person = detectValue(normalizedText, PERSON_RULES) ?? null

  if (person && person !== 'self') {
    const key = `relationship:${person}`
    if (!seen.has(key)) {
      seen.add(key)
      facts.push({
        factType: 'relationship',
        factValue: person,
        relatedPerson: person,
      })
    }
  }

  const birthdayForMatch = normalizedText.match(
    /for my (wife|husband|mother|mom|mum|father|dad|daughter|son|sister|brother)'?s birthday/i,
  )
  if (birthdayForMatch?.[1]) {
    const relatedPerson = birthdayForMatch[1].toLowerCase()
    const key = `birthday_of:${relatedPerson}`
    if (!seen.has(key)) {
      seen.add(key)
      facts.push({
        factType: 'birthday_of',
        factValue: relatedPerson,
        relatedPerson,
      })
    }
  }

  const anniversaryForMatch = normalizedText.match(
    /for my (wife|husband)'?s anniversary|our anniversary/i,
  )
  if (anniversaryForMatch) {
    const relatedPerson = normalizedText.includes('our anniversary')
      ? 'self'
      : anniversaryForMatch[1]?.toLowerCase() ?? 'spouse'
    const key = `anniversary_of:${relatedPerson}`
    if (!seen.has(key)) {
      seen.add(key)
      facts.push({
        factType: 'anniversary_of',
        factValue: relatedPerson,
        relatedPerson,
      })
    }
  }

  return facts
}

function extractSignals(text: string): ExtractedSignals {
  const normalizedText = text.trim().toLowerCase()
  const preferences: ExtractedPreferences = {}
  const promptKeys = new Set<PromptKey>()
  const occasionPerson = detectValue(normalizedText, PERSON_RULES) ?? null

  const favoriteCategory = detectValue(normalizedText, CATEGORY_RULES)
  if (favoriteCategory) {
    preferences.favorite_category = favoriteCategory
    promptKeys.add('favorite_category')
  }

  const preferredStyle = detectValue(normalizedText, STYLE_RULES)
  if (preferredStyle) {
    preferences.preferred_style = preferredStyle
    promptKeys.add('preferred_style')
  }

  const favoriteStone = detectValue(normalizedText, STONE_RULES)
  if (favoriteStone) {
    preferences.favorite_stone = favoriteStone
    promptKeys.add('favorite_stone')
  }

  const purchaseIntent = detectValue(normalizedText, INTENT_RULES)
  if (purchaseIntent) {
    preferences.purchase_intent = purchaseIntent
    promptKeys.add('purchase_intent')
  } else if (
    includesAny(normalizedText, ['purchase', 'purchasing', 'buy', 'buying'])
  ) {
    preferences.purchase_intent = occasionPerson && occasionPerson !== 'self'
      ? 'gift'
      : 'self purchase'
    promptKeys.add('purchase_intent')
  }

  const preferredOccasion = detectValue(normalizedText, OCCASION_RULES)
  if (preferredOccasion) {
    preferences.preferred_occasion = preferredOccasion
  }

  if (includesAny(normalizedText, ['gold'])) {
    preferences.preferred_metal = 'gold'
    promptKeys.add('preferred_metal')
  } else if (includesAny(normalizedText, ['silver'])) {
    preferences.preferred_metal = 'silver'
    promptKeys.add('preferred_metal')
  } else if (includesAny(normalizedText, ['platinum'])) {
    preferences.preferred_metal = 'platinum'
    promptKeys.add('preferred_metal')
  }

  const purityMatch = normalizedText.match(/\b(18k|22k|24k|916)\b/i)
  if (purityMatch?.[1]) {
    preferences.preferred_purity = purityMatch[1].toUpperCase()
    promptKeys.add('preferred_purity')
  }

  const budget = extractBudget(normalizedText)
  if (budget.preferred_budget_min !== undefined || budget.preferred_budget_max !== undefined) {
    Object.assign(preferences, budget)
    promptKeys.add('preferred_budget')
  }

  const specialDates = extractSpecialDates(normalizedText)
  for (const specialDate of specialDates) {
    promptKeys.add(specialDate.promptKey)
  }

  return {
    preferences,
    promptKeys,
    specialDates,
    personalFacts: extractPersonalFacts(normalizedText),
    occasionPerson,
  }
}

async function upsertPreferences(
  supabase: SupabaseClient,
  contactId: string,
  preferences: ExtractedPreferences,
) {
  if (Object.keys(preferences).length === 0) return

  const payload = {
    contact_id: contactId,
    ...preferences,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('contact_preferences')
    .upsert(payload, { onConflict: 'contact_id' })

  if (error) throw error
}

async function upsertSpecialDate(
  supabase: SupabaseClient,
  contactId: string,
  specialDate: ExtractedSpecialDate,
) {
  const { data: existing, error: fetchError } = await supabase
    .from('contact_special_dates')
    .select('id')
    .eq('contact_id', contactId)
    .eq('occasion_type', specialDate.occasionType)
    .limit(1)
    .maybeSingle()

  if (fetchError) throw fetchError

  const payload = {
    contact_id: contactId,
    occasion_type: specialDate.occasionType,
    occasion_name: specialDate.occasionName,
    occasion_date: specialDate.occasionDate,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('contact_special_dates')
      .update(payload)
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('contact_special_dates').insert(payload)
  if (error) throw error
}

async function markPromptAnswered(
  supabase: SupabaseClient,
  contactId: string,
  promptKey: PromptKey,
  sourceMessageId: string,
) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('contact_prompt_history')
    .upsert(
      {
        contact_id: contactId,
        prompt_key: promptKey,
        status: 'answered',
        asked_at: now,
        answered_at: now,
        source_message_id: sourceMessageId,
        updated_at: now,
      },
      { onConflict: 'contact_id,prompt_key' },
    )

  if (error) throw error
}

async function insertPreferenceEvents(
  supabase: SupabaseClient,
  args: {
    contactId: string
    sourceMessageId: string
    rawText: string
    preferences: ExtractedPreferences
    specialDates: ExtractedSpecialDate[]
    personalFacts: ExtractedPersonalFact[]
  },
) {
  const rows: Array<{
    contact_id: string
    source_message_id: string
    event_type: string
    event_key: string
    event_value: string | null
    raw_text: string
  }> = []

  for (const [key, value] of Object.entries(args.preferences)) {
    if (value === undefined || value === null || value === '') continue
    rows.push({
      contact_id: args.contactId,
      source_message_id: args.sourceMessageId,
      event_type: 'preference',
      event_key: key,
      event_value: String(value),
      raw_text: args.rawText,
    })
  }

  for (const specialDate of args.specialDates) {
    rows.push({
      contact_id: args.contactId,
      source_message_id: args.sourceMessageId,
      event_type: 'special_date',
      event_key: specialDate.occasionType,
      event_value: specialDate.occasionDate,
      raw_text: args.rawText,
    })
  }

  for (const fact of args.personalFacts) {
    rows.push({
      contact_id: args.contactId,
      source_message_id: args.sourceMessageId,
      event_type: 'personal_fact',
      event_key: fact.factType,
      event_value: fact.factValue,
      raw_text: args.rawText,
    })
  }

  if (rows.length === 0) return

  const { error } = await supabase.from('contact_preference_events').insert(rows)
  if (error) throw error
}

async function insertJewelleryPreferenceMemory(
  supabase: SupabaseClient,
  args: {
    contactId: string
    sourceMessageId: string
    rawText: string
    preferences: ExtractedPreferences
    occasionPerson: string | null
  },
) {
  const hasJewellerySignal =
    args.preferences.favorite_category ||
    args.preferences.preferred_style ||
    args.preferences.preferred_metal ||
    args.preferences.preferred_purity ||
    args.preferences.favorite_stone ||
    args.preferences.purchase_intent ||
    args.preferences.preferred_budget_min !== undefined ||
    args.preferences.preferred_budget_max !== undefined ||
    args.preferences.preferred_occasion

  if (!hasJewellerySignal) return

  const { error } = await supabase.from('contact_jewellery_preferences').insert({
    contact_id: args.contactId,
    source_message_id: args.sourceMessageId,
    category: args.preferences.favorite_category ?? null,
    style: args.preferences.preferred_style ?? null,
    metal: args.preferences.preferred_metal ?? null,
    purity: args.preferences.preferred_purity ?? null,
    stone: args.preferences.favorite_stone ?? null,
    budget_min: args.preferences.preferred_budget_min ?? null,
    budget_max: args.preferences.preferred_budget_max ?? null,
    purchase_intent: args.preferences.purchase_intent ?? null,
    occasion_type: args.preferences.preferred_occasion ?? null,
    occasion_person: args.occasionPerson,
    raw_text: args.rawText,
  })

  if (error) throw error
}

async function insertOccasionMentions(
  supabase: SupabaseClient,
  args: {
    contactId: string
    sourceMessageId: string
    rawText: string
    preferences: ExtractedPreferences
    specialDates: ExtractedSpecialDate[]
    occasionPerson: string | null
  },
) {
  const rows: Array<{
    contact_id: string
    source_message_id: string
    occasion_type: string
    person_label: string | null
    occasion_date: string | null
    raw_text: string
  }> = []

  if (args.preferences.preferred_occasion) {
    rows.push({
      contact_id: args.contactId,
      source_message_id: args.sourceMessageId,
      occasion_type: args.preferences.preferred_occasion,
      person_label: args.occasionPerson,
      occasion_date: null,
      raw_text: args.rawText,
    })
  }

  for (const specialDate of args.specialDates) {
    rows.push({
      contact_id: args.contactId,
      source_message_id: args.sourceMessageId,
      occasion_type: specialDate.occasionType,
      person_label: args.occasionPerson,
      occasion_date: specialDate.occasionDate,
      raw_text: args.rawText,
    })
  }

  if (rows.length === 0) return

  const { error } = await supabase.from('contact_occasion_mentions').insert(rows)
  if (error) throw error
}

async function insertPersonalFacts(
  supabase: SupabaseClient,
  args: {
    contactId: string
    sourceMessageId: string
    rawText: string
    personalFacts: ExtractedPersonalFact[]
  },
) {
  if (args.personalFacts.length === 0) return

  const { error } = await supabase.from('contact_personal_facts').insert(
    args.personalFacts.map((fact) => ({
      contact_id: args.contactId,
      source_message_id: args.sourceMessageId,
      fact_type: fact.factType,
      fact_value: fact.factValue,
      related_person: fact.relatedPerson,
      raw_text: args.rawText,
    })),
  )

  if (error) throw error
}

export async function captureContactPreferencesFromInbound(args: {
  supabase: SupabaseClient
  contactId: string
  sourceMessageId: string
  inboundText: string | null
}) {
  const inboundText = args.inboundText?.trim()
  if (!inboundText) return

  const extracted = extractSignals(inboundText)
  const hasPreferences = Object.keys(extracted.preferences).length > 0
  const hasSpecialDates = extracted.specialDates.length > 0
  const hasPromptKeys = extracted.promptKeys.size > 0
  const hasPersonalFacts = extracted.personalFacts.length > 0

  if (!hasPreferences && !hasSpecialDates && !hasPromptKeys && !hasPersonalFacts) return

  await upsertPreferences(args.supabase, args.contactId, extracted.preferences)
  await insertJewelleryPreferenceMemory(args.supabase, {
    contactId: args.contactId,
    sourceMessageId: args.sourceMessageId,
    rawText: inboundText,
    preferences: extracted.preferences,
    occasionPerson: extracted.occasionPerson,
  })

  for (const specialDate of extracted.specialDates) {
    await upsertSpecialDate(args.supabase, args.contactId, specialDate)
  }

  await insertOccasionMentions(args.supabase, {
    contactId: args.contactId,
    sourceMessageId: args.sourceMessageId,
    rawText: inboundText,
    preferences: extracted.preferences,
    specialDates: extracted.specialDates,
    occasionPerson: extracted.occasionPerson,
  })

  await insertPersonalFacts(args.supabase, {
    contactId: args.contactId,
    sourceMessageId: args.sourceMessageId,
    rawText: inboundText,
    personalFacts: extracted.personalFacts,
  })

  await insertPreferenceEvents(args.supabase, {
    contactId: args.contactId,
    sourceMessageId: args.sourceMessageId,
    rawText: inboundText,
    preferences: extracted.preferences,
    specialDates: extracted.specialDates,
    personalFacts: extracted.personalFacts,
  })

  for (const promptKey of extracted.promptKeys) {
    await markPromptAnswered(
      args.supabase,
      args.contactId,
      promptKey,
      args.sourceMessageId,
    )
  }
}
