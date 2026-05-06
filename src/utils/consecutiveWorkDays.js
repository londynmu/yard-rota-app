import { addDays, subDays, format, parseISO } from 'date-fns';

export const CONSECUTIVE_WORK_DAYS_ERROR_PREFIX =
  'Cannot assign: this would exceed the maximum of';

/**
 * @param {unknown} error - Supabase / PostgREST error object
 */
export function isConsecutiveWorkDaysDbError(error) {
  const msg = error?.message || '';
  return error?.code === 'P0001' || msg.includes(CONSECUTIVE_WORK_DAYS_ERROR_PREFIX);
}

export function parseMaxConsecutiveWorkDays(value) {
  const n = parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 13) return 6;
  return n;
}

export function consecutiveWorkDaysBlockedMessage(maxAllowed) {
  return `${CONSECUTIVE_WORK_DAYS_ERROR_PREFIX} ${maxAllowed} consecutive calendar days with a shift for this user.`;
}

/**
 * Calendar streak length containing assignmentDateStr (inclusive).
 * @param {string} assignmentDateStr - YYYY-MM-DD
 * @param {string[]} distinctDateStrings - list of YYYY-MM-DD (duplicates ok)
 */
export function countConsecutiveCalendarStreak(assignmentDateStr, distinctDateStrings) {
  const dates = new Set(
    (distinctDateStrings || []).map((d) => String(d).slice(0, 10))
  );
  dates.add(String(assignmentDateStr).slice(0, 10));

  const anchor = parseISO(assignmentDateStr);
  const dayKey = (d) => format(d, 'yyyy-MM-dd');

  let before = 0;
  let d = subDays(anchor, 1);
  while (dates.has(dayKey(d))) {
    before += 1;
    d = subDays(d, 1);
  }

  let after = 0;
  d = addDays(anchor, 1);
  while (dates.has(dayKey(d))) {
    after += 1;
    d = addDays(d, 1);
  }

  return before + 1 + after;
}

export function wouldExceedConsecutiveWorkDays(assignmentDateStr, distinctDateStrings, maxAllowed) {
  return countConsecutiveCalendarStreak(assignmentDateStr, distinctDateStrings) > maxAllowed;
}
