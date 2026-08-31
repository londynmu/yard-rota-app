import { formatShiftClock } from './rotaAdditionalBookings';
import { normalizeAssignedEmployeeIds } from './rotaAssignedEmployees';

export function timeToMinutes(timeString) {
  const [hours, minutes] = (timeString || '').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function slotTimeKey(slot) {
  return [
    String(slot?.location ?? '').trim(),
    formatShiftClock(slot?.start_time),
    formatShiftClock(slot?.end_time),
  ].join('|');
}

/**
 * Overlap / min-break conflicts for a slot against other same-day assignments.
 * @param {{ id?: string, start_time?: string, end_time?: string, location?: string }} currentSlot
 * @param {Array<{ id?: string, start_time?: string, end_time?: string, assigned_employees?: unknown[] }>} sameDaySlots
 * @param {number} [minBreakMinutes]
 */
export function collectSameDayConflictIds(currentSlot, sameDaySlots, minBreakMinutes = 0) {
  const overlappingConflictIds = new Set();
  const breakConflictIds = new Set();
  const slotStart = timeToMinutes(currentSlot.start_time);
  const slotEnd = timeToMinutes(currentSlot.end_time);
  const normalizedSlotEnd = slotEnd < slotStart ? slotEnd + 1440 : slotEnd;

  (sameDaySlots || []).forEach((other) => {
    if (!other || other.id === currentSlot.id) return;
    const userIds = normalizeAssignedEmployeeIds(other.assigned_employees);
    if (userIds.length === 0) return;

    const existingStart = timeToMinutes(other.start_time);
    const existingEnd = timeToMinutes(other.end_time);
    const normalizedExistingEnd = existingEnd < existingStart ? existingEnd + 1440 : existingEnd;
    const overlap = slotStart < normalizedExistingEnd && existingStart < normalizedSlotEnd;

    userIds.forEach((userId) => {
      if (overlap) {
        overlappingConflictIds.add(userId);
        return;
      }
      if (minBreakMinutes > 0) {
        let breakMinutes = -1;
        if (slotStart >= normalizedExistingEnd) breakMinutes = slotStart - normalizedExistingEnd;
        else if (existingStart >= normalizedSlotEnd) breakMinutes = existingStart - normalizedSlotEnd;
        if (breakMinutes !== -1 && breakMinutes < minBreakMinutes) {
          breakConflictIds.add(userId);
        }
      }
    });
  });

  return { overlappingConflictIds, breakConflictIds };
}

/**
 * Group scheduled_rota rows into conflict slots, excluding the current slot definition.
 * @param {object[]} rows
 * @param {{ location?: string, start_time?: string, end_time?: string }} currentSlot
 */
export function scheduledRotaToConflictSlots(rows, currentSlot) {
  const currentKey = slotTimeKey(currentSlot);
  const groups = new Map();

  for (const row of rows || []) {
    if (!row?.user_id) continue;
    const key = slotTimeKey(row);
    if (key === currentKey) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        id: row.id,
        start_time: row.start_time,
        end_time: row.end_time,
        assigned_employees: [],
      });
    }
    groups.get(key).assigned_employees.push(row.user_id);
  }

  return Array.from(groups.values());
}

/**
 * Cache key for tooltip invalidation when any same-day assignment changes.
 * @param {string} date
 * @param {object[]} rows scheduled_rota rows for the date
 */
export function buildDayConflictCacheKey(date, rows) {
  return [
    date || '',
    ...(rows || [])
      .filter((row) => row?.user_id)
      .map(
        (row) =>
          `${row.user_id}:${String(row.location ?? '').trim()}:${formatShiftClock(row.start_time)}-${formatShiftClock(row.end_time)}`
      )
      .sort(),
  ].join('|');
}

export function buildSameDayCacheKey(sameDaySlots) {
  return (sameDaySlots || [])
    .map((s) => {
      const ids = normalizeAssignedEmployeeIds(s.assigned_employees || []).slice().sort().join(',');
      return `${s.id}:${ids}:${s.start_time}-${s.end_time}`;
    })
    .sort()
    .join('|');
}
