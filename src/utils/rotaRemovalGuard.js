import { addDays, format } from 'date-fns';
import { DAY_WINDOW_START_HOUR } from './operationalDay';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseHm(timeStr) {
  const s = String(timeStr || '00:00').slice(0, 5);
  const [h, m] = s.split(':').map((v) => Number(v) || 0);
  return { hours: h, minutes: m };
}

/**
 * Wall-clock start of a scheduled_rota slot.
 * Night slots stored with start 00:00–06:59 on the night start date
 * begin the following calendar morning.
 */
export function getSlotStartInstant(slot) {
  if (!slot?.date) return null;
  const { hours, minutes } = parseHm(slot.start_time);
  const shiftType = String(slot.shift_type || '').toLowerCase();
  let dateStr = slot.date;
  if (shiftType === 'night' && hours < DAY_WINDOW_START_HOUR) {
    dateStr = format(addDays(new Date(`${slot.date}T12:00:00`), 1), 'yyyy-MM-dd');
  }
  return new Date(`${dateStr}T${pad2(hours)}:${pad2(minutes)}:00`);
}

/**
 * Wall-clock end of a slot. Overnight (end clock earlier than start on same
 * stored date, or night ending before 12:00) rolls to the next calendar day.
 */
export function getSlotEndInstant(slot) {
  if (!slot?.date) return null;
  const start = getSlotStartInstant(slot);
  if (!start) return null;
  const { hours, minutes } = parseHm(slot.end_time);
  const shiftType = String(slot.shift_type || '').toLowerCase();
  let dateStr = slot.date;
  const startHm = parseHm(slot.start_time);
  const endMinutes = hours * 60 + minutes;
  const startMinutes = startHm.hours * 60 + startHm.minutes;
  const overnight =
    endMinutes <= startMinutes ||
    (shiftType === 'night' && hours < 12);

  if (overnight) {
    dateStr = format(addDays(new Date(`${slot.date}T12:00:00`), 1), 'yyyy-MM-dd');
  } else if (shiftType === 'night' && startHm.hours < DAY_WINDOW_START_HOUR) {
    // Start was rolled to next morning; end is same morning calendar day.
    dateStr = format(addDays(new Date(`${slot.date}T12:00:00`), 1), 'yyyy-MM-dd');
  }

  const end = new Date(`${dateStr}T${pad2(hours)}:${pad2(minutes)}:00`);
  if (end.getTime() <= start.getTime()) {
    return new Date(start.getTime() + 60 * 60 * 1000);
  }
  return end;
}

/**
 * Block silent planner unassign when inside the 12h pre-start window
 * or while the shift is still active (before end).
 */
export function shouldBlockSilentUnassign(slot, now = new Date()) {
  const start = getSlotStartInstant(slot);
  const end = getSlotEndInstant(slot);
  if (!start || !end) return false;
  const windowOpenAt = start.getTime() - TWELVE_HOURS_MS;
  const t = now.getTime();
  return t >= windowOpenAt && t < end.getTime();
}

/**
 * Deep-link into My Rota attendance flow for a tracked absence reason.
 */
export function buildMyRotaAttendancePath({
  date,
  location,
  userId,
  startTime,
  endTime,
  shiftType,
} = {}) {
  const params = new URLSearchParams();
  params.set('openAttendance', '1');
  params.set('blockedRemoval', '1');
  if (date) params.set('date', date);
  if (location) params.set('location', location);
  if (userId) params.set('userId', String(userId));
  if (startTime) params.set('startTime', String(startTime).slice(0, 5));
  if (endTime) params.set('endTime', String(endTime).slice(0, 5));
  if (shiftType) params.set('shiftType', String(shiftType).toLowerCase());
  return `/my-rota?${params.toString()}`;
}
