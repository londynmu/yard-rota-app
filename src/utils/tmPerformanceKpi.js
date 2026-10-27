/**
 * Pure helpers for Transport Manager Home KPI (yesterday moves / best / worst).
 * actual_date mirrors PerformanceLeaderboard: report_date minus one calendar day.
 */

/**
 * @typedef {{ user_id?: string|null, number_of_moves?: number|null, first_name?: string|null, last_name?: string|null, profiles?: { first_name?: string|null, last_name?: string|null }|null }} PerformanceRow
 */

/**
 * Display name from a row that may nest profiles or carry flat name fields.
 * @param {PerformanceRow} row
 * @returns {string}
 */
export function performanceDisplayName(row) {
  const profile = row?.profiles || row;
  const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return name || 'Unknown';
}

/**
 * Aggregate total moves and pick best/worst shunters for a day's performance rows.
 * Multiple rows per user are summed. Ties: first max / first min in encounter order.
 *
 * @param {PerformanceRow[]} records
 * @returns {{
 *   totalMoves: number,
 *   best: { userId: string, name: string, moves: number } | null,
 *   worst: { userId: string, name: string, moves: number } | null,
 *   hasData: boolean,
 * }}
 */
export function aggregateYesterdayPerformance(records) {
  const byUser = new Map();

  for (const row of records || []) {
    const userId = row?.user_id;
    if (!userId) continue;
    const moves = Number(row.number_of_moves) || 0;
    const existing = byUser.get(userId);
    if (existing) {
      existing.moves += moves;
    } else {
      byUser.set(userId, {
        userId,
        name: performanceDisplayName(row),
        moves,
      });
    }
  }

  if (byUser.size === 0) {
    return { totalMoves: 0, best: null, worst: null, hasData: false };
  }

  let totalMoves = 0;
  let best = null;
  let worst = null;

  for (const entry of byUser.values()) {
    totalMoves += entry.moves;
    if (!best || entry.moves > best.moves) best = entry;
    if (!worst || entry.moves < worst.moves) worst = entry;
  }

  return {
    totalMoves,
    best,
    worst,
    hasData: true,
  };
}
