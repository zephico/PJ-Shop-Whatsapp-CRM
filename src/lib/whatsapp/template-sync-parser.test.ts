import { describe, expect, it } from 'vitest';
import {
  findButtonsComponent,
  parseMetaButtons,
} from './template-sync-parser';

describe('findButtonsComponent', () => {
  it('matches BUTTONS case-insensitively', () => {
    expect(
      findButtonsComponent([
        { type: 'BODY', text: 'Hi' },
        { type: 'buttons', buttons: [{ type: 'URL', text: 'Go', url: 'https://x.com' }] },
      ]),
    ).toEqual({
      type: 'buttons',
      buttons: [{ type: 'URL', text: 'Go', url: 'https://x.com' }],
    });
  });
});

describe('parseMetaButtons', () => {
  it('parses standard button types', () => {
    const { buttons, sendNotes } = parseMetaButtons([
      { type: 'QUICK_REPLY', text: 'Yes' },
      { type: 'URL', text: 'Track', url: 'https://x.com/{{1}}', example: ['abc'] },
    ]);
    expect(buttons).toEqual([
      { type: 'QUICK_REPLY', text: 'Yes' },
      {
        type: 'URL',
        text: 'Track',
        url: 'https://x.com/{{1}}',
        example: 'abc',
      },
    ]);
    expect(sendNotes).toEqual([]);
  });

  it('preserves FLOW and PAYMENT_REQUEST buttons from Meta', () => {
    const { buttons, sendNotes } = parseMetaButtons([
      {
        type: 'FLOW',
        text: 'Book now',
        flow_id: '12345',
        flow_action: 'navigate',
      },
      { type: 'PAYMENT_REQUEST', text: 'Review and Pay' },
    ]);
    expect(buttons).toEqual([
      {
        type: 'FLOW',
        text: 'Book now',
        flow_id: '12345',
        flow_action: 'navigate',
      },
      { type: 'PAYMENT_REQUEST', text: 'Review and Pay' },
    ]);
    expect(sendNotes.length).toBe(1);
    expect(sendNotes[0]).toMatch(/payment/i);
  });

  it('parses catalog buttons as a sendable first-class type', () => {
    const { buttons } = parseMetaButtons([
      { type: 'CATALOG', text: 'View catalog' },
    ]);
    expect(buttons).toEqual([
      { type: 'CATALOG', text: 'View catalog' },
    ]);
  });

  it('parses multi-product buttons as a sendable first-class type', () => {
    const { buttons } = parseMetaButtons([
      { type: 'MPM', text: 'Browse collection' },
    ]);
    expect(buttons).toEqual([
      { type: 'MPM', text: 'Browse collection' },
    ]);
  });
});
