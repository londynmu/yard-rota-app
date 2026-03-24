/**
 * Fixes legacy avatar URLs where the object key used a redundant `avatars/` prefix
 * inside the `avatars` or `user-avatars` bucket (double path segment in public URL).
 */
export function normalizeAvatarStorageUrl(url) {
  if (url == null || url === '') return url;
  let u = String(url).trim();
  u = u.replace(/\/avatars\/avatars\//g, '/avatars/');
  u = u.replace(/\/user-avatars\/avatars\//g, '/user-avatars/');
  return u;
}

/**
 * Parse Supabase Storage public URL into bucket + object path for `.remove()`.
 */
export function parseAvatarStorageRef(url) {
  if (!url || typeof url !== 'string') return null;
  const n = normalizeAvatarStorageUrl(url);
  const m = n.match(/\/object\/public\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], objectPath: decodeURIComponent(m[2]) };
}
