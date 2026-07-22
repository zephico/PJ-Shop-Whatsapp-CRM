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

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.3gp', '.3gpp'];
const DOCUMENT_EXTENSIONS = ['.pdf'];

/**
 * Meta template-creation handles (Resumable Upload `4::…` / `4:…`) are NOT
 * reusable WhatsApp `/media` ids. Using them makes the send API return 200
 * but Meta fails delivery seconds later.
 */
export function isTemplateCreationMediaHandle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('::')) return true;
  if (/^4:[A-Za-z0-9_:+-]+/.test(trimmed)) return true;
  return false;
}

/** Validate a send-time Meta media id from a prior /media upload. */
export function validateSendTimeMediaId(id: string): void {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error('Header media ID is empty.');
  }
  if (isTemplateCreationMediaHandle(trimmed)) {
    throw new Error(
      'That value is a template approval handle from Meta, not a send-time media ID. ' +
        'Leave Header media ID empty and paste a direct HTTPS video link instead.',
    );
  }
}

/** Validate a send-time media URL before it reaches Meta. */
export function validateHeaderMediaUrl(url: string): void {
  validateHeaderMediaUrlForType(url, 'image');
}

/** Validate a send-time media URL for a specific header kind. */
export function validateHeaderMediaUrlForType(
  url: string,
  headerType: MediaHeaderType,
): void {
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
      'Do not use Next.js image proxy URLs. Paste the direct asset link (e.g. cdn.shopify.com/...mp4) — Meta’s servers cannot fetch _next/image URLs.',
    );
  }

  if (headerType === 'video') {
    const path = parsed.pathname.toLowerCase();
    const looksLikeVideo =
      VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext)) ||
      path.includes('/video') ||
      path.includes('.mp4');
    if (!looksLikeVideo) {
      throw new Error(
        'Header video URL must be a direct link to an MP4/3GP file (e.g. …/promo.mp4), not a product or watch page.',
      );
    }
  }

  if (headerType === 'document') {
    const path = parsed.pathname.toLowerCase();
    if (!DOCUMENT_EXTENSIONS.some((ext) => path.endsWith(ext))) {
      throw new Error(
        'Header document URL must be a direct link to a PDF file.',
      );
    }
  }
}

/** Best-effort MIME type for a public video header URL. */
export function inferVideoMimeType(url: string): string {
  const lower = resolveHeaderMediaUrl(url).toLowerCase();
  if (lower.endsWith('.3gp') || lower.endsWith('.3gpp')) {
    return 'video/3gpp';
  }
  return 'video/mp4';
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
