/**
 * Short TTL + single-flight caches for VMU defect board load.
 * Collapses React Strict Mode double-mount and rapid remounts.
 */

const TTL_MS = 45_000;

/** @type {{ at: number, tugs: object[], checkItemLabels: Record<string, string> } | null} */
let metaCache = null;
/** @type {Promise<{ tugs: object[], checkItemLabels: Record<string, string> }> | null} */
let metaInFlight = null;

/** @type {Map<string, { at: number, rows: object[] }>} */
const damagesCache = new Map();
/** @type {Map<string, Promise<object[]>>} */
const damagesInFlight = new Map();

function damagesKey(kind, statusFilter) {
  return `${kind}:${statusFilter || ''}`;
}

/**
 * @param {() => Promise<{ tugs: object[], checkItemLabels: Record<string, string> }>} loader
 */
export async function fetchVmuMetaCached(loader) {
  const now = Date.now();
  if (metaCache && now - metaCache.at < TTL_MS) {
    return { tugs: metaCache.tugs, checkItemLabels: metaCache.checkItemLabels };
  }
  if (metaInFlight) return metaInFlight;

  metaInFlight = (async () => {
    try {
      const result = await loader();
      metaCache = {
        at: Date.now(),
        tugs: result.tugs || [],
        checkItemLabels: result.checkItemLabels || {},
      };
      return { tugs: metaCache.tugs, checkItemLabels: metaCache.checkItemLabels };
    } finally {
      metaInFlight = null;
    }
  })();

  return metaInFlight;
}

/**
 * @param {'open' | 'resolved'} kind
 * @param {string} statusFilter
 * @param {() => Promise<object[]>} loader
 */
export async function fetchVmuDamagesCached(kind, statusFilter, loader) {
  const key = damagesKey(kind, statusFilter);
  const now = Date.now();
  const hit = damagesCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.rows;

  const inflight = damagesInFlight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const rows = await loader();
      damagesCache.set(key, { at: Date.now(), rows: rows || [] });
      return rows || [];
    } finally {
      damagesInFlight.delete(key);
    }
  })();

  damagesInFlight.set(key, promise);
  return promise;
}

/** Clear caches after a successful mutation so the next load is fresh. */
export function invalidateVmuLoadCache() {
  metaCache = null;
  metaInFlight = null;
  damagesCache.clear();
  damagesInFlight.clear();
}
