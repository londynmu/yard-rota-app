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

/** True when end is before start (overnight shift ending next calendar morning). */
export function isOvernightShift(startTime, endTime) {
  return timeToMinutes(endTime) < timeToMinutes(startTime);
}

/**
 * Overlap / min-break conflicts for a slot against other same-day assignments.
 * Hour overlap is always checked, even when minBreakMinutes is 0.
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
 * Rest / wall-clock overlap across midnight: previous night (ends next morning)
 * vs next morning day/afternoon (starts after 07:00 typically).
 *
 * @param {{ start_time?: string, end_time?: string }} currentSlot slot being assigned
 * @param {Array<{ id?: string, start_time?: string, end_time?: string, assigned_employees?: unknown[], shift_type?: string }>} adjacentSlots
 * @param {number} minBreakMinutes
 * @param {'previousNight' | 'nextMorning'} relation
 *   - previousNight: adjacent slots are on the day before current (night → morning rest)
 *   - nextMorning: adjacent slots are on the day after current (night → next day morning)
 */
export function collectCrossDayRestConflictIds(
  currentSlot,
  adjacentSlots,
  minBreakMinutes = 0,
  relation = 'previousNight'
) {
  const overlappingConflictIds = new Set();
  const breakConflictIds = new Set();
  const currentStart = timeToMinutes(currentSlot.start_time);
  const currentEnd = timeToMinutes(currentSlot.end_time);
  const currentOvernight = isOvernightShift(currentSlot.start_time, currentSlot.end_time);

  (adjacentSlots || []).forEach((other) => {
    if (!other) return;
    const userIds = normalizeAssignedEmployeeIds(other.assigned_employees);
    if (userIds.length === 0) return;

    const otherStart = timeToMinutes(other.start_time);
    const otherEnd = timeToMinutes(other.end_time);
    const otherOvernight = isOvernightShift(other.start_time, other.end_time);

    let gapMinutes = null;
    let overlapsWall = false;

    if (relation === 'previousNight') {
      // Adjacent = previous calendar day. Only overnight nights that end on this morning matter.
      if (!otherOvernight) return;
      // Other ends at otherEnd on current morning; current starts at currentStart same morning.
      if (currentStart < otherEnd) overlapsWall = true;
      else gapMinutes = currentStart - otherEnd;
    } else {
      // Adjacent = next calendar day. Current overnight night ends on next morning.
      if (!currentOvernight) return;
      // Current ends at currentEnd next morning; adjacent starts at otherStart next morning.
      if (otherStart < currentEnd) overlapsWall = true;
      else gapMinutes = otherStart - currentEnd;
    }

    userIds.forEach((userId) => {
      if (overlapsWall) {
        overlappingConflictIds.add(userId);
        return;
      }
      if (minBreakMinutes > 0 && gapMinutes != null && gapMinutes < minBreakMinutes) {
        breakConflictIds.add(userId);
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
        shift_type: row.shift_type,
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
