import { format, subDays } from 'date-fns';

/** Calendar YYYY-MM-DD for the operational "today" (before 06:00 counts as previous calendar day). */
export function getEffectiveTodayYmd() {
  const now = new Date();
  return now.getHours() < 6
    ? format(subDays(now, 1), 'yyyy-MM-dd')
    : format(now, 'yyyy-MM-dd');
}
