const AUTO_RELOAD_GUARD_KEY = 'auto_reload_guard_v1';
const VERSION_ATTEMPT_KEY = 'version_reload_attempted_v1';
const PENDING_VERSION_KEY = 'version_reload_pending_v1';
const RELOAD_WINDOW_MS = 90 * 1000;
const MAX_RELOADS_PER_WINDOW = 2;
const BLOCK_FOR_MS = 2 * 60 * 1000;

const memoryFallbackState = {
  attempts: [],
  blockedUntil: 0,
};

let memoryAttemptedVersion = null;
let memoryPendingVersion = null;
let reloadInFlight = false;

const nowMs = () => Date.now();

export function isPrecheckPath(pathname = '') {
  return pathname === '/precheck' || pathname.startsWith('/precheck/');
}

const normalizeState = (state) => {
  const now = nowMs();
  const attempts = Array.isArray(state?.attempts)
    ? state.attempts.filter((ts) => Number.isFinite(ts) && now - ts <= RELOAD_WINDOW_MS)
    : [];
  const blockedUntil = Number.isFinite(state?.blockedUntil) ? state.blockedUntil : 0;
  return { attempts, blockedUntil };
};

const readState = () => {
  if (typeof window === 'undefined') {
    return normalizeState(memoryFallbackState);
  }

  try {
    const raw = window.sessionStorage.getItem(AUTO_RELOAD_GUARD_KEY);
    if (!raw) return normalizeState(memoryFallbackState);
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return normalizeState(memoryFallbackState);
  }
};

const writeState = (state) => {
  const normalized = normalizeState(state);
  memoryFallbackState.attempts = normalized.attempts;
  memoryFallbackState.blockedUntil = normalized.blockedUntil;

  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(AUTO_RELOAD_GUARD_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore sessionStorage write issues and rely on memory fallback.
  }
};

const readAttemptedServerVersion = () => {
  if (typeof window === 'undefined') return memoryAttemptedVersion;

  try {
    const stored = window.sessionStorage.getItem(VERSION_ATTEMPT_KEY);
    memoryAttemptedVersion = stored || null;
    return memoryAttemptedVersion;
  } catch {
    return memoryAttemptedVersion;
  }
};

const markServerVersionAttempt = (serverVersion) => {
  memoryAttemptedVersion = String(serverVersion);
  memoryPendingVersion = null;
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(VERSION_ATTEMPT_KEY, memoryAttemptedVersion);
    window.sessionStorage.removeItem(PENDING_VERSION_KEY);
  } catch {
    // Memory fallback already updated.
  }
};

export const deferServerVersion = (serverVersion) => {
  if (!serverVersion) return;
  memoryPendingVersion = String(serverVersion);
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(PENDING_VERSION_KEY, memoryPendingVersion);
  } catch {
    // Memory fallback already updated.
  }
};

export const clearDeferredServerVersion = () => {
  memoryPendingVersion = null;
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(PENDING_VERSION_KEY);
  } catch {
    // Memory fallback already updated.
  }
};

/**
 * Pure decision: may the app reload itself right now?
 * A pre-check must never be interrupted. Each server version gets one try.
 * A reload that does not pick up that version must not run again.
 */
export function shouldAutoReload({
  pathname = '/',
  serverVersion = null,
  currentVersion = null,
  attemptedVersion = null,
  now = 0,
  attempts = [],
  blockedUntil = 0,
} = {}) {
  return evaluateAutoReload({
    pathname,
    serverVersion,
    currentVersion,
    attemptedVersion,
    now,
    attempts,
    blockedUntil,
  }).allow;
}

function evaluateAutoReload({
  pathname,
  serverVersion,
  currentVersion,
  attemptedVersion,
  now,
  attempts,
  blockedUntil,
}) {
  if (isPrecheckPath(pathname)) {
    return { allow: false, reason: 'precheck' };
  }

  if (serverVersion && currentVersion && String(serverVersion) === String(currentVersion)) {
    return { allow: false, reason: 'already-current' };
  }

  if (serverVersion && attemptedVersion && String(serverVersion) === String(attemptedVersion)) {
    return { allow: false, reason: 'already-attempted' };
  }

  // Service-worker claims have no version of their own. Once a version reload
  // was already tried, another claim must not start a second refresh loop.
  if (!serverVersion && attemptedVersion) {
    return { allow: false, reason: 'version-reload-already-tried' };
  }

  if (blockedUntil > now) {
    return { allow: false, reason: 'cooldown' };
  }

  const recent = (attempts || []).filter((ts) => Number.isFinite(ts) && now - ts <= RELOAD_WINDOW_MS);
  if (recent.length >= MAX_RELOADS_PER_WINDOW) {
    return { allow: false, reason: 'too-many' };
  }

  return { allow: true, reason: 'ok' };
}

const liveDecision = (options = {}) => {
  const state = readState();
  return evaluateAutoReload({
    pathname: typeof window === 'undefined' ? '/' : window.location.pathname,
    serverVersion: options.serverVersion ?? null,
    currentVersion: options.currentVersion ?? null,
    attemptedVersion: readAttemptedServerVersion(),
    now: nowMs(),
    attempts: state.attempts,
    blockedUntil: state.blockedUntil,
  });
};

export const willAutoReload = (options = {}) => {
  if (typeof window === 'undefined' || reloadInFlight) return false;
  return liveDecision(options).allow;
};

export const canAutoReload = (source = 'unknown') => {
  const decision = liveDecision();
  if (!decision.allow) {
    console.warn(`[reloadGuard] Auto reload blocked (${source}). ${decision.reason}.`);
  }
  return decision.allow;
};

export async function clearAppCaches() {
  if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return;

  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  } catch (err) {
    console.warn('[reloadGuard] Failed to clear caches:', err);
  }
}

export const safeAutoReload = (source = 'unknown', options = {}) => {
  if (typeof window === 'undefined' || reloadInFlight) return false;

  const state = readState();
  const decision = liveDecision(options);

  if (!decision.allow) {
    if (decision.reason === 'too-many') {
      writeState({
        attempts: state.attempts,
        blockedUntil: nowMs() + BLOCK_FOR_MS,
      });
    }
    console.warn(`[reloadGuard] Auto reload blocked (${source}). ${decision.reason}.`);
    return false;
  }

  reloadInFlight = true;
  if (options.serverVersion) {
    markServerVersionAttempt(options.serverVersion);
  }

  writeState({
    attempts: [...state.attempts, nowMs()],
    blockedUntil: state.blockedUntil,
  });

  window.location.reload();
  return true;
};

/**
 * One reload for a server version, after caches are cleared.
 * On the pre-check page the reload waits until the user leaves.
 */
export async function reloadForServerVersion(serverVersion, currentVersion, source = 'unknown') {
  if (typeof window === 'undefined') return false;
  if (!serverVersion || String(serverVersion) === String(currentVersion)) {
    clearDeferredServerVersion();
    return false;
  }

  if (isPrecheckPath(window.location.pathname)) {
    deferServerVersion(serverVersion);
    return false;
  }

  if (!willAutoReload({ serverVersion, currentVersion })) {
    return false;
  }

  await clearAppCaches();
  return safeAutoReload(source, { serverVersion, currentVersion });
}
