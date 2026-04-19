const AUTO_RELOAD_GUARD_KEY = 'auto_reload_guard_v1';
const RELOAD_WINDOW_MS = 90 * 1000;
const MAX_RELOADS_PER_WINDOW = 2;
const BLOCK_FOR_MS = 2 * 60 * 1000;

const memoryFallbackState = {
  attempts: [],
  blockedUntil: 0,
};

const nowMs = () => Date.now();

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

export const canAutoReload = (source = 'unknown') => {
  const state = readState();
  const now = nowMs();

  if (state.blockedUntil > now) {
    console.warn(`[reloadGuard] Auto reload blocked (${source}). Cooldown active.`);
    return false;
  }

  if (state.attempts.length >= MAX_RELOADS_PER_WINDOW) {
    writeState({
      attempts: state.attempts,
      blockedUntil: now + BLOCK_FOR_MS,
    });
    console.warn(`[reloadGuard] Auto reload blocked (${source}). Too many reloads in short time.`);
    return false;
  }

  return true;
};

export const safeAutoReload = (source = 'unknown') => {
  if (typeof window === 'undefined') return false;

  if (!canAutoReload(source)) {
    return false;
  }

  const state = readState();
  writeState({
    attempts: [...state.attempts, nowMs()],
    blockedUntil: state.blockedUntil,
  });

  window.location.reload();
  return true;
};
