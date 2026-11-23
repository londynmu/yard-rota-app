import { describe, expect, it, vi } from 'vitest';
import { buildPushInboxInsert } from './pushInbox';

/** Mirrors Edge `recordPushInboxRow` insert shape for a mock client. */
async function recordPushInboxRow(admin, input) {
  const row = buildPushInboxInsert(input);
  const { error } = await admin.from('notifications').insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

describe('buildPushInboxInsert', () => {
  it('maps FCM fields onto a notifications row', () => {
    expect(
      buildPushInboxInsert({
        type: 'break_reminder',
        recipientId: 'user-1',
        title: 'Yard Rota',
        message: 'Your break starts in 10 minutes (09:00)',
        metadata: {
          idempotency_key: 'break:abc:t10',
          kind: 't10',
          break_id: 'abc',
          start_hm: '09:00',
        },
      }),
    ).toEqual({
      type: 'break_reminder',
      recipient_id: 'user-1',
      title: 'Yard Rota',
      message: 'Your break starts in 10 minutes (09:00)',
      metadata: {
        idempotency_key: 'break:abc:t10',
        kind: 't10',
        break_id: 'abc',
        start_hm: '09:00',
      },
      is_read: false,
    });
  });

  it('defaults metadata to an empty object', () => {
    const row = buildPushInboxInsert({
      type: 'rota_assignment_digest',
      recipientId: 'user-2',
      title: 'Rota update',
      message: "You've been added to a shift. Open My Rota to check.",
    });
    expect(row.metadata).toEqual({});
    expect(row.is_read).toBe(false);
  });
});

describe('recordPushInboxRow (mock client)', () => {
  it('inserts into notifications and returns ok', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn(() => ({ insert })) };

    const result = await recordPushInboxRow(admin, {
      type: 'precheck_reminder',
      recipientId: 'user-3',
      title: 'Yard Rota',
      message: 'Please complete your pre-shift check.',
      metadata: { idempotency_key: 'pc:1', rota_id: 'r1' },
    });

    expect(result).toEqual({ ok: true });
    expect(admin.from).toHaveBeenCalledWith('notifications');
    expect(insert).toHaveBeenCalledWith({
      type: 'precheck_reminder',
      recipient_id: 'user-3',
      title: 'Yard Rota',
      message: 'Please complete your pre-shift check.',
      metadata: { idempotency_key: 'pc:1', rota_id: 'r1' },
      is_read: false,
    });
  });

  it('returns error without throwing when insert fails', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const admin = { from: vi.fn(() => ({ insert })) };

    const result = await recordPushInboxRow(admin, {
      type: 'break_reminder',
      recipientId: 'user-4',
      title: 'Yard Rota',
      message: 'Your break starts now (10:00)',
    });

    expect(result).toEqual({ ok: false, error: 'boom' });
  });
});
