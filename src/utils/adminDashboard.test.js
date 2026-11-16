import { describe, expect, test } from 'vitest';
import { weeklyPresenceSeries } from './adminDashboard';

describe('weeklyPresenceSeries', () => {
  test('counts present as scheduled minus attendance absences', () => {
    const slots = [
      { id: 'a', date: '2026-11-16', user_id: 'u1' },
      { id: 'b', date: '2026-11-16', user_id: 'u2' },
      { id: 'c', date: '2026-11-17', user_id: 'u1' },
      { id: 'empty', date: '2026-11-17', user_id: null },
    ];
    const attendance = [{ scheduled_rota_id: 'b' }];
    expect(weeklyPresenceSeries(slots, attendance, ['2026-11-16', '2026-11-17'])).toEqual([
      { date: '2026-11-16', scheduled: 2, present: 1, absent: 1 },
      { date: '2026-11-17', scheduled: 1, present: 1, absent: 0 },
    ]);
  });
});
