'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Contact, MessageTemplate } from '@/types';

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv';
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  /** Contacts carrying any of these tags are subtracted from the result. */
  excludeTagIds?: string[];
}

/**
 * Variable mapping — each template placeholder (by key, usually "1",
 * "2", …) is resolved at send time. `field` maps to a built-in contact
 * field (name/phone/email/company); `custom_field` maps to a
 * contact_custom_values.value row keyed by the custom_fields.id stored
 * in `value`.
 */
export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string };

interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  /**
   * Media URL for an IMAGE/VIDEO/DOCUMENT header. Required at send
   * time for media-header templates — Meta rejects the send without
   * it. Passed through as `messageParams.headerMediaUrl`; the builder
   * falls back to the template's stored URL only when this is empty.
   */
  headerMediaUrl?: string;
}

interface BroadcastSendOverrides {
  variables?: Record<string, VariableMapping>;
  headerMediaUrl?: string;
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  resendBroadcast: (
    sourceBroadcastId: string,
    overrides?: BroadcastSendOverrides,
  ) => Promise<string>;
  addContactsToBroadcast: (
    broadcastId: string,
    contactIds: string[],
    overrides?: BroadcastSendOverrides,
  ) => Promise<{ added: number; skipped: number }>;
  retryBroadcastRecipient: (
    broadcastId: string,
    recipientId: string,
    overrides?: BroadcastSendOverrides,
  ) => Promise<void>;
  isProcessing: boolean;
  progress: number;
}

interface RecipientSendRow {
  id: string;
  contact?: Contact | null;
}

function parseAudienceFilter(
  filter: Record<string, unknown> | undefined | null,
): AudienceConfig | null {
  if (!filter || typeof filter !== 'object') return null;
  const type = filter.type;
  if (
    type !== 'all' &&
    type !== 'tags' &&
    type !== 'custom_field' &&
    type !== 'csv'
  ) {
    return null;
  }
  return {
    type,
    tagIds: Array.isArray(filter.tagIds)
      ? (filter.tagIds as string[])
      : undefined,
    customField: filter.customField as CustomFieldFilter | undefined,
    excludeTagIds: Array.isArray(filter.excludeTagIds)
      ? (filter.excludeTagIds as string[])
      : undefined,
    csvContacts: Array.isArray(filter.csvContacts)
      ? (filter.csvContacts as { phone: string; name?: string }[])
      : undefined,
  };
}

function parseVariableMappings(
  raw: Record<string, unknown> | undefined | null,
): Record<string, VariableMapping> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, VariableMapping> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== 'object') continue;
    const mapping = val as { type?: string; value?: string };
    if (
      mapping.type === 'static' ||
      mapping.type === 'field' ||
      mapping.type === 'custom_field'
    ) {
      out[key] = mapping as VariableMapping;
    }
  }
  return out;
}

/**
 * Meta rate-limit buffer. 10 per batch + 1 s pause matches the spec
 * and keeps us comfortably under Meta's per-phone-number messaging
 * rate so a large broadcast never trips the upstream limiter.
 */
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 1000;

/** `broadcast_recipients` inserts are independent of the send rate. */
const INSERT_BATCH_SIZE = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BroadcastApiResult {
  phone: string;
  status: 'sent' | 'failed';
  whatsapp_message_id?: string;
  error?: string;
}

/** contactId → (customFieldId → value). */
type CustomValueIndex = Map<string, Map<string, string>>;

/**
 * Per-contact resolution of custom-field placeholders. Static and
 * built-in-field mappings resolve synchronously; custom fields read
 * from a pre-built index to avoid N+1 queries during the send loop.
 */
export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>,
): string[] {
  // Keys are typically "1","2",... — numeric-aware sort keeps
  // {{1}} before {{10}}.
  const keys = Object.keys(variables).sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const v = variables[key];
    if (v.type === 'static') return v.value;

    if (v.type === 'field') {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fieldMap[v.value] ?? '';
    }

    // custom_field
    return customValues?.get(v.value) ?? '';
  });
}

/**
 * Bulk-fetch contact_custom_values for a set of contacts. Returns an
 * index keyed by contact_id → field_id → value.
 */
async function fetchCustomValueIndex(
  supabase: ReturnType<typeof createClient>,
  contactIds: string[],
): Promise<CustomValueIndex> {
  const index: CustomValueIndex = new Map();
  if (contactIds.length === 0) return index;

  // Supabase PostgREST caps the .in(...) IN-clause roughly at 1000
  // values. Page through to stay safe.
  const PAGE = 500;
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', slice);

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? '');
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

async function deliverRecipientBatches(params: {
  supabase: ReturnType<typeof createClient>;
  recipients: RecipientSendRow[];
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  headerMediaUrl?: string;
  setProgress?: (pct: number) => void;
  progressStart?: number;
  progressEnd?: number;
}): Promise<{ failedCount: number }> {
  const {
    supabase,
    recipients,
    template,
    variables,
    headerMediaUrl,
    setProgress,
    progressStart = 30,
    progressEnd = 95,
  } = params;

  const contactIds = recipients
    .map((r) => r.contact?.id)
    .filter((id): id is string => Boolean(id));
  const customValueIndex = await fetchCustomValueIndex(supabase, contactIds);

  let failedCount = 0;
  const totalRecipients = recipients.length;

  const headerType = template.header_type;
  const isMediaHeader =
    headerType === 'image' ||
    headerType === 'video' ||
    headerType === 'document';
  const resolvedHeaderMediaUrl = headerMediaUrl?.trim();
  const messageParams =
    isMediaHeader && resolvedHeaderMediaUrl
      ? { headerMediaUrl: resolvedHeaderMediaUrl }
      : undefined;

  for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
    const batch = recipients.slice(i, i + SEND_BATCH_SIZE);

    const apiRecipients = batch
      .filter((r) => r.contact?.phone)
      .map((r) => ({
        phone: r.contact!.phone as string,
        params: r.contact
          ? resolveVariables(
              variables,
              r.contact,
              customValueIndex.get(r.contact.id),
            )
          : [],
        ...(messageParams ? { messageParams } : {}),
      }));

    if (apiRecipients.length === 0) continue;

    try {
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: apiRecipients,
          template_name: template.name,
          template_language: template.language ?? 'en_US',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Broadcast API request failed');
      }

      const resultsByPhone = new Map<string, BroadcastApiResult>();
      for (const r of (data.results ?? []) as BroadcastApiResult[]) {
        resultsByPhone.set(r.phone, r);
      }

      for (const recipient of batch) {
        const phone = recipient.contact?.phone;
        const result = phone ? resultsByPhone.get(phone) : undefined;

        if (!result) {
          failedCount++;
          await supabase
            .from('broadcast_recipients')
            .update({
              status: 'failed',
              error_message: 'No phone number on contact',
            })
            .eq('id', recipient.id);
          continue;
        }

        if (result.status === 'sent') {
          await supabase
            .from('broadcast_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              whatsapp_message_id: result.whatsapp_message_id ?? null,
              error_message: null,
            })
            .eq('id', recipient.id);
        } else {
          failedCount++;
          await supabase
            .from('broadcast_recipients')
            .update({
              status: 'failed',
              error_message: result.error ?? 'Unknown error',
            })
            .eq('id', recipient.id);
        }
      }
    } catch (err) {
      for (const recipient of batch) {
        failedCount++;
        await supabase
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Unknown error',
          })
          .eq('id', recipient.id);
      }
    }

    if (setProgress && totalRecipients > 0) {
      const progressPct =
        progressStart +
        Math.round(((i + batch.length) / totalRecipients) * (progressEnd - progressStart));
      setProgress(progressPct);
    }

    if (i + SEND_BATCH_SIZE < recipients.length) {
      await sleep(SEND_BATCH_DELAY_MS);
    }
  }

  return { failedCount };
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const { accountId } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function resolveAudience(audience: AudienceConfig): Promise<Contact[]> {
    const supabase = createClient();

    let contacts: Contact[] = [];

    if (audience.type === 'all') {
      const { data, error } = await supabase.from('contacts').select('*');
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    } else if (
      audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0
    ) {
      const { data: contactTags, error: tagError } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);

      if (tagError)
        throw new Error(`Failed to fetch contact tags: ${tagError.message}`);

      if (contactTags && contactTags.length > 0) {
        const uniqueContactIds = [
          ...new Set(contactTags.map((ct) => ct.contact_id)),
        ];
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .in('id', uniqueContactIds);
        if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
        contacts = data ?? [];
      }
    } else if (audience.type === 'custom_field' && audience.customField) {
      contacts = await resolveCustomFieldAudience(supabase, audience.customField);
    } else if (audience.type === 'csv' && audience.csvContacts) {
      contacts = await upsertCsvContacts(supabase, audience.csvContacts);
    }

    // Apply exclude tags (works across all contact-derived audience
    // types). CSV contacts are synthetic so exclusion doesn't apply.
    if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
      const { data: excludeRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.excludeTagIds);
      const excludedIds = new Set((excludeRows ?? []).map((r) => r.contact_id));
      contacts = contacts.filter((c) => !excludedIds.has(c.id));
    }

    return contacts;
  }

  /**
   * CSV uploads arrive as raw phone/name pairs, not DB rows. Before we
   * can insert broadcast_recipients (whose contact_id FKs contacts.id),
   * we need real contacts.id UUIDs. So: look up each CSV phone in the
   * caller's contacts table; insert any that don't exist; return the
   * resolved set.
   *
   * Pre-existing implementation synthesized `csv-N` strings as
   * contact_id, which failed the UUID cast on insert — every CSV
   * broadcast silently created zero recipients.
   */
  async function upsertCsvContacts(
    supabase: ReturnType<typeof createClient>,
    csvRows: { phone: string; name?: string }[],
  ): Promise<Contact[]> {
    if (csvRows.length === 0) return [];

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error('You are not signed in.');
    }
    if (!accountId) {
      throw new Error('Your profile is not linked to an account.');
    }

    // De-duplicate by phone within the CSV (users can paste duplicates).
    const uniqueByPhone = new Map<string, { phone: string; name?: string }>();
    for (const row of csvRows) {
      if (row.phone) uniqueByPhone.set(row.phone, row);
    }
    const phones = [...uniqueByPhone.keys()];

    // Single round-trip lookup of existing contacts by phone.
    const { data: existing, error: lookupErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .in('phone', phones);
    if (lookupErr) {
      throw new Error(`Failed to look up CSV contacts: ${lookupErr.message}`);
    }

    const byPhone = new Map<string, Contact>();
    for (const c of (existing ?? []) as Contact[]) {
      if (c.phone) byPhone.set(c.phone, c);
    }

    // Insert only missing contacts, in one batch per 200 rows (PostgREST
    // has a default payload cap — 200 keeps individual requests small).
    const missing = phones
      .filter((p) => !byPhone.has(p))
      .map((phone) => ({
        user_id: user.id,
        account_id: accountId,
        phone,
        name: uniqueByPhone.get(phone)?.name ?? null,
      }));

    const INSERT_CHUNK = 200;
    for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
      const chunk = missing.slice(i, i + INSERT_CHUNK);
      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert(chunk)
        .select();
      if (insertErr) {
        throw new Error(`Failed to create CSV contacts: ${insertErr.message}`);
      }
      for (const c of (inserted ?? []) as Contact[]) {
        if (c.phone) byPhone.set(c.phone, c);
      }
    }

    // Preserve input order so analytics roughly matches the CSV order.
    return phones
      .map((p) => byPhone.get(p))
      .filter((c): c is Contact => Boolean(c));
  }

  async function resolveCustomFieldAudience(
    supabase: ReturnType<typeof createClient>,
    filter: CustomFieldFilter,
  ): Promise<Contact[]> {
    const { fieldId, operator, value } = filter;

    // Build the WHERE clause for the operator. PostgREST supports
    // eq/neq/ilike via the query builder — use ilike with wildcards
    // for "contains" so the match is case-insensitive.
    let query = supabase
      .from('contact_custom_values')
      .select('contact_id')
      .eq('custom_field_id', fieldId);

    if (operator === 'is') query = query.eq('value', value);
    else if (operator === 'is_not') query = query.neq('value', value);
    else if (operator === 'contains') query = query.ilike('value', `%${value}%`);

    const { data: matches, error: matchErr } = await query;
    if (matchErr)
      throw new Error(`Custom-field filter failed: ${matchErr.message}`);

    const contactIds = [...new Set((matches ?? []).map((m) => m.contact_id))];
    if (contactIds.length === 0) return [];

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds);
    if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
    return data ?? [];
  }

  async function resolveRecipientsFromBroadcast(
    supabase: ReturnType<typeof createClient>,
    broadcastId: string,
  ): Promise<Contact[]> {
    const { data: recs, error } = await supabase
      .from('broadcast_recipients')
      .select('contact:contacts(*)')
      .eq('broadcast_id', broadcastId);

    if (error) {
      throw new Error(`Failed to load broadcast recipients: ${error.message}`);
    }

    return (recs ?? [])
      .map((row) => {
        const contact = row.contact as Contact | Contact[] | null;
        return Array.isArray(contact) ? contact[0] ?? null : contact;
      })
      .filter((contact): contact is Contact => Boolean(contact?.id));
  }

  async function sendToContacts(params: {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
    accountId: string;
    name: string;
    template: MessageTemplate;
    audienceFilter: Record<string, unknown>;
    variables: Record<string, VariableMapping>;
    headerMediaUrl?: string;
    contacts: Contact[];
  }): Promise<string> {
    const {
      supabase,
      user,
      accountId,
      name,
      template,
      audienceFilter,
      variables,
      headerMediaUrl,
      contacts,
    } = params;

    setProgress(10);
    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: name.trim(),
        template_name: template.name,
        template_language: template.language ?? 'en_US',
        template_variables: variables,
        audience_filter: audienceFilter,
        status: 'sending',
        total_recipients: contacts.length,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      })
      .select()
      .single();

    if (broadcastError || !broadcast) {
      throw new Error(
        `Failed to create broadcast: ${broadcastError?.message ?? 'unknown error'}`,
      );
    }

    setProgress(20);
    const recipientRows = contacts.map((contact) => ({
      broadcast_id: broadcast.id,
      contact_id: contact.id,
      status: 'pending' as const,
    }));

    for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
      const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
      const { error: recipientError } = await supabase
        .from('broadcast_recipients')
        .insert(batch);
      if (recipientError) {
        await supabase
          .from('broadcasts')
          .update({
            status: 'failed',
            failed_count: contacts.length,
          })
          .eq('id', broadcast.id);
        throw new Error(
          `Failed to insert recipient batch ${i / INSERT_BATCH_SIZE + 1}: ${recipientError.message}`,
        );
      }
    }

    setProgress(30);
    const { data: recipients, error: recipientsFetchError } = await supabase
      .from('broadcast_recipients')
      .select('*, contact:contacts(*)')
      .eq('broadcast_id', broadcast.id);

    if (recipientsFetchError || !recipients) {
      throw new Error('Failed to fetch broadcast recipients');
    }

    const { failedCount } = await deliverRecipientBatches({
      supabase,
      recipients,
      template,
      variables,
      headerMediaUrl,
      setProgress,
      progressStart: 30,
      progressEnd: 95,
    });

    setProgress(95);
    const finalStatus = failedCount === recipients.length ? 'failed' : 'sent';
    await supabase
      .from('broadcasts')
      .update({ status: finalStatus })
      .eq('id', broadcast.id);

    setProgress(100);
    return broadcast.id;
  }

  async function createAndSendBroadcast(payload: BroadcastPayload): Promise<string> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      // ── Step 0: Resolve current user ──────────────────────────────
      // broadcasts.user_id is NOT NULL + guarded by RLS
      // (auth.uid() = user_id). Without this, the INSERT below was
      // silently failing with 23502 / 42501 — the wizard would
      // no-op with no feedback.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        throw new Error('You are not signed in.');
      }
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }

      // ── Step 1: Resolve audience contacts ─────────────────────────
      setProgress(5);
      const contacts = await resolveAudience(payload.audience);

      if (contacts.length === 0) {
        throw new Error('No contacts found for this audience.');
      }

      return await sendToContacts({
        supabase,
        user,
        accountId,
        name: payload.name,
        template: payload.template,
        audienceFilter: {
          type: payload.audience.type,
          tagIds: payload.audience.tagIds,
          customField: payload.audience.customField,
          excludeTagIds: payload.audience.excludeTagIds,
        },
        variables: payload.variables,
        headerMediaUrl: payload.headerMediaUrl,
        contacts,
      });
    } finally {
      setIsProcessing(false);
    }
  }

  async function resendBroadcast(
    sourceBroadcastId: string,
    overrides?: BroadcastSendOverrides,
  ): Promise<string> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        throw new Error('You are not signed in.');
      }
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }

      setProgress(5);
      const { data: source, error: sourceError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', sourceBroadcastId)
        .single();

      if (sourceError || !source) {
        throw new Error('Broadcast not found.');
      }

      if (source.status !== 'sent' && source.status !== 'failed') {
        throw new Error('Only completed broadcasts can be sent again.');
      }

      const { data: template, error: templateError } = await supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('name', source.template_name)
        .eq('language', source.template_language ?? 'en_US')
        .maybeSingle();

      if (templateError || !template) {
        throw new Error(
          `Template "${source.template_name}" is no longer available. Sync templates in Settings.`,
        );
      }

      const variables =
        overrides?.variables ??
        parseVariableMappings(
          source.template_variables as Record<string, unknown> | undefined,
        );
      const audienceFilter = parseAudienceFilter(
        source.audience_filter as Record<string, unknown> | undefined,
      );

      setProgress(8);
      let contacts: Contact[];
      if (
        audienceFilter &&
        audienceFilter.type !== 'csv' &&
        (audienceFilter.type !== 'tags' ||
          (audienceFilter.tagIds?.length ?? 0) > 0) &&
        (audienceFilter.type !== 'custom_field' || audienceFilter.customField)
      ) {
        contacts = await resolveAudience(audienceFilter);
        if (contacts.length === 0) {
          contacts = await resolveRecipientsFromBroadcast(
            supabase,
            sourceBroadcastId,
          );
        }
      } else {
        contacts = await resolveRecipientsFromBroadcast(
          supabase,
          sourceBroadcastId,
        );
      }

      if (contacts.length === 0) {
        throw new Error('No contacts found to send to.');
      }

      const headerMediaUrl =
        overrides?.headerMediaUrl ??
        (template as MessageTemplate).header_media_url ??
        undefined;

      return await sendToContacts({
        supabase,
        user,
        accountId,
        name: source.name,
        template: template as MessageTemplate,
        audienceFilter:
          (source.audience_filter as Record<string, unknown> | undefined) ??
          { type: audienceFilter?.type ?? 'tags' },
        variables,
        headerMediaUrl,
        contacts,
      });
    } finally {
      setIsProcessing(false);
    }
  }

  async function retryBroadcastRecipient(
    broadcastId: string,
    recipientId: string,
    overrides?: BroadcastSendOverrides,
  ): Promise<void> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }

      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .single();

      if (broadcastError || !broadcast) {
        throw new Error('Broadcast not found.');
      }

      if (broadcast.status === 'sending') {
        throw new Error('Wait until the broadcast finishes sending.');
      }

      const { data: recipient, error: recipientError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('id', recipientId)
        .eq('broadcast_id', broadcastId)
        .single();

      if (recipientError || !recipient) {
        throw new Error('Recipient not found.');
      }

      if (recipient.status !== 'failed') {
        throw new Error('Only failed recipients can be retried.');
      }

      const rawContact = recipient.contact as Contact | Contact[] | null;
      const contact = Array.isArray(rawContact)
        ? rawContact[0] ?? null
        : rawContact;

      if (!contact?.phone) {
        throw new Error('Contact has no phone number.');
      }

      const { data: template, error: templateError } = await supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('name', broadcast.template_name)
        .eq('language', broadcast.template_language ?? 'en_US')
        .maybeSingle();

      if (templateError || !template) {
        throw new Error(
          `Template "${broadcast.template_name}" is no longer available.`,
        );
      }

      const variables =
        overrides?.variables ??
        parseVariableMappings(
          broadcast.template_variables as Record<string, unknown> | undefined,
        );
      const customValueIndex = await fetchCustomValueIndex(supabase, [
        contact.id,
      ]);

      const headerType = (template as MessageTemplate).header_type;
      const isMediaHeader =
        headerType === 'image' ||
        headerType === 'video' ||
        headerType === 'document';
      const headerMediaUrl =
        overrides?.headerMediaUrl ??
        (template as MessageTemplate).header_media_url?.trim();
      const messageParams =
        isMediaHeader && headerMediaUrl ? { headerMediaUrl } : undefined;

      setProgress(30);

      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [
            {
              phone: contact.phone,
              params: resolveVariables(
                variables,
                contact,
                customValueIndex.get(contact.id),
              ),
              ...(messageParams ? { messageParams } : {}),
            },
          ],
          template_name: template.name,
          template_language: template.language ?? 'en_US',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Broadcast API request failed');
      }

      const result = ((data.results ?? []) as BroadcastApiResult[])[0];

      setProgress(90);

      if (result?.status === 'sent') {
        const { error: updateError } = await supabase
          .from('broadcast_recipients')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            delivered_at: null,
            read_at: null,
            replied_at: null,
            whatsapp_message_id: result.whatsapp_message_id ?? null,
            error_message: null,
          })
          .eq('id', recipientId);

        if (updateError) {
          throw new Error(updateError.message);
        }
      } else {
        const { error: updateError } = await supabase
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: result?.error ?? 'Unknown error',
          })
          .eq('id', recipientId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        throw new Error(result?.error ?? 'Send failed');
      }

      if (broadcast.status === 'failed') {
        await supabase
          .from('broadcasts')
          .update({ status: 'sent' })
          .eq('id', broadcastId);
      }

      setProgress(100);
    } finally {
      setIsProcessing(false);
    }
  }

  async function addContactsToBroadcast(
    broadcastId: string,
    contactIds: string[],
    overrides?: BroadcastSendOverrides,
  ): Promise<{ added: number; skipped: number }> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();
    const uniqueContactIds = [...new Set(contactIds.filter(Boolean))];

    try {
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }

      if (uniqueContactIds.length === 0) {
        throw new Error('Select at least one contact to add.');
      }

      setProgress(5);
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .single();

      if (broadcastError || !broadcast) {
        throw new Error('Broadcast not found.');
      }

      if (broadcast.status === 'sending') {
        throw new Error('Wait until the broadcast finishes sending.');
      }

      if (broadcast.status !== 'sent' && broadcast.status !== 'failed') {
        throw new Error('Contacts can only be added to completed broadcasts.');
      }

      const { data: template, error: templateError } = await supabase
        .from('message_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('name', broadcast.template_name)
        .eq('language', broadcast.template_language ?? 'en_US')
        .maybeSingle();

      if (templateError || !template) {
        throw new Error(
          `Template "${broadcast.template_name}" is no longer available. Sync templates in Settings.`,
        );
      }

      const variables =
        overrides?.variables ??
        parseVariableMappings(
          broadcast.template_variables as Record<string, unknown> | undefined,
        );

      if (overrides?.variables) {
        await supabase
          .from('broadcasts')
          .update({ template_variables: overrides.variables })
          .eq('id', broadcastId);
      }

      setProgress(10);
      const { data: existingRecipients, error: existingError } = await supabase
        .from('broadcast_recipients')
        .select('contact_id')
        .eq('broadcast_id', broadcastId);

      if (existingError) {
        throw new Error(`Failed to load existing recipients: ${existingError.message}`);
      }

      const existingContactIds = new Set(
        (existingRecipients ?? [])
          .map((row) => row.contact_id)
          .filter((id): id is string => Boolean(id)),
      );

      const skipped = uniqueContactIds.filter((id) =>
        existingContactIds.has(id),
      ).length;

      const newContactIds = uniqueContactIds.filter(
        (id) => !existingContactIds.has(id),
      );

      if (newContactIds.length === 0) {
        throw new Error('All selected contacts are already in this broadcast.');
      }

      setProgress(15);
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .in('id', newContactIds);

      if (contactsError) {
        throw new Error(`Failed to fetch contacts: ${contactsError.message}`);
      }

      const resolvedContacts = (contacts ?? []) as Contact[];
      if (resolvedContacts.length === 0) {
        throw new Error('No valid contacts found.');
      }

      const headerMediaUrl =
        overrides?.headerMediaUrl ??
        (template as MessageTemplate).header_media_url ??
        undefined;

      setProgress(20);
      await supabase
        .from('broadcasts')
        .update({
          status: 'sending',
          total_recipients: broadcast.total_recipients + resolvedContacts.length,
        })
        .eq('id', broadcastId);

      const recipientRows = resolvedContacts.map((contact) => ({
        broadcast_id: broadcastId,
        contact_id: contact.id,
        status: 'pending' as const,
      }));

      for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
        const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
        const { error: recipientError } = await supabase
          .from('broadcast_recipients')
          .insert(batch);
        if (recipientError) {
          throw new Error(
            `Failed to add recipients: ${recipientError.message}`,
          );
        }
      }

      setProgress(25);
      const { data: newRecipients, error: newRecipientsError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcastId)
        .in(
          'contact_id',
          resolvedContacts.map((c) => c.id),
        )
        .eq('status', 'pending');

      if (newRecipientsError || !newRecipients) {
        throw new Error('Failed to load new recipients for sending.');
      }

      await deliverRecipientBatches({
        supabase,
        recipients: newRecipients,
        template: template as MessageTemplate,
        variables,
        headerMediaUrl,
        setProgress,
        progressStart: 30,
        progressEnd: 95,
      });

      setProgress(98);
      const { data: refreshedBroadcast } = await supabase
        .from('broadcasts')
        .select('sent_count')
        .eq('id', broadcastId)
        .single();

      const finalStatus =
        (refreshedBroadcast?.sent_count ?? 0) > 0 ? 'sent' : 'failed';
      await supabase
        .from('broadcasts')
        .update({ status: finalStatus })
        .eq('id', broadcastId);

      setProgress(100);
      return { added: resolvedContacts.length, skipped };
    } finally {
      setIsProcessing(false);
    }
  }

  return {
    createAndSendBroadcast,
    resendBroadcast,
    addContactsToBroadcast,
    retryBroadcastRecipient,
    isProcessing,
    progress,
  };
}
