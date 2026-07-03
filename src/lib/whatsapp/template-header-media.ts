/**
 * Helpers for IMAGE / VIDEO / DOCUMENT template headers at send time.
 * Meta requires a public URL or a previously uploaded media id on every
 * delivery, even when the template was approved with a sample image.
 */

export const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;

export type MediaHeaderType = (typeof MEDIA_HEADER_TYPES)[number];

export function isMediaHeaderType(
  headerType: string | null | undefined,
): headerType is MediaHeaderType {
  return (MEDIA_HEADER_TYPES as readonly string[]).includes(headerType ?? '');
}

export function headerMediaRequiredError(headerType: string): string {
  if (headerType === 'image') {
    return 'This template requires an image header. Please provide a product image URL or uploaded media ID.';
  }
  if (headerType === 'video') {
    return 'This template requires a video header. Please provide a public HTTPS video URL or uploaded media ID.';
  }
  return 'This template requires a document header. Please provide a public HTTPS document URL or uploaded media ID.';
}

const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/**
 * Unwrap Next.js / image-proxy URLs to the underlying direct asset URL.
 * Meta cannot fetch `/_next/image?url=...` — only the inner CDN link works.
 */
export function resolveHeaderMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.pathname.includes('/_next/image') ||
      parsed.pathname.includes('/_next/static/media')
    ) {
      const inner = parsed.searchParams.get('url');
      if (inner) {
        try {
          return decodeURIComponent(inner);
        } catch {
          return inner;
        }
      }
    }
  } catch {
    // Keep the original string when parsing fails.
  }

  return trimmed;
}

/** Validate a send-time media URL before it reaches Meta. */
export function validateHeaderMediaUrl(url: string): void {
  const trimmed = resolveHeaderMediaUrl(url);
  if (!trimmed) {
    throw new Error('Header media URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Header media URL must be a valid URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Header media URL must be a public HTTPS URL.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    PRIVATE_HOSTS.has(host) ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error(
      'Header media URL must be publicly reachable — not localhost or a private network address.',
    );
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('/_next/image') || lower.includes('/_next/static/media')) {
    throw new Error(
      'Do not use Next.js image proxy URLs. Paste the direct image link (e.g. cdn.shopify.com/...jpg) — Meta’s servers cannot fetch _next/image URLs.',
    );
  }
}

export function mediaHeaderFieldLabel(headerType: MediaHeaderType): string {
  switch (headerType) {
    case 'image':
      return 'Header Image URL';
    case 'video':
      return 'Header Video URL';
    case 'document':
      return 'Header Document URL';
  }
}

export function mediaHeaderFieldPlaceholder(headerType: MediaHeaderType): string {
  switch (headerType) {
    case 'image':
      return 'https://example.com/product-image.jpg';
    case 'video':
      return 'https://example.com/promo-video.mp4';
    case 'document':
      return 'https://example.com/brochure.pdf';
  }
}
