import { describe, expect, test } from 'vitest';
import { filterShownOnReports, isShownOnReports } from './performanceVisibility';

describe('isShownOnReports', () => {
  test('defaults to visible when profile missing or flag unset', () => {
    expect(isShownOnReports(null)).toBe(true);
    expect(isShownOnReports(undefined)).toBe(true);
    expect(isShownOnReports({})).toBe(true);
    expect(isShownOnReports({ show_on_reports: true })).toBe(true);
    expect(isShownOnReports({ show_on_reports: null })).toBe(true);
  });

  test('hides when show_on_reports is false', () => {
    expect(isShownOnReports({ show_on_reports: false })).toBe(false);
  });
});

describe('filterShownOnReports', () => {
  test('keeps visible nested and flat profiles', () => {
    const rows = [
      { user_id: 'a', profiles: { show_on_reports: true } },
      { user_id: 'b', profiles: { show_on_reports: false } },
      { user_id: 'c', show_on_reports: false },
      { user_id: 'd', profiles: {} },
    ];
    expect(filterShownOnReports(rows).map((r) => r.user_id)).toEqual(['a', 'd']);
  });

  test('handles empty input', () => {
    expect(filterShownOnReports([])).toEqual([]);
    expect(filterShownOnReports(null)).toEqual([]);
  });
});
