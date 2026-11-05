import { isChunkLoadError } from './chunkLoadError';

describe('isChunkLoadError', () => {
  test('recognises the iPhone Safari module error', () => {
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  test('recognises a stale chunk after deploy', () => {
    expect(isChunkLoadError(new Error('Loading chunk 12 failed'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module'))).toBe(true);
  });

  test('ignores unrelated errors', () => {
    expect(isChunkLoadError(new TypeError('undefined is not an object'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
