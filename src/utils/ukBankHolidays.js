import { addDays, format, isSunday, startOfDay } from 'date-fns';

const holidayCache = new Map();

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDaysLocal(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function firstMonday(year, monthIndex) {
  const date = new Date(year, monthIndex, 1);
  const offset = (8 - date.getDay()) % 7;
  date.setDate(1 + offset);
  return date;
}

function lastMonday(year, monthIndex) {
  const date = new Date(year, monthIndex + 1, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function addNamedDay(map, date, name) {
  const key = toYmd(date);
  if (!map.has(key)) {
    map.set(key, name);
    return;
  }
  if (!map.get(key).includes(name)) {
    map.set(key, `${map.get(key)}, ${name}`);
  }
}

function addWithWeekendSubstitute(map, year, month, day, name) {
  const actual = new Date(year, month - 1, day);
  addNamedDay(map, actual, name);
  const weekday = actual.getDay();
  if (weekday === 6) {
    addNamedDay(map, addDaysLocal(actual, 2), `${name} (substitute)`);
  } else if (weekday === 0) {
    addNamedDay(map, addDaysLocal(actual, 1), `${name} (substitute)`);
  }
}

function addChristmasAndBoxing(map, year) {
  const christmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);
  addNamedDay(map, christmas, 'Christmas Day');
  addNamedDay(map, boxing, 'Boxing Day');

  const christmasWeekday = christmas.getDay();
  if (christmasWeekday === 6) {
    addNamedDay(map, new Date(year, 11, 27), 'Christmas Day (substitute)');
    addNamedDay(map, new Date(year, 11, 28), 'Boxing Day (substitute)');
  } else if (christmasWeekday === 0) {
    addNamedDay(map, new Date(year, 11, 27), 'Christmas Day (substitute)');
  } else if (christmasWeekday === 5) {
    addNamedDay(map, new Date(year, 11, 28), 'Boxing Day (substitute)');
  }
}

function holidaysForYear(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);

  const map = new Map();
  addWithWeekendSubstitute(map, year, 1, 1, "New Year's Day");

  const easter = easterSunday(year);
  addNamedDay(map, addDaysLocal(easter, -2), 'Good Friday');
  addNamedDay(map, addDaysLocal(easter, 1), 'Easter Monday');

  addNamedDay(map, firstMonday(year, 4), 'Early May Bank Holiday');
  addNamedDay(map, lastMonday(year, 4), 'Spring Bank Holiday');
  addNamedDay(map, lastMonday(year, 7), 'Summer Bank Holiday');
  addChristmasAndBoxing(map, year);

  holidayCache.set(year, map);
  return map;
}

export function getUkBankHolidayName(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const key = toYmd(date);
  return holidaysForYear(year).get(key) || holidaysForYear(year - 1).get(key) || null;
}

export function getUkBankHolidaysInRange(from, to) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const result = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDaysLocal(cursor, 1)) {
    const name = getUkBankHolidayName(cursor);
    if (name) result.push({ date: new Date(cursor), name });
  }
  return result;
}

export function getUpcomingCalendarNotes(today, dayData = {}) {
  const start = startOfDay(today);
  const lines = [`Today is ${format(start, 'EEEE')}.`];

  for (let offset = 0; offset <= 3; offset += 1) {
    const date = addDays(start, offset);
    const weekday = format(date, 'EEEE');
    const key = format(date, 'yyyy-MM-dd');

    if (offset > 0 && isSunday(date)) {
      lines.push(offset === 1 ? 'Sunday is tomorrow.' : `Sunday is in ${offset} days.`);
    }

    const bankHolidayName = getUkBankHolidayName(date);
    if (bankHolidayName) {
      if (offset === 0) {
        lines.push(`Today is ${bankHolidayName}.`);
      } else if (offset === 1) {
        lines.push(`${bankHolidayName} is tomorrow (${weekday}).`);
      } else {
        lines.push(`${bankHolidayName} in ${offset} days (${weekday}).`);
      }
    }

    if (dayData?.[key]?.status === 'holiday') {
      if (offset === 0) {
        lines.push('You are on holiday today.');
      } else if (offset === 1) {
        lines.push('You are on holiday tomorrow.');
      } else {
        lines.push(`You are on holiday on ${weekday}.`);
      }
    }
  }

  return lines;
}
