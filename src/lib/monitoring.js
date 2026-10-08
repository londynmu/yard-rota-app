import { CHUNK_ERROR_REGEXES } from '../utils/chunkLoadError';

const dsn = import.meta.env.VITE_SENTRY_DSN;

let sentry = null;
let pendingUserId;

/** Loads Sentry only when a DSN is configured, so it adds no weight to builds without it. */
export async function initMonitoring() {
  if (!dsn || import.meta.env.DEV) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      release: __BUILD_TIMESTAMP__,
      environment: import.meta.env.MODE,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
      ignoreErrors: [
        ...CHUNK_ERROR_REGEXES,
        /ResizeObserver loop/i,
        // Offline / flaky mobile signal in the yard, not app bugs
        /Failed to fetch/i,
        /Load failed/i,
        /NetworkError when attempting to fetch resource/i,
      ],
    });
    sentry = Sentry;
    if (pendingUserId !== undefined) setMonitoringUser(pendingUserId);
  } catch (err) {
    console.warn('[monitoring] Sentry failed to load:', err);
  }
}

export function reportError(error, extra) {
  sentry?.captureException(error, extra ? { extra } : undefined);
}

export function setMonitoringUser(userId) {
  pendingUserId = userId;
  sentry?.setUser(userId ? { id: userId } : null);
}
