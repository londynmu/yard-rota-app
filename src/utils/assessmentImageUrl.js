/** Bucket used for driver assessment paper-form photos. */
export const ASSESSMENT_IMAGES_BUCKET = 'shunter-assessments';

const PUBLIC_MARKERS = [
  `/storage/v1/object/public/${ASSESSMENT_IMAGES_BUCKET}/`,
  `/storage/v1/object/sign/${ASSESSMENT_IMAGES_BUCKET}/`,
];

/**
 * Extract a storage object path from a public URL, signed URL, or raw path.
 * @param {string|null|undefined} urlOrPath
 * @returns {string|null}
 */
export function extractAssessmentStoragePath(urlOrPath) {
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
        return decodeURIComponent(pathname.slice(idx + marker.length));
      }
    }
    const match = pathname.match(
      /\/storage\/v1\/object\/(?:public|sign)\/shunter-assessments\/(.+)$/,
    );
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    // not a URL
  }

  return null;
}

/**
 * Create a short-lived signed URL for an assessment image path or stored URL.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} urlOrPath
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string|null>}
 */
export async function createAssessmentSignedUrl(supabase, urlOrPath, expiresIn = 3600) {
  const path = extractAssessmentStoragePath(urlOrPath);
  if (!path || !supabase?.storage) return null;

  const { data, error } = await supabase.storage
    .from(ASSESSMENT_IMAGES_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data?.signedUrl || null;
}

/**
 * Resolve many stored URLs/paths to signed display URLs.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} urls
 * @param {number} [expiresIn=3600]
 * @returns {Promise<string[]>}
 */
export async function resolveAssessmentImageUrls(supabase, urls = [], expiresIn = 3600) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  const resolved = await Promise.all(
    list.map(async (url) => {
      try {
        return await createAssessmentSignedUrl(supabase, url, expiresIn);
      } catch (err) {
        console.warn('[resolveAssessmentImageUrls] sign failed', err);
        return null;
      }
    }),
  );
  return resolved.filter(Boolean);
}

/**
 * Build the storage path for a new assessment photo under the assessed user.
 * Path: {userId}/{assessmentId}/{filename}
 */
export function buildAssessmentImagePath(userId, assessmentId, ...segments) {
  if (!userId) throw new Error('userId is required for assessment image path');
  if (!assessmentId) throw new Error('assessmentId is required for assessment image path');
  const parts = segments
    .flat()
    .filter(Boolean)
    .map((s) => String(s).replace(/^\/+|\/+$/g, ''));
  return [userId, assessmentId, ...parts].join('/');
}
