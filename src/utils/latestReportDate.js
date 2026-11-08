/**
 * Keep only rows for the newest `report_date` in the set.
 * Used by Stats "Last Day" so a late morning import still shows the latest day
 * instead of an empty calendar-today window.
 *
 * @param {Array<{ report_date?: string|null }>|null|undefined} records
 * @returns {Array<{ report_date?: string|null }>}
 */
export function filterToLatestReportDate(records) {
  if (!records?.length) return records || [];
  let latest = null;
  for (const record of records) {
    const d = record?.report_date;
    if (!d) continue;
    if (!latest || d > latest) latest = d;
  }
  if (!latest) return records;
  return records.filter((record) => record.report_date === latest);
}
