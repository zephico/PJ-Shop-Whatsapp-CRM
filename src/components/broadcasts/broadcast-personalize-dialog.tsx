'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Broadcast, Contact, CustomField, MessageTemplate } from '@/types';
import type { VariableMapping } from '@/hooks/use-broadcast-sending';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resolveHeaderMediaUrl } from '@/lib/whatsapp/template-header-media';

type VariableType = 'static' | 'field' | 'custom_field';

const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;

const contactFields = [
  { value: 'name', label: 'Contact Name' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'email', label: 'Email Address' },
  { value: 'company', label: 'Company' },
];

const SAMPLE_CONTACT: Contact = {
  id: 'sample',
  user_id: '',
  account_id: '',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  company: 'Acme Corp',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

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

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface BroadcastPersonalizePayload {
  variables: Record<string, VariableMapping>;
  headerMediaUrl?: string;
}

interface BroadcastPersonalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  broadcast: Broadcast | null;
  /** e.g. "Send again" or "Try again for Rajath Shetty" */
  title: string;
  description?: string;
  confirmLabel?: string;
  submitting?: boolean;
  onConfirm: (payload: BroadcastPersonalizePayload) => void | Promise<void>;
}

export function BroadcastPersonalizeDialog({
  open,
  onOpenChange,
  broadcast,
  title,
  description,
  confirmLabel = 'Confirm & send',
  submitting = false,
  onConfirm,
}: BroadcastPersonalizeDialogProps) {
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [variables, setVariables] = useState<Record<string, VariableMapping>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);
  const [previewCustomValues, setPreviewCustomValues] = useState<
    Map<string, string>
  >(new Map());

  useEffect(() => {
    if (!open || !broadcast) return;

    setVariables(parseVariableMappings(broadcast.template_variables));
    setHeaderMediaUrl('');
    setTemplate(null);

    let cancelled = false;
    (async () => {
      setLoadingTemplate(true);
      const supabase = createClient();

      const [templateRes, fieldsRes, contactRes] = await Promise.all([
        supabase
          .from('message_templates')
          .select('*')
          .eq('name', broadcast.template_name)
          .eq('language', broadcast.template_language ?? 'en_US')
          .maybeSingle(),
        supabase.from('custom_fields').select('*').order('field_name'),
        supabase
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const tpl = templateRes.data as MessageTemplate | null;
      setTemplate(tpl);
      if (tpl?.header_media_url && !headerMediaUrl) {
        setHeaderMediaUrl(resolveHeaderMediaUrl(tpl.header_media_url));
      }
      setCustomFields(fieldsRes.data ?? []);

      const contact = contactRes.data ?? null;
      setPreviewContact(contact);
      if (contact) {
        const { data: customVals } = await supabase
          .from('contact_custom_values')
          .select('custom_field_id, value')
          .eq('contact_id', contact.id);
        const map = new Map<string, string>();
        for (const row of customVals ?? []) {
          map.set(row.custom_field_id, row.value ?? '');
        }
        setPreviewCustomValues(map);
      } else {
        setPreviewCustomValues(new Map());
      }

      setLoadingTemplate(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, broadcast?.id]);

  const placeholders = useMemo(() => {
    if (!template?.body_text) return [];
    const matches = template.body_text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)].sort();
  }, [template?.body_text]);

  const mediaHeaderType =
    template?.header_type === 'image' ||
    template?.header_type === 'video' ||
    template?.header_type === 'document'
      ? template.header_type
      : null;

  const headerMediaError = useMemo<'missing' | 'invalid' | null>(() => {
    if (!mediaHeaderType) return null;
    const value = headerMediaUrl.trim();
    if (!value) return 'missing';
    if (!isValidHttpUrl(value)) return 'invalid';
    return null;
  }, [mediaHeaderType, headerMediaUrl]);

  const unmappedKeys = useMemo(() => {
    const missing: string[] = [];
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      if (!mapping || !mapping.value?.trim()) {
        missing.push(placeholder);
      }
    }
    return missing;
  }, [placeholders, variables]);

  const previewText = useMemo(() => {
    if (!template) return '';
    const contact = previewContact ?? SAMPLE_CONTACT;
    let text = template.body_text;
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      let replacement = placeholder;
      if (mapping) {
        if (mapping.type === 'static' && mapping.value) {
          replacement = mapping.value;
        } else if (mapping.type === 'field' && mapping.value) {
          const fieldMap: Record<string, string | undefined> = {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            company: contact.company,
          };
          replacement = fieldMap[mapping.value] ?? placeholder;
        } else if (mapping.type === 'custom_field' && mapping.value) {
          replacement = previewCustomValues.get(mapping.value) || placeholder;
        }
      }
      text = text.replaceAll(placeholder, replacement);
    }
    return text;
  }, [template, variables, placeholders, previewContact, previewCustomValues]);

  function updateVariable(key: string, patch: Partial<VariableMapping>) {
    const current = variables[key] ?? { type: 'static' as VariableType, value: '' };
    setVariables({
      ...variables,
      [key]: { ...current, ...patch },
    });
  }

  const canConfirm =
    !loadingTemplate &&
    !!template &&
    unmappedKeys.length === 0 &&
    headerMediaError === null &&
    !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {description ??
              `Update template placeholders for ${broadcast?.template_name ?? 'this broadcast'} before sending.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {loadingTemplate ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !template ? (
            <p className="text-sm text-red-400">
              Template not found. Sync templates in Settings first.
            </p>
          ) : (
            <>
              {mediaHeaderType && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">
                      Header media
                    </p>
                  </div>
                  <Input
                    type="url"
                    value={headerMediaUrl}
                    onChange={(e) => setHeaderMediaUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="border-border bg-muted text-foreground"
                  />
                  {headerMediaError && (
                    <p className="mt-1.5 text-xs text-amber-300">
                      {headerMediaError === 'missing'
                        ? 'Media URL is required for this template.'
                        : 'Enter a valid http(s) URL.'}
                    </p>
                  )}
                </div>
              )}

              {placeholders.length === 0 && !mediaHeaderType ? (
                <p className="text-sm text-muted-foreground">
                  This template has no placeholders to edit.
                </p>
              ) : (
                placeholders.map((placeholder) => {
                  const key = placeholder.replace(/^\{\{|\}\}$/g, '');
                  const mapping = variables[key] ?? {
                    type: 'static' as VariableType,
                    value: '',
                  };

                  return (
                    <div
                      key={placeholder}
                      className="rounded-xl border border-border bg-card/50 p-4"
                    >
                      <span className="mb-3 inline-flex rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
                        {placeholder}
                      </span>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                            Mapping
                          </label>
                          <Select
                            value={mapping.type}
                            onValueChange={(val) =>
                              updateVariable(key, {
                                type: val as VariableType,
                                value: '',
                              })
                            }
                          >
                            <SelectTrigger className="w-full border-border bg-muted">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-border bg-popover">
                              <SelectItem value="static">Static value</SelectItem>
                              <SelectItem value="field">Contact field</SelectItem>
                              <SelectItem value="custom_field">
                                Custom field
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                            {mapping.type === 'static' ? 'Value' : 'Field'}
                          </label>
                          {mapping.type === 'static' ? (
                            <Input
                              value={mapping.value}
                              onChange={(e) =>
                                updateVariable(key, { value: e.target.value })
                              }
                              placeholder="e.g. Gold ₹72,500 / Silver ₹92,000"
                              className="border-border bg-muted text-foreground"
                            />
                          ) : mapping.type === 'field' ? (
                            <Select
                              value={mapping.value || undefined}
                              onValueChange={(val) =>
                                updateVariable(key, { value: val || '' })
                              }
                            >
                              <SelectTrigger className="w-full border-border bg-muted">
                                <SelectValue placeholder="Select field…" />
                              </SelectTrigger>
                              <SelectContent className="border-border bg-popover">
                                {contactFields.map((field) => (
                                  <SelectItem key={field.value} value={field.value}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select
                              value={mapping.value || undefined}
                              onValueChange={(val) =>
                                updateVariable(key, { value: val || '' })
                              }
                            >
                              <SelectTrigger className="w-full border-border bg-muted">
                                <SelectValue placeholder="Select custom field…" />
                              </SelectTrigger>
                              <SelectContent className="border-border bg-popover">
                                {customFields.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.field_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {placeholders.length > 0 && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-foreground">Preview</p>
                  </div>
                  <div className="rounded-lg bg-[#0e1a12] p-3">
                    <div className="ml-auto max-w-[85%] rounded-lg bg-primary/30 px-3 py-2">
                      <p className="whitespace-pre-wrap text-sm text-primary">
                        {previewText}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {unmappedKeys.length > 0 && (
                <p className="text-xs text-amber-300">
                  Fill every placeholder before sending — missing{' '}
                  {unmappedKeys.join(', ')}.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-border text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                variables,
                headerMediaUrl:
                  resolveHeaderMediaUrl(headerMediaUrl.trim()) || undefined,
              })
            }
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
