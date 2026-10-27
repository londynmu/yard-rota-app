import { describe, expect, test } from 'vitest';
import {
  locationsWithStaffToday,
  resolveTmLocationSelection,
} from './tmLocationsWithStaff';

describe('locationsWithStaffToday', () => {
  test('returns empty for null or empty input', () => {
    expect(locationsWithStaffToday(null)).toEqual([]);
    expect(locationsWithStaffToday([])).toEqual([]);
  });

  test('counts locations and drops empty names', () => {
    expect(
      locationsWithStaffToday([
        { location: 'Rugby' },
        { location: 'Rugby' },
        { location: 'Nuneaton' },
        { location: '' },
        { location: null },
        { location: '  ' },
      ])
    ).toEqual([
      { name: 'Nuneaton', count: 1 },
      { name: 'Rugby', count: 2 },
    ]);
  });

  test('trims location names', () => {
    expect(locationsWithStaffToday([{ location: '  Rugby  ' }])).toEqual([
      { name: 'Rugby', count: 1 },
    ]);
  });
});

describe('resolveTmLocationSelection', () => {
  const staffed = [{ name: 'Nuneaton' }, { name: 'Rugby' }];

  test('returns null when no staffed locations', () => {
    expect(resolveTmLocationSelection([], 'Rugby')).toBeNull();
    expect(resolveTmLocationSelection(null, 'Rugby')).toBeNull();
  });

  test('keeps saved location when still staffed', () => {
    expect(resolveTmLocationSelection(staffed, 'Rugby')).toBe('Rugby');
  });

  test('falls back to first staffed when saved missing or empty', () => {
    expect(resolveTmLocationSelection(staffed, 'Missing')).toBe('Nuneaton');
    expect(resolveTmLocationSelection(staffed, null)).toBe('Nuneaton');
  });
});
