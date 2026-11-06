/** Cron ledger retry policy (mirror of src/utils/precheckWhatsAppRetry.js). */

export const PRECHECK_WA_RETRY = {
  backoffMs: 15 * 60 * 1000,
  queuedStaleMs: 15 * 60 * 1000,
  maxAttempts: 5,
};

const SUCCESS_STATUSES = new Set(["sent", "delivered", "read", "accepted"]);
const FAILURE_STATUSES = new Set(["failed", "undelivered", "canceled"]);

export type LedgerRetryRow = {
  status?: string | null;
  updated_at?: string | null;
  attempt_count?: number | null;
};

export function isCronSendBlocked(
  row: LedgerRetryRow | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!row) return false;
  const status = String(row.status || "").toLowerCase();
  const attempts = Number(row.attempt_count) > 0 ? Number(row.attempt_count) : 1;
  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : NaN;
  const ageMs = Number.isFinite(updatedAt) ? Math.max(0, nowMs - updatedAt) : 0;

  if (SUCCESS_STATUSES.has(status)) return true;

  if (status === "queued") {
    return ageMs < PRECHECK_WA_RETRY.queuedStaleMs;
  }

  if (FAILURE_STATUSES.has(status)) {
    if (attempts >= PRECHECK_WA_RETRY.maxAttempts) return true;
    return ageMs < PRECHECK_WA_RETRY.backoffMs;
  }

  return true;
}

export function canRetryCronSend(
  row: LedgerRetryRow | null | undefined,
  nowMs = Date.now(),
): boolean {
  return Boolean(row) && !isCronSendBlocked(row, nowMs);
}
