import { describe, expect, it } from 'vitest';
import {
  canRetryCronSend,
  isCronSendBlocked,
  PRECHECK_WA_RETRY,
} from './precheckWhatsAppRetry';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');

function isoMinutesAgo(mins) {
  return new Date(NOW - mins * 60 * 1000).toISOString();
}

describe('isCronSendBlocked / canRetryCronSend', () => {
  it('blocks successful statuses forever', () => {
    for (const status of ['sent', 'delivered', 'read', 'accepted']) {
      expect(
        isCronSendBlocked(
          { status, attempt_count: 1, updated_at: isoMinutesAgo(60) },
          NOW,
        ),
      ).toBe(true);
      expect(
        canRetryCronSend(
          { status, attempt_count: 1, updated_at: isoMinutesAgo(60) },
          NOW,
        ),
      ).toBe(false);
    }
  });

  it('blocks recent queued, allows stale queued retry', () => {
    expect(
      isCronSendBlocked(
        { status: 'queued', attempt_count: 1, updated_at: isoMinutesAgo(5) },
        NOW,
      ),
    ).toBe(true);
    expect(
      isCronSendBlocked(
        {
          status: 'queued',
          attempt_count: 1,
          updated_at: isoMinutesAgo(PRECHECK_WA_RETRY.queuedStaleMs / 60000 + 1),
        },
        NOW,
      ),
    ).toBe(false);
  });

  it('blocks failed inside backoff, allows after backoff', () => {
    expect(
      isCronSendBlocked(
        { status: 'failed', attempt_count: 1, updated_at: isoMinutesAgo(5) },
        NOW,
      ),
    ).toBe(true);
    expect(
      canRetryCronSend(
        { status: 'failed', attempt_count: 1, updated_at: isoMinutesAgo(20) },
        NOW,
      ),
    ).toBe(true);
    expect(
      canRetryCronSend(
        {
          status: 'undelivered',
          attempt_count: 2,
          updated_at: isoMinutesAgo(20),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it('caps retries at maxAttempts even after backoff', () => {
    expect(
      isCronSendBlocked(
        {
          status: 'failed',
          attempt_count: PRECHECK_WA_RETRY.maxAttempts,
          updated_at: isoMinutesAgo(60),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it('treats missing row as not blocked', () => {
    expect(isCronSendBlocked(null, NOW)).toBe(false);
  });
});
