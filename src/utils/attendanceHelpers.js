/**
 * Returns the set of user IDs who have an attendance record (no show / sick / late)
 * for any of their scheduled_rota slots on the given dates.
 * Used to filter breaks and counts so absent users are not shown.
 *
 * @param {object} supabase - Supabase client
 * @param {string[]} dateStrings - Array of dates in 'YYYY-MM-DD' format (e.g. ['2025-03-03', '2025-03-02'])
 * @returns {Promise<Set<string>>} Set of user_id UUIDs that are absent on any of the dates
 */
export async function getAbsentUserIdsForDates(supabase, dateStrings) {
  if (!dateStrings || dateStrings.length === 0) {
    return new Set();
  }

  const { data: rotaData, error: rotaError } = await supabase
    .from('scheduled_rota')
    .select('id, user_id')
    .in('date', dateStrings)
    .not('user_id', 'is', null);

  if (rotaError) {
    console.error('[attendanceHelpers] Error fetching scheduled_rota:', rotaError);
    return new Set();
  }

  if (!rotaData || rotaData.length === 0) {
    return new Set();
  }

  const rotaIds = rotaData.map((r) => r.id);
  const rotaIdToUserId = new Map(rotaData.map((r) => [r.id, r.user_id]));

  const { data: attendanceData, error: attendanceError } = await supabase
    .from('attendance')
    .select('scheduled_rota_id')
    .in('scheduled_rota_id', rotaIds);

  if (attendanceError) {
    console.error('[attendanceHelpers] Error fetching attendance:', attendanceError);
    return new Set();
  }

  const absentUserIds = new Set();
  (attendanceData || []).forEach((row) => {
    const userId = rotaIdToUserId.get(row.scheduled_rota_id);
    if (userId) absentUserIds.add(userId);
  });

  return absentUserIds;
}
