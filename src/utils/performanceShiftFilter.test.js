import { describe, expect, it } from 'vitest';
import { matchesPerformanceShiftFilter } from './performanceShiftFilter';

describe('matchesPerformanceShiftFilter', () => {
  it('includes everyone when filter is all or empty', () => {
    expect(matchesPerformanceShiftFilter('day', 'all')).toBe(true);
    expect(matchesPerformanceShiftFilter('night', 'all')).toBe(true);
    expect(matchesPerformanceShiftFilter(null, 'all')).toBe(true);
    expect(matchesPerformanceShiftFilter('day', undefined)).toBe(true);
  });

  it('keeps only day preference for day filter', () => {
    expect(matchesPerformanceShiftFilter('day', 'day')).toBe(true);
    expect(matchesPerformanceShiftFilter('night', 'day')).toBe(false);
    expect(matchesPerformanceShiftFilter('afternoon', 'day')).toBe(false);
    expect(matchesPerformanceShiftFilter(null, 'day')).toBe(false);
  });

  it('keeps night and afternoon for night filter', () => {
    expect(matchesPerformanceShiftFilter('night', 'night')).toBe(true);
    expect(matchesPerformanceShiftFilter('afternoon', 'night')).toBe(true);
    expect(matchesPerformanceShiftFilter('day', 'night')).toBe(false);
    expect(matchesPerformanceShiftFilter(null, 'night')).toBe(false);
  });
});
