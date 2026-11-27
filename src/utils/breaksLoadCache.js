/**
 * Short TTL + single-flight caches for Breaks page load.
 * Collapses React Strict Mode double-mount and rapid remounts.
 */

const TTL_MS = 60_000;

/** @type {{ at: number, locations: object[] } | null} */
let locationsCache = null;
/** @type {Promise<object[]> | null} */
let locationsInFlight = null;

/** @type {Map<string, { at: number, profiles: object[] }>} */
const profilesByIdsCache = new Map();
/** @type {Map<string, Promise<object[]>>} */
const profilesByIdsInFlight = new Map();

/** @type {Map<string, { at: number, avgByUser: Record<string, number> }>} */
const preferredCache = new Map();
/** @type {Map<string, Promise<Record<string, number>>>} */
const preferredInFlight = new Map();

/** @type {Map<string, Promise<unknown>>} */
const breakDataInFlight = new Map();

const LOCATION_ORDER = ['Rugby', 'NRC', 'Nuneaton'];

export function sortBreakLocations(locations) {
  return [...(locations || [])].sort((a, b) => {
    const ia = LOCATION_ORDER.indexOf(a.name);
    const ib = LOCATION_ORDER.indexOf(b.name);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * @param {(supabase: import('@supabase/supabase-js').SupabaseClient) => Promise<object[]>} loader
 */
export async function fetchActiveLocationsCached(loader) {
  const now = Date.now();
  if (locationsCache && now - locationsCache.at < TTL_MS) {
    return locationsCache.locations;
  }
  if (locationsInFlight) return locationsInFlight;

  locationsInFlight = (async () => {
    try {
      const rows = sortBreakLocations(await loader());
      locationsCache = { at: Date.now(), locations: rows };
      return rows;
    } finally {
      locationsInFlight = null;
    }
  })();

  return locationsInFlight;
}

function idsKey(ids) {
  return [...ids].sort().join(',');
}

/**
 * @param {string[]} ids
 * @param {(ids: string[]) => Promise<object[]>} loader
 */
export async function fetchProfilesByIdsCached(ids, loader) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return [];

  const key = idsKey(unique);
  const now = Date.now();
  const hit = profilesByIdsCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.profiles;

  const inflight = profilesByIdsInFlight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const profiles = await loader(unique);
      profilesByIdsCache.set(key, { at: Date.now(), profiles: profiles || [] });
      return profiles || [];
    } finally {
      profilesByIdsInFlight.delete(key);
    }
  })();

  profilesByIdsInFlight.set(key, promise);
  return promise;
}

/**
 * @param {string} shiftType
 * @param {() => Promise<Record<string, number>>} loader
 */
export async function fetchPreferredBreakMinutesCached(shiftType, loader) {
  const key = String(shiftType || '').toLowerCase();
  if (!key) return {};

  const now = Date.now();
  const hit = preferredCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.avgByUser;

  const inflight = preferredInFlight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const avgByUser = (await loader()) || {};
      preferredCache.set(key, { at: Date.now(), avgByUser });
      return avgByUser;
    } finally {
      preferredInFlight.delete(key);
    }
  })();

  preferredInFlight.set(key, promise);
  return promise;
}

/**
 * Dedupes concurrent identical break-board loads (Strict Mode / remount).
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
export function singleFlightBreakData(key, loader) {
  const existing = breakDataInFlight.get(key);
  if (existing) return /** @type {Promise<T>} */ (existing);

  const promise = (async () => {
    try {
      return await loader();
    } finally {
      breakDataInFlight.delete(key);
    }
  })();

  breakDataInFlight.set(key, promise);
  return promise;
}

/** Test helper */
export function __resetBreaksLoadCacheForTests() {
  locationsCache = null;
  locationsInFlight = null;
  profilesByIdsCache.clear();
  profilesByIdsInFlight.clear();
  preferredCache.clear();
  preferredInFlight.clear();
  breakDataInFlight.clear();
}
