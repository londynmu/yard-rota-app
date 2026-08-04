import { format, subDays } from 'date-fns';

/** Local calendar date as YYYY-MM-DD (avoid toISOString UTC day shift around midnight). */
export function toLocalYmd(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

/** Calendar YYYY-MM-DD for the operational "today" (before 06:00 counts as previous calendar day). */
export function getEffectiveTodayYmd() {
  const now = new Date();
  return now.getHours() < 6
    ? format(subDays(now, 1), 'yyyy-MM-dd')
    : format(now, 'yyyy-MM-dd');
}
