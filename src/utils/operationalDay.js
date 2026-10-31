import { format, subDays, addDays } from 'date-fns';

/** Day/afternoon window starts at 07:00; night ends at 07:00 next morning. */
export const DAY_WINDOW_START_HOUR = 7;
/** Night window starts at 17:00. */
export const NIGHT_WINDOW_START_HOUR = 17;

/** Local calendar date as YYYY-MM-DD (avoid toISOString UTC day shift around midnight). */
export function toLocalYmd(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Calendar YYYY-MM-DD for the operational "today".
 * Before 07:00 the active night cycle is still yesterday → today 07:00,
 * so operational today sticks to the previous calendar day until 07:00.
 */
export function getEffectiveTodayYmd(now = new Date()) {
  return now.getHours() < DAY_WINDOW_START_HOUR
    ? format(subDays(now, 1), 'yyyy-MM-dd')
    : format(now, 'yyyy-MM-dd');
}

export function isInNightWindow(now = new Date()) {
  const hour = now.getHours();
  return hour >= NIGHT_WINDOW_START_HOUR || hour < DAY_WINDOW_START_HOUR;
}

/** Calendar date on which the current (or upcoming tonight) night cycle starts. */
export function getNightStartYmd(now = new Date()) {
  const today = toLocalYmd(now);
  if (now.getHours() < DAY_WINDOW_START_HOUR) {
    return format(subDays(now, 1), 'yyyy-MM-dd');
  }
  return today;
}

export function getNightMorningYmd(now = new Date()) {
  return format(addDays(new Date(`${getNightStartYmd(now)}T12:00:00`), 1), 'yyyy-MM-dd');
}

/**
 * Suggested Manage Breaks date + shift for the active operational window.
 * - 07:00–17:00 → Day + today
 * - ≥17:00 → Night + today
 * - <07:00 → Night + yesterday (open night cycle)
 */
export function getSuggestedBreakContext(now = new Date()) {
  const hour = now.getHours();
  if (hour < DAY_WINDOW_START_HOUR) {
    return { date: format(subDays(now, 1), 'yyyy-MM-dd'), shift: 'Night' };
  }
  if (hour >= NIGHT_WINDOW_START_HOUR) {
    return { date: toLocalYmd(now), shift: 'Night' };
  }
  return { date: toLocalYmd(now), shift: 'Day' };
}

/**
 * Correct stale Manage Breaks localStorage date/shift for the active window.
 * Day window: force today; Night → Day; keep Afternoon if user chose it.
 * Night window: use suggested when saved context is not the open night cycle.
 */
export function resolveBreakManagerContext(savedDate, savedShift, now = new Date()) {
  const suggested = getSuggestedBreakContext(now);
  const hour = now.getHours();
  const inDayWindow =
    hour >= DAY_WINDOW_START_HOUR && hour < NIGHT_WINDOW_START_HOUR;

  if (inDayWindow) {
    const shift = savedShift === 'Afternoon' ? 'Afternoon' : 'Day';
    return { date: suggested.date, shift };
  }

  if (savedShift === 'Night' && savedDate === suggested.date) {
    return { date: savedDate, shift: 'Night' };
  }

  return suggested;
}
