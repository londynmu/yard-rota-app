/**
 * Pure helpers for the admin dashboard attendance chart.
 * A scheduled slot with an attendance row is an absence; the rest count as present.
 */

/**
 * @param {Array<{ id?: string, date?: string, user_id?: string|null }>|null|undefined} slots
 * @param {Array<{ scheduled_rota_id?: string }>|null|undefined} attendanceRows
 * @param {string[]} dates YYYY-MM-DD, in display order
 * @returns {Array<{ date: string, scheduled: number, present: number, absent: number }>}
 */
export function weeklyPresenceSeries(slots, attendanceRows, dates) {
  const absentIds = new Set(
    (attendanceRows || []).map((row) => row?.scheduled_rota_id).filter(Boolean),
  );

  return (dates || []).map((date) => {
    const daySlots = (slots || []).filter((slot) => slot?.date === date && slot?.user_id);
    const scheduled = daySlots.length;
    const absent = daySlots.filter((slot) => absentIds.has(slot.id)).length;
    return {
      date,
      scheduled,
      present: Math.max(0, scheduled - absent),
      absent,
    };
  });
}
