export const TM_BREAK_SHIFTS = ['Day', 'Afternoon', 'Night'];

export const STANDARD_BREAK_SLOTS = {
  Day: [
    { start_time: '09:00', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
    { start_time: '09:15', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
    { start_time: '09:30', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
    { start_time: '09:45', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
    { start_time: '10:00', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
    { start_time: '10:15', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
    { start_time: '12:00', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
    { start_time: '12:45', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
    { start_time: '13:30', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
    { start_time: '14:15', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
    { start_time: '15:00', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
    { start_time: '15:45', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
  ],
  Night: [
    { start_time: '21:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
    { start_time: '22:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
    { start_time: '23:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
    { start_time: '00:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
    { start_time: '01:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
    { start_time: '02:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
  ],
  Afternoon: [
    { start_time: '18:00', duration_minutes: 60, capacity: 2, break_type: 'Afternoon Break (60 min)' },
    { start_time: '19:00', duration_minutes: 60, capacity: 2, break_type: 'Afternoon Break (60 min)' },
    { start_time: '20:00', duration_minutes: 60, capacity: 2, break_type: 'Afternoon Break (60 min)' },
  ],
};

export function mapToDbBreakType(frontendBreakType) {
  const breakTypeLower = (frontendBreakType || '').toLowerCase();
  if (breakTypeLower.includes('break 1 (15 min)')) return 'meal1';
  if (breakTypeLower.includes('break 2 (45 min)')) return 'meal2';
  if (breakTypeLower.includes('night break (60 min)')) return 'night';
  if (breakTypeLower.includes('afternoon break (60 min)')) return 'afternoon';
  if (breakTypeLower.includes('custom')) return 'custom';
  return 'custom';
}

function adjustTimeForNightShift(timeStr, shiftType) {
  const [hours, minutes] = String(timeStr || '00:00').split(':').map(Number);
  let totalMinutes = hours * 60 + (minutes || 0);
  if (String(shiftType).toLowerCase() === 'night' && hours < 12) {
    totalMinutes += 24 * 60;
  }
  return totalMinutes;
}

export function sortBreakSlots(slots, shiftType) {
  return [...slots].sort((a, b) => {
    const timeA = adjustTimeForNightShift(a.start_time, shiftType);
    const timeB = adjustTimeForNightShift(b.start_time, shiftType);
    return timeA - timeB;
  });
}
