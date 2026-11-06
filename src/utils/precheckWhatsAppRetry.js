/**
 * Cron ledger retry policy for PreCheck WhatsApp sends.
 * Force sends use unique keys and are not covered here.
 */

export const PRECHECK_WA_RETRY = {
  /** Wait before retrying a failed / undelivered / canceled send. */
  backoffMs: 15 * 60 * 1000,
  /** Stuck `queued` older than this may be retried (interrupted send). */
  queuedStaleMs: 15 * 60 * 1000,
  /** Max Twilio attempts for one cron idempotency key. */
  maxAttempts: 5,
};

const SUCCESS_STATUSES = new Set(['sent', 'delivered', 'read', 'accepted']);
const FAILURE_STATUSES = new Set(['failed', 'undelivered', 'canceled']);

/**
 * @param {{ status?: string|null, updated_at?: string|null, attempt_count?: number|null }} row
 * @param {number} [nowMs]
 * @returns {boolean} true when cron must not send again for this key
 */
export function isCronSendBlocked(row, nowMs = Date.now()) {
  if (!row) return false;
  const status = String(row.status || '').toLowerCase();
  const attempts = Number(row.attempt_count) > 0 ? Number(row.attempt_count) : 1;
  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : NaN;
  const ageMs = Number.isFinite(updatedAt) ? Math.max(0, nowMs - updatedAt) : 0;

  if (SUCCESS_STATUSES.has(status)) return true;

  if (status === 'queued') {
    return ageMs < PRECHECK_WA_RETRY.queuedStaleMs;
  }

  if (FAILURE_STATUSES.has(status)) {
    if (attempts >= PRECHECK_WA_RETRY.maxAttempts) return true;
    return ageMs < PRECHECK_WA_RETRY.backoffMs;
  }

  // Unknown status: treat as blocking to be safe
  return true;
}

/**
 * @param {{ status?: string|null, updated_at?: string|null, attempt_count?: number|null }} row
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function canRetryCronSend(row, nowMs = Date.now()) {
  return Boolean(row) && !isCronSendBlocked(row, nowMs);
}
