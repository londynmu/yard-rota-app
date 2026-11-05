/**
 * Messages browsers use when a lazily loaded JS/CSS file cannot be fetched
 * (stale files after a deploy, or a dropped connection).
 * Safari: "Importing a module script failed."
 * Chrome: "Failed to fetch dynamically imported module"
 * Firefox: "error loading dynamically imported module"
 */
export const CHUNK_ERROR_PATTERNS = [
  'importing a module script failed',
  'dynamically imported module',
  'failed to load module script',
  'loading chunk',
  'loading css chunk',
  'chunkloaderror',
  'unable to preload css',
];

/** Same patterns as regexes, for Sentry `ignoreErrors`. */
export const CHUNK_ERROR_REGEXES = CHUNK_ERROR_PATTERNS.map(
  (pattern) => new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
);

export function isChunkLoadError(error) {
  if (!error) return false;
  const text = `${error.name || ''} ${error.message || ''} ${String(error)}`.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}
