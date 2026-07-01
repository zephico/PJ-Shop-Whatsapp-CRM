import { describe, expect, it } from 'vitest';
import { formatMetaApiError, metaErrorFromBody } from './meta-send-errors';

describe('metaErrorFromBody', () => {
  it('includes error_data.details when present', () => {
    expect(
      metaErrorFromBody(
        {
          error: {
            message: '(#131008) Required parameter is missing',
            error_data: { details: 'buttons: Button at index 0 requires a parameter' },
          },
        },
        'fallback',
      ),
    ).toContain('buttons: Button at index 0');
  });
});

describe('formatMetaApiError', () => {
  it('adds marketing opt-in hint for 131049', () => {
    expect(formatMetaApiError('(#131049) Something')).toMatch(/Marketing templates/i);
  });
});
