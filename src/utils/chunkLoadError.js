const CHUNK_LOAD_PATTERNS = [
  'loading chunk',
  'loading css chunk',
  'dynamically imported module',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'chunkloaderror',
  'loading module',
  'failed to load module script',
  'importing a module script failed',
];

/** True when a lazy-loaded file is missing, including Safari's iPhone wording. */
export function isChunkLoadError(error) {
  if (!error) return false;

  const errorString = String(error).toLowerCase();
  const errorMessage = String(error?.message || '').toLowerCase();

  return CHUNK_LOAD_PATTERNS.some((pattern) =>
    errorString.includes(pattern) || errorMessage.includes(pattern)
  );
}
