/**
 * Normalize avatar public URLs.
 *
 * Nested keys inside the `avatars` bucket (`avatars/file.jpg`) produce a public
 * URL with a double path segment (`…/object/public/avatars/avatars/file.jpg`).
 * That double segment is correct — do not strip it.
 *
 * Legacy `user-avatars` uploads sometimes stored an extra `avatars/` prefix;
 * collapse that bucket's double segment only.
 */
export function normalizeAvatarStorageUrl(url) {
  if (url == null || url === '') return url;
  let u = String(url).trim();
  u = u.replace(/\/user-avatars\/avatars\//g, '/user-avatars/');
  return u;
}

/**
 * Parse Supabase Storage public URL into bucket + object path for `.remove()`.
 * Nested avatars keys stay as `objectPath: "avatars/…"`.
 */
export function parseAvatarStorageRef(url) {
  if (!url || typeof url !== 'string') return null;
  const n = normalizeAvatarStorageUrl(url);
  const m = n.match(/\/object\/public\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], objectPath: decodeURIComponent(m[2]) };
}
