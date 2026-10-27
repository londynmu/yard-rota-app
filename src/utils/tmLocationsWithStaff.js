/**
 * Pure helpers for TM location pills — only hubs with shunters on the rota today.
 */

/**
 * Count unique locations from scheduled_rota rows; drop empty hubs.
 *
 * @param {{ location?: string|null }[]|null|undefined} slots
 * @returns {{ name: string, count: number }[]}
 */
export function locationsWithStaffToday(slots) {
  const counts = new Map();

  for (const slot of slots || []) {
    const name = typeof slot?.location === 'string' ? slot.location.trim() : '';
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Prefer saved location when it still has staff; otherwise first staffed hub.
 *
 * @param {{ name: string }[]|null|undefined} staffedLocations
 * @param {string|null|undefined} savedName
 * @returns {string|null}
 */
export function resolveTmLocationSelection(staffedLocations, savedName) {
  if (!staffedLocations?.length) return null;
  if (savedName && staffedLocations.some((l) => l.name === savedName)) {
    return savedName;
  }
  return staffedLocations[0].name;
}
