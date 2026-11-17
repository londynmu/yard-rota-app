/**
 * Whether a shunter's shift preference belongs in the Performance shift filter.
 * Night filter includes afternoon (same as the leaderboard list).
 *
 * @param {string|null|undefined} shiftPreference - profiles.shift_preference
 * @param {'all'|'day'|'night'} shiftFilter
 * @returns {boolean}
 */
export function matchesPerformanceShiftFilter(shiftPreference, shiftFilter) {
  if (!shiftFilter || shiftFilter === 'all') return true;
  if (shiftFilter === 'day') return shiftPreference === 'day';
  if (shiftFilter === 'night') {
    return shiftPreference === 'night' || shiftPreference === 'afternoon';
  }
  return true;
}
