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
