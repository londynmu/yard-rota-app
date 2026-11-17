import { describe, expect, it } from 'vitest';
import { mapToDbBreakType, sortBreakSlots, TM_BREAK_SHIFTS } from './tmBreakBoardConfig';

describe('tmBreakBoardConfig helpers', () => {
  it('exposes day → afternoon → night order', () => {
    expect(TM_BREAK_SHIFTS).toEqual(['Day', 'Afternoon', 'Night']);
  });

  it('maps frontend break labels to DB types', () => {
    expect(mapToDbBreakType('Break 1 (15 min)')).toBe('meal1');
    expect(mapToDbBreakType('Break 2 (45 min)')).toBe('meal2');
    expect(mapToDbBreakType('Night Break (60 min)')).toBe('night');
    expect(mapToDbBreakType('Afternoon Break (60 min)')).toBe('afternoon');
  });

  it('sorts night slots with post-midnight after evening', () => {
    const sorted = sortBreakSlots(
      [
        { start_time: '01:00' },
        { start_time: '21:00' },
        { start_time: '00:00' },
      ],
      'Night'
    );
    expect(sorted.map((s) => s.start_time)).toEqual(['21:00', '00:00', '01:00']);
  });
});
