import { describe, expect, it } from 'vitest';
import {
  headerMediaRequiredError,
  inferVideoMimeType,
  isTemplateCreationMediaHandle,
  resolveHeaderMediaUrl,
  validateHeaderMediaUrl,
  validateHeaderMediaUrlForType,
  validateSendTimeMediaId,
} from './template-header-media';

describe('headerMediaRequiredError', () => {
  it('returns a clear image-header message', () => {
    expect(headerMediaRequiredError('image')).toMatch(/image header/i);
    expect(headerMediaRequiredError('image')).toMatch(/media ID/i);
  });
});

describe('validateHeaderMediaUrl', () => {
  it('accepts a public HTTPS URL', () => {
    expect(() =>
      validateHeaderMediaUrl('https://cdn.example.com/product-image.jpg'),
    ).not.toThrow();
  });

  it('rejects non-HTTPS URLs', () => {
    expect(() =>
      validateHeaderMediaUrl('http://cdn.example.com/product-image.jpg'),
    ).toThrow(/HTTPS/);
  });

  it('unwraps Next.js image proxy URLs to the inner CDN link', () => {
    expect(
      resolveHeaderMediaUrl(
        'https://pradeepjewellers.in/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2Fa.jpg',
      ),
    ).toBe('https://cdn.shopify.com/s/files/a.jpg');
  });

  it('accepts Next.js proxy URLs when inner CDN url can be extracted', () => {
    expect(() =>
      validateHeaderMediaUrl(
        'https://shop.example/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fa.jpg',
      ),
    ).not.toThrow();
  });

  it('rejects bare Next.js proxy without inner url', () => {
    expect(() =>
      validateHeaderMediaUrl('https://shop.example/_next/image?w=1080'),
    ).toThrow(/direct asset link/i);
  });
});

describe('validateHeaderMediaUrlForType', () => {
  it('requires a direct mp4 link for video headers', () => {
    expect(() =>
      validateHeaderMediaUrlForType(
        'https://pradeepjewellers.in/products/pendant',
        'video',
      ),
    ).toThrow(/direct link to an MP4/i);
  });

  it('accepts a direct mp4 link for video headers', () => {
    expect(() =>
      validateHeaderMediaUrlForType(
        'https://cdn.shopify.com/videos/promo.mp4',
        'video',
      ),
    ).not.toThrow();
  });
});

describe('validateSendTimeMediaId', () => {
  it('rejects template approval handles', () => {
    expect(() => validateSendTimeMediaId('4::aW1hZ2U')).toThrow(
      /approval handle/i,
    );
    expect(() => validateSendTimeMediaId('4:PHAsset:abc123')).toThrow(
      /approval handle/i,
    );
  });

  it('allows numeric ids from a prior /media upload', () => {
    expect(() => validateSendTimeMediaId('4083134695150757')).not.toThrow();
  });
});

describe('isTemplateCreationMediaHandle', () => {
  it('detects resumable handle prefixes', () => {
    expect(isTemplateCreationMediaHandle('4::abc')).toBe(true);
    expect(isTemplateCreationMediaHandle('4:PHAsset:abc')).toBe(true);
    expect(isTemplateCreationMediaHandle('4083134695150757')).toBe(false);
  });
});

describe('inferVideoMimeType', () => {
  it('defaults to mp4', () => {
    expect(inferVideoMimeType('https://cdn.example.com/a.mp4')).toBe(
      'video/mp4',
    );
  });
});
