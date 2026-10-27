/**
 * Build a stable key for person + rota date + shift type.
 * Breaks are hidden only when attendance matches the same key.
 */
export function absentShiftKey(userId, date, shiftType) {
  return `${userId}|${date}|${shiftType}`;
}

/**
 * Returns the set of absent shift keys (`userId|date|shiftType`) for the given dates.
 * Used to filter breaks so only matching person+date+shift absences hide a break.
 *
 * On database error this throws — callers must not treat failure as "nobody absent".
 *
 * @param {object} supabase - Supabase client
 * @param {string[]} dateStrings - Array of dates in 'YYYY-MM-DD' format
 * @returns {Promise<Set<string>>}
 */
export async function getAbsentShiftKeysForDates(supabase, dateStrings) {
  if (!dateStrings || dateStrings.length === 0) {
    return new Set();
  }

  const { data: rotaData, error: rotaError } = await supabase
    .from('scheduled_rota')
    .select('id, user_id, date, shift_type')
    .in('date', dateStrings)
    .not('user_id', 'is', null);

  if (rotaError) {
    console.error('[attendanceHelpers] Error fetching scheduled_rota:', rotaError);
    throw rotaError;
  }

  if (!rotaData || rotaData.length === 0) {
    return new Set();
  }

  const rotaIds = rotaData.map((r) => r.id);
  const rotaIdToKey = new Map(
    rotaData.map((r) => [r.id, absentShiftKey(r.user_id, r.date, r.shift_type)])
  );

  const { data: attendanceData, error: attendanceError } = await supabase
    .from('attendance')
    .select('scheduled_rota_id')
    .in('scheduled_rota_id', rotaIds);

  if (attendanceError) {
    console.error('[attendanceHelpers] Error fetching attendance:', attendanceError);
    throw attendanceError;
  }

  const absentKeys = new Set();
  (attendanceData || []).forEach((row) => {
    const key = rotaIdToKey.get(row.scheduled_rota_id);
    if (key) absentKeys.add(key);
  });

  return absentKeys;
}

/**
 * @deprecated Prefer getAbsentShiftKeysForDates — user-id-only matching hides the wrong day/shift.
 * Kept for callers that still need a Set of user IDs; throws on DB error like the keyed helper.
 */
export async function getAbsentUserIdsForDates(supabase, dateStrings) {
  const keys = await getAbsentShiftKeysForDates(supabase, dateStrings);
  const userIds = new Set();
  keys.forEach((key) => {
    const userId = key.split('|')[0];
    if (userId) userIds.add(userId);
  });
  return userIds;
}

export function isBreakAbsent(breakItem, absentKeys) {
  if (!breakItem?.user_id || !breakItem?.date || !breakItem?.shift_type) return false;
  return absentKeys.has(
    absentShiftKey(breakItem.user_id, breakItem.date, breakItem.shift_type)
  );
}
