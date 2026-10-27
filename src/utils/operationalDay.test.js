import { describe, expect, it } from 'vitest';
import {
  DAY_WINDOW_START_HOUR,
  getEffectiveTodayYmd,
  getNightStartYmd,
  isInNightWindow,
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
