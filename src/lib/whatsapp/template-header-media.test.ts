import { describe, expect, it } from 'vitest';
import {
  headerMediaRequiredError,
  resolveHeaderMediaUrl,
  validateHeaderMediaUrl,
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
    ).toThrow(/direct image link/i);
  });
});
