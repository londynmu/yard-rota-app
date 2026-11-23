import { describe, expect, it } from 'vitest';
import {
  formatRotaAssignmentDigestBody,
  formatRotaShiftDetailLabel,
  groupRotaAssignmentPushTargets,
  resolveNotificationShiftLabels,
  ROTA_ASSIGNMENT_PUSH_TYPE,
} from './rotaAssignmentPush';

describe('rotaAssignmentPush', () => {
  it('exposes the FCM data type constant', () => {
    expect(ROTA_ASSIGNMENT_PUSH_TYPE).toBe('rota_assignment_digest');
  });

  it('formats singular and plural digest bodies', () => {
    expect(formatRotaAssignmentDigestBody(1)).toBe(
      "You've been added to a shift. Open My Rota to check.",
    );
    expect(formatRotaAssignmentDigestBody(0)).toBe(
      "You've been added to a shift. Open My Rota to check.",
    );
    expect(formatRotaAssignmentDigestBody(3)).toBe(
      "You've been added to 3 shifts. Open My Rota to check.",
    );
  });

  it('groups due rows by user without duplicate rota ids', () => {
    const groups = groupRotaAssignmentPushTargets([
      {
        user_id: 'u1',
        scheduled_rota_id: 'r1',
        idempotency_key: 'rota_assignment_push:r1',
        fcm_token: 'tok-a',
      },
      {
        user_id: 'u1',
        scheduled_rota_id: 'r2',
        idempotency_key: 'rota_assignment_push:r2',
        fcm_token: 'tok-a',
      },
      {
        user_id: 'u1',
        scheduled_rota_id: 'r1',
        idempotency_key: 'rota_assignment_push:r1',
        fcm_token: 'tok-b',
      },
      {
        user_id: 'u2',
        scheduled_rota_id: 'r3',
        idempotency_key: 'rota_assignment_push:r3',
        fcm_token: 'tok-c',
      },
    ]);
    expect(groups).toHaveLength(2);
    const u1 = groups.find((g) => g.user_id === 'u1');
    expect(u1.count).toBe(2);
    expect(u1.scheduled_rota_ids).toEqual(['r1', 'r2']);
    expect(u1.fcm_token).toBe('tok-a');
    const u2 = groups.find((g) => g.user_id === 'u2');
    expect(u2.count).toBe(1);
  });

  it('formats shift detail labels for the inbox list', () => {
    expect(
      formatRotaShiftDetailLabel({
        date: '2026-11-24',
        location: 'NRC',
        shift_type: 'day',
        start_time: '07:00:00',
        end_time: '17:00:00',
      }),
    ).toBe('24/11/2026 · NRC · day · 07:00-17:00');
  });

  it('prefers metadata.shifts snapshot over live rota lookup', () => {
    expect(
      resolveNotificationShiftLabels({
        shifts: [{ label: '24/11/2026 · NRC · day · 07:00-17:00' }],
        scheduled_rota_ids: ['r1'],
      }),
    ).toEqual(['24/11/2026 · NRC · day · 07:00-17:00']);

    expect(
      resolveNotificationShiftLabels(
        { scheduled_rota_ids: ['r1'] },
        {
          r1: {
            date: '2026-11-25',
            location: 'Rugby',
            shift_type: 'night',
            start_time: '17:45:00',
            end_time: '06:00:00',
          },
        },
      ),
    ).toEqual(['25/11/2026 · Rugby · night · 17:45-06:00']);
  });
});
