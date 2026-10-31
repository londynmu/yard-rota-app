import { describe, expect, it } from 'vitest';
import {
  DAY_WINDOW_START_HOUR,
  getEffectiveTodayYmd,
  getNightStartYmd,
  getSuggestedBreakContext,
  isInNightWindow,
  resolveBreakManagerContext,
} from './operationalDay';

function at(ymd, hour, minute = 0) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

describe('operationalDay 07:00 threshold', () => {
  it('exports day window start at 07:00', () => {
    expect(DAY_WINDOW_START_HOUR).toBe(7);
  });

  it('06:30 still uses previous calendar day as effective today', () => {
    const now = at('2026-08-09', 6, 30);
    expect(getEffectiveTodayYmd(now)).toBe('2026-08-08');
    expect(getNightStartYmd(now)).toBe('2026-08-08');
    expect(isInNightWindow(now)).toBe(true);
  });

  it('06:59 still uses previous calendar day as effective today', () => {
    const now = at('2026-08-09', 6, 59);
    expect(getEffectiveTodayYmd(now)).toBe('2026-08-08');
    expect(getNightStartYmd(now)).toBe('2026-08-08');
    expect(isInNightWindow(now)).toBe(true);
  });

  it('07:00 switches operational today to the calendar day', () => {
    const now = at('2026-08-09', 7, 0);
    expect(getEffectiveTodayYmd(now)).toBe('2026-08-09');
    expect(getNightStartYmd(now)).toBe('2026-08-09');
    expect(isInNightWindow(now)).toBe(false);
  });

  it('17:00 opens tonight night cycle on calendar today', () => {
    const now = at('2026-08-09', 17, 0);
    expect(getEffectiveTodayYmd(now)).toBe('2026-08-09');
    expect(getNightStartYmd(now)).toBe('2026-08-09');
    expect(isInNightWindow(now)).toBe(true);
  });
});

describe('getSuggestedBreakContext', () => {
  it('02:00 → Night + yesterday', () => {
    expect(getSuggestedBreakContext(at('2026-08-09', 2, 0))).toEqual({
      date: '2026-08-08',
      shift: 'Night',
    });
  });

  it('08:00 → Day + today', () => {
    expect(getSuggestedBreakContext(at('2026-08-09', 8, 0))).toEqual({
      date: '2026-08-09',
      shift: 'Day',
    });
  });

  it('14:00 → Day + today', () => {
    expect(getSuggestedBreakContext(at('2026-08-09', 14, 0))).toEqual({
      date: '2026-08-09',
      shift: 'Day',
    });
  });

  it('18:00 → Night + today', () => {
    expect(getSuggestedBreakContext(at('2026-08-09', 18, 0))).toEqual({
      date: '2026-08-09',
      shift: 'Night',
    });
  });
});

describe('resolveBreakManagerContext with sticky Night+yesterday', () => {
  const stickyDate = '2026-08-08';
  const stickyShift = 'Night';

  it('02:00 keeps open night cycle (Night + yesterday)', () => {
    expect(
      resolveBreakManagerContext(stickyDate, stickyShift, at('2026-08-09', 2, 0))
    ).toEqual({ date: '2026-08-08', shift: 'Night' });
  });

  it('08:00 corrects to Day + today', () => {
    expect(
      resolveBreakManagerContext(stickyDate, stickyShift, at('2026-08-09', 8, 0))
    ).toEqual({ date: '2026-08-09', shift: 'Day' });
  });

  it('14:00 corrects to Day + today', () => {
    expect(
      resolveBreakManagerContext(stickyDate, stickyShift, at('2026-08-09', 14, 0))
    ).toEqual({ date: '2026-08-09', shift: 'Day' });
  });

  it('18:00 corrects to Night + today', () => {
    expect(
      resolveBreakManagerContext(stickyDate, stickyShift, at('2026-08-09', 18, 0))
    ).toEqual({ date: '2026-08-09', shift: 'Night' });
  });

  it('14:00 keeps Afternoon when user chose it in day window', () => {
    expect(
      resolveBreakManagerContext('2026-08-08', 'Afternoon', at('2026-08-09', 14, 0))
    ).toEqual({ date: '2026-08-09', shift: 'Afternoon' });
  });
});
