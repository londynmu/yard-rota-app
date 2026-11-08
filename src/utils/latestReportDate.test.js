import { describe, expect, test } from 'vitest';
import { filterToLatestReportDate } from './latestReportDate';

describe('filterToLatestReportDate', () => {
  test('returns empty input unchanged', () => {
    expect(filterToLatestReportDate([])).toEqual([]);
    expect(filterToLatestReportDate(null)).toEqual([]);
    expect(filterToLatestReportDate(undefined)).toEqual([]);
  });

  test('keeps only rows for the newest report_date', () => {
    const rows = [
      { report_date: '2026-11-07', user_id: 'a' },
      { report_date: '2026-11-08', user_id: 'a' },
      { report_date: '2026-11-07', user_id: 'b' },
      { report_date: '2026-11-08', user_id: 'b' },
    ];
    expect(filterToLatestReportDate(rows)).toEqual([
      { report_date: '2026-11-08', user_id: 'a' },
      { report_date: '2026-11-08', user_id: 'b' },
    ]);
  });

  test('ignores rows without report_date when finding latest', () => {
    const rows = [
      { report_date: null, user_id: 'x' },
      { report_date: '2026-11-06', user_id: 'a' },
    ];
    expect(filterToLatestReportDate(rows)).toEqual([
      { report_date: '2026-11-06', user_id: 'a' },
    ]);
  });
});
