import type { TemplateButton } from '@/types';

/** Buttons the wacrm editor can create and submit to Meta. */
export const EDITABLE_BUTTON_TYPES = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
  'COPY_CODE',
] as const;

export type EditableButtonType = (typeof EDITABLE_BUTTON_TYPES)[number];

export function isEditableTemplateButton(
  button: TemplateButton,
): button is Extract<TemplateButton, { type: EditableButtonType }> {
  return (EDITABLE_BUTTON_TYPES as readonly string[]).includes(button.type);
}

export function templateButtonTypeLabel(type: TemplateButton['type']): string {
  switch (type) {
    case 'QUICK_REPLY':
      return 'Quick Reply';
    case 'URL':
      return 'URL';
    case 'PHONE_NUMBER':
      return 'Phone';
    case 'COPY_CODE':
      return 'Copy Code';
    case 'FLOW':
      return 'Flow';
    case 'PAYMENT_REQUEST':
      return 'Payment';
    case 'OTP':
      return 'OTP';
    case 'META':
      return 'Meta';
  }
}

/** Buttons stored from Meta sync that wacrm cannot re-submit via the editor. */
export function isSyncOnlyTemplateButton(button: TemplateButton): boolean {
  return !isEditableTemplateButton(button);
}
