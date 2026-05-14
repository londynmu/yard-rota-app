/**
 * Rota planner: one logical slot can merge multiple scheduled_rota rows.
 * Normalize to unique user UUIDs (first-seen order) for counts and UI.
 *
 * @param {unknown[]} ids
 * @returns {string[]}
 */
export function normalizeAssignedEmployeeIds(ids) {
  if (!ids || !Array.isArray(ids)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of ids) {
    if (raw == null || raw === '') continue;
    const id = String(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * @param {unknown[]} ids
 * @returns {number}
 */
export function countUniqueAssigned(ids) {
  return normalizeAssignedEmployeeIds(ids).length;
}
