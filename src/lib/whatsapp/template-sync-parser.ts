import type { TemplateButton } from '@/types';

/** Raw button object returned by GET /{waba_id}/message_templates. */
export interface MetaSyncButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[] | string;
  flow_id?: string;
  flow_name?: string;
  flow_action?: string;
  otp_type?: string;
}

export interface MetaSyncComponent {
  type: string;
  text?: string;
  format?: string;
  buttons?: MetaSyncButton[];
  example?: {
    header_text?: string[];
    header_handle?: string[];
    body_text?: string[][];
  };
}

export interface ParseMetaButtonsResult {
  buttons: TemplateButton[];
  /** Human-readable notes for types we store but cannot send yet. */
  sendNotes: string[];
}

export function findButtonsComponent(
  components: MetaSyncComponent[] | undefined,
): MetaSyncComponent | undefined {
  return (components ?? []).find((c) => c.type?.toUpperCase() === 'BUTTONS');
}

/**
 * Map Meta template buttons → local `TemplateButton[]`.
 * Previously dropped FLOW / PAYMENT_REQUEST / etc silently — now preserved.
 */
export function parseMetaButtons(
  metaButtons: MetaSyncButton[] | undefined,
): ParseMetaButtonsResult {
  if (!metaButtons?.length) {
    return { buttons: [], sendNotes: [] };
  }

  const buttons: TemplateButton[] = [];
  const sendNotes: string[] = [];

  for (const b of metaButtons) {
    const type = b.type?.toUpperCase() ?? '';
    const text = b.text?.trim() ?? '';

    switch (type) {
      case 'QUICK_REPLY':
        if (text) buttons.push({ type: 'QUICK_REPLY', text });
        break;
      case 'URL':
        if (text) {
          buttons.push({
            type: 'URL',
            text,
            url: b.url ?? '',
            example: Array.isArray(b.example) ? b.example[0] : b.example,
          });
        }
        break;
      case 'PHONE_NUMBER':
        if (text) {
          buttons.push({
            type: 'PHONE_NUMBER',
            text,
            phone_number: b.phone_number ?? '',
          });
        }
        break;
      case 'COPY_CODE':
        if (text) {
          buttons.push({
            type: 'COPY_CODE',
            text,
            example: Array.isArray(b.example)
              ? b.example[0] ?? ''
              : b.example ?? '',
          });
        }
        break;
      case 'FLOW':
        if (text) {
          buttons.push({
            type: 'FLOW',
            text,
            flow_id: b.flow_id,
            flow_name: b.flow_name,
            flow_action: b.flow_action,
          });
        }
        break;
      case 'PAYMENT_REQUEST':
        if (text) {
          buttons.push({ type: 'PAYMENT_REQUEST', text });
          sendNotes.push(
            `"${text}" is a Meta payment button — sending requires WhatsApp Payments API (not fully supported in wacrm yet).`,
          );
        }
        break;
      case 'OTP':
        if (text) {
          buttons.push({ type: 'OTP', text, otp_type: b.otp_type });
          sendNotes.push(
            `"${text}" is an OTP button — use Authentication templates from Meta directly.`,
          );
        }
        break;
      default:
        if (text) {
          buttons.push({ type: 'META', text, meta_type: type || 'UNKNOWN' });
          sendNotes.push(
            `"${text}" uses Meta button type ${type || 'UNKNOWN'} — visible after sync but not sendable from wacrm yet.`,
          );
        }
        break;
    }
  }

  return { buttons, sendNotes };
}
