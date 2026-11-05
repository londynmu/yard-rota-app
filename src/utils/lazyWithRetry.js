import { lazy } from 'react';
import { isChunkLoadError } from './chunkLoadError';

/**
 * Wrapper for React.lazy that adds retry logic for failed chunk loads
 * This helps handle the case where users have stale JS after a deployment
 * @param {Function} componentImport - The dynamic import function
 * @param {number} retries - Number of retry attempts (default: 2)
 * @param {number} delay - Delay between retries in ms (default: 1000)
 */
export const lazyWithRetry = (componentImport, retries = 2, delay = 1000) => {
  return lazy(() => {
    const retryImport = (attemptsLeft) => {
      return componentImport().catch((error) => {
        const isChunkError =
          isChunkLoadError(error) || String(error).toLowerCase().includes('failed to fetch');

        if (attemptsLeft > 0 && isChunkError) {
          console.log(`[lazyWithRetry] Chunk load failed, retrying... (${attemptsLeft} attempts left)`);
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(retryImport(attemptsLeft - 1));
            }, delay);
          });
        }

        throw error;
      });
    };

    return retryImport(retries);
  });
};
