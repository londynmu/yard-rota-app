import { CHUNK_ERROR_REGEXES, isChunkLoadError } from './chunkLoadError';

describe('isChunkLoadError', () => {
  test('recognises Safari, Chrome, Firefox and webpack-style messages', () => {
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('boom'), { name: 'ChunkLoadError' }))).toBe(true);
  });

  test('ignores unrelated errors and empty values', () => {
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('CHUNK_ERROR_REGEXES', () => {
  test('match inside longer messages, case-insensitive', () => {
    const msg = 'Error Boundary caught an error: TypeError: Importing a module script failed.';
    expect(CHUNK_ERROR_REGEXES.some((re) => re.test(msg))).toBe(true);
    expect(CHUNK_ERROR_REGEXES.some((re) => re.test('Error fetching rota'))).toBe(false);
  });
});
