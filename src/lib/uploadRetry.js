const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const DEFAULT_RETRY_OPTIONS = {
  retries: 3,
  baseDelayMs: 600,
  maxDelayMs: 8000,
  factor: 2,
};

export const retryWithBackoff = async (task, options = {}) => {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;

  while (true) {
    try {
      return await task();
    } catch (err) {
      attempt += 1;
      if (attempt > opts.retries) throw err;
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.factor, attempt - 1),
        opts.maxDelayMs
      );
      await sleep(delay);
    }
  }
};

export const runWithConcurrency = async (items, limit, worker) => {
  if (!items || items.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(limit || 1, items.length));
  const results = new Array(items.length);
  let index = 0;

  const workers = new Array(safeLimit).fill(null).map(async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
};

export const isLikelyNetworkError = (err) => {
  if (!err) return false;
  const message = String(err.message || err).toLowerCase();
  if (message.includes('failed to fetch')) return true;
  if (message.includes('network')) return true;
  if (message.includes('timeout')) return true;
  if (message.includes('offline')) return true;
  if (err?.status === 0) return true;
  return false;
};
