/** Bucket used for pre-check / during-shift damage photos. */
export const PRECHECK_IMAGES_BUCKET = 'precheck-images';

const PUBLIC_MARKERS = [
  `/storage/v1/object/public/${PRECHECK_IMAGES_BUCKET}/`,
  `/storage/v1/object/sign/${PRECHECK_IMAGES_BUCKET}/`,
];

/**
 * Extract a storage object path from a public URL, signed URL, or raw path.
 * @param {string|null|undefined} urlOrPath
 * @returns {string|null}
 */
export function extractPrecheckStoragePath(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('://') && !trimmed.startsWith('/')) {
    return trimmed.replace(/^\/*/, '');
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname || '';
    for (const marker of PUBLIC_MARKERS) {
      const idx = pathname.indexOf(marker);
      if (idx !== -1) {
        const rest = pathname.slice(idx + marker.length);
        // Signed URLs may include a token path segment after the object path
        // in query string only — path is the object key.
        return decodeURIComponent(rest);
      }
    }
    // Fallback: /object/public|sign/precheck-images/<path>
    const match = pathname.match(
      /\/storage\/v1\/object\/(?:public|sign)\/precheck-images\/(.+)$/,
    );
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    // not a URL
  }

  return null;
}

/**
 * Create a short-lived signed URL for a precheck image path or stored public URL.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} urlOrPath
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string|null>}
 */
export async function createPrecheckSignedUrl(supabase, urlOrPath, expiresIn = 3600) {
  const path = extractPrecheckStoragePath(urlOrPath);
  if (!path || !supabase?.storage) return null;

  const { data, error } = await supabase.storage
    .from(PRECHECK_IMAGES_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data?.signedUrl || null;
}

/**
 * Resolve many stored URLs/paths to signed display URLs.
 * On sign failure, falls back to the original value (useful while bucket is still public).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} urls
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string[]>}
 */
export async function resolvePrecheckImageUrls(supabase, urls = [], expiresIn = 3600) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  return Promise.all(
    list.map(async (url) => {
      try {
        const signed = await createPrecheckSignedUrl(supabase, url, expiresIn);
        return signed || url;
      } catch {
        return url;
      }
    }),
  );
}

/**
 * Build the storage path for a new upload under the caller's uid prefix.
 * Required once the bucket policies require own-path inserts.
 */
export function buildPrecheckImagePath(userId, ...segments) {
  if (!userId) throw new Error('userId is required for precheck image path');
  const parts = segments
    .flat()
    .filter(Boolean)
    .map((s) => String(s).replace(/^\/+|\/+$/g, ''));
  return [userId, ...parts].join('/');
}
