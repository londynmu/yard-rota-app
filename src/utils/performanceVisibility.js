/**
 * Whether a profile should appear on Performance leaderboards / charts / KPIs.
 * Missing/undefined show_on_reports treats as visible (matches DB default true).
 *
 * @param {{ show_on_reports?: boolean|null }|null|undefined} profile
 * @returns {boolean}
 */
export function isShownOnReports(profile) {
  if (!profile) return true;
  return profile.show_on_reports !== false;
}

/**
 * Keep performance rows whose embedded/flat profile is shown on reports.
 *
 * @param {Array<{ profiles?: { show_on_reports?: boolean|null }|null, show_on_reports?: boolean|null }>} records
 * @returns {typeof records}
 */
export function filterShownOnReports(records) {
  return (records || []).filter((row) =>
    isShownOnReports(row?.profiles ?? row)
  );
}
