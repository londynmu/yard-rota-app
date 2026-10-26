import { describe, expect, it, vi } from 'vitest';
import {
  absentShiftKey,
  getAbsentShiftKeysForDates,
  getAbsentUserIdsForDates,
  isBreakAbsent,
} from './attendanceHelpers';

function mockSupabase({ rota, rotaError, attendance, attendanceError }) {
  return {
    from(table) {
      if (table === 'scheduled_rota') {
        return {
          select() {
            return {
              in() {
                return {
                  not() {
                    return Promise.resolve({ data: rota, error: rotaError || null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'attendance') {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: attendance, error: attendanceError || null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('attendanceHelpers', () => {
  it('hides break only for same person + date + shift type', async () => {
    const supabase = mockSupabase({
      rota: [
        { id: 'r1', user_id: 'u1', date: '2026-08-09', shift_type: 'day' },
        { id: 'r2', user_id: 'u1', date: '2026-08-08', shift_type: 'night' },
        { id: 'r3', user_id: 'u2', date: '2026-08-09', shift_type: 'day' },
      ],
      attendance: [{ scheduled_rota_id: 'r1' }],
    });

    const keys = await getAbsentShiftKeysForDates(supabase, ['2026-08-08', '2026-08-09']);
    expect(keys.has(absentShiftKey('u1', '2026-08-09', 'day'))).toBe(true);
    expect(keys.has(absentShiftKey('u1', '2026-08-08', 'night'))).toBe(false);
    expect(keys.has(absentShiftKey('u2', '2026-08-09', 'day'))).toBe(false);

    expect(
      isBreakAbsent(
        { user_id: 'u1', date: '2026-08-09', shift_type: 'day' },
        keys
      )
    ).toBe(true);
    expect(
      isBreakAbsent(
        { user_id: 'u1', date: '2026-08-08', shift_type: 'night' },
        keys
      )
    ).toBe(false);
  });

  it('DB error is not treated as nobody absent', async () => {
    const supabase = mockSupabase({
      rota: [{ id: 'r1', user_id: 'u1', date: '2026-08-09', shift_type: 'day' }],
      attendanceError: { message: 'network down', code: 'PGRST000' },
    });

    await expect(getAbsentShiftKeysForDates(supabase, ['2026-08-09'])).rejects.toBeTruthy();
    await expect(getAbsentUserIdsForDates(supabase, ['2026-08-09'])).rejects.toBeTruthy();
  });

  it('rota fetch error also throws', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = mockSupabase({
      rotaError: { message: 'rota failed' },
    });
    await expect(getAbsentShiftKeysForDates(supabase, ['2026-08-09'])).rejects.toBeTruthy();
    warn.mockRestore();
  });
});
