/**
 * Pure helpers for rota → shunter WhatsApp (week summary + assignment ping).
 */

export const ROTA_WA_MESSAGE_KINDS = Object.freeze({
  SHUNTER_WEEK: 'shunter_week',
  ASSIGNMENT_PING: 'assignment_ping',
});

/** Successful / in-flight statuses that count as "already notified". */
export const ROTA_WA_BLOCKING_STATUSES = Object.freeze([
  'queued',
  'sent',
  'delivered',
  'accepted',
  'read',
]);

/** Conscious resend cooldown (ms). */
export const ROTA_WA_RESEND_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * @param {string} weekStartIso yyyy-MM-dd (Saturday)
 * @param {string} userId
 * @returns {string}
 */
export function shunterWeekIdempotencyKey(weekStartIso, userId) {
  return `shunter_week:${weekStartIso}:${userId}`;
}

/**
 * @param {string} scheduledRotaId
 * @returns {string}
 */
export function assignmentPingIdempotencyKey(scheduledRotaId) {
  return `assignment_ping:${scheduledRotaId}:shunter`;
}

/**
 * Resend keys stay unique while still identifying the base send.
 * @param {string} baseKey
 * @param {string|number|Date} [at]
 * @returns {string}
 */
export function adminResendIdempotencyKey(baseKey, at = Date.now()) {
  const stamp = at instanceof Date ? at.toISOString() : String(at);
  return `${baseKey}:resend:${stamp}`;
}

/**
 * @param {unknown} value HH:mm or HH:mm:ss
 * @returns {string} e.g. 5pm, 5:45am
 */
export function formatShiftTimeAmPm(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return s;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return s;
  const suffix = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  if (minute === 0) return `${hour}${suffix}`;
  return `${hour}:${String(minute).padStart(2, '0')}${suffix}`;
}

/**
 * @param {unknown} iso yyyy-MM-dd
 * @returns {string} e.g. 21 December
 */
export function formatShiftDateLong(iso) {
  if (iso == null || iso === '') return '';
  const raw = String(iso).trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/**
 * Week range for template {{2}}: e.g. 24-30 Oct (ASCII hyphen, no leading zeros)
 * @param {string} weekStartIso yyyy-MM-dd Saturday
 * @returns {string}
 */
export function formatRotaWeekRangeShort(weekStartIso) {
  const raw = String(weekStartIso || '').trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(start.getTime())) return raw;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startDay = String(start.getDate());
  const endDay = String(end.getDate());
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const mon = start.toLocaleDateString('en-GB', { month: 'short' });
    return `${startDay}-${endDay} ${mon}`;
  }
  const startMon = start.toLocaleDateString('en-GB', { month: 'short' });
  const endMon = end.toLocaleDateString('en-GB', { month: 'short' });
  return `${startDay} ${startMon}-${endDay} ${endMon}`;
}

/**
 * Placeholder for unused week-template day slots (Meta forbids empty vars).
 * Em dash — never empty, never the word "off".
 */
export const ROTA_WA_DAY_OFF = '—';

/** Title Case EN weekday labels Sat→Fri (embedded in v4 day line values). */
export const ROTA_WA_WEEK_DAY_LABELS = Object.freeze([
  'Sat',
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
]);

/**
 * English ordinal day-of-month: 1st, 2nd, 3rd, 4th, …
 * @param {unknown} day
 * @returns {string}
 */
export function formatOrdinalDay(day) {
  const n = Number(day);
  if (!Number.isFinite(n) || n <= 0) return String(day ?? '');
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * @param {string} weekStartIso yyyy-MM-dd Saturday
 * @param {number} dayOffset 0..6
 * @returns {string} yyyy-MM-dd
 */
export function rotaWeekDayIso(weekStartIso, dayOffset) {
  const raw = String(weekStartIso || '').trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + dayOffset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {unknown} value HH:mm or HH:mm:ss
 * @returns {string} e.g. 17:00, 05:45
 */
export function formatShiftTime24h(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return s;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return s;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Short calendar date for week lines: d/m (no leading zeros).
 * @param {unknown} iso yyyy-MM-dd
 * @returns {string} e.g. 8/11
 */
export function formatShiftDateShort(iso) {
  if (iso == null || iso === '') return '';
  const raw = String(iso).trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return raw;
  return `${day}/${month}`;
}

/**
 * Shift windows for one calendar day (am/pm). Multiple windows joined with ", ".
 * Used by assignment ping / short UI labels — not week ContentVariables.
 * @param {Array<{ start_time?: unknown, end_time?: unknown }>} dayShifts
 * @returns {string}
 */
export function formatDayShiftWindows(dayShifts) {
  const sorted = (dayShifts || []).slice().sort((a, b) =>
    String(a.start_time || '').localeCompare(String(b.start_time || '')),
  );
  return sorted
    .map((s) => {
      const start = formatShiftTimeAmPm(s.start_time);
      const end = formatShiftTimeAmPm(s.end_time);
      if (start && end) return `${start}–${end}`;
      return start || end || '';
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * 24h shift windows for one calendar day. Multiple windows joined with ", ".
 * @param {Array<{ start_time?: unknown, end_time?: unknown }>} dayShifts
 * @returns {string} e.g. 17:00-17:00 or 05:45-18:00, 06:00-14:00
 */
export function formatDayShiftWindows24h(dayShifts) {
  const sorted = (dayShifts || []).slice().sort((a, b) =>
    String(a.start_time || '').localeCompare(String(b.start_time || '')),
  );
  return sorted
    .map((s) => {
      const start = formatShiftTime24h(s.start_time);
      const end = formatShiftTime24h(s.end_time);
      if (start && end) return `${start}-${end}`;
      return start || end || '';
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * One v4 day line: `Fri 30th 17:00-05:15 (Rugby)`.
 * Multi-window same yard: `Fri 30th 05:45-18:00, 18:00-02:00 (Rugby)`.
 * Different yards: location per window.
 *
 * @param {string} iso yyyy-MM-dd
 * @param {string} weekdayLabel Title Case weekday
 * @param {Array<{ start_time?: unknown, end_time?: unknown, location?: unknown }>} dayShifts
 * @returns {string}
 */
export function formatShunterWeekDayLine(iso, weekdayLabel, dayShifts) {
  const sorted = (dayShifts || []).slice().sort((a, b) =>
    String(a.start_time || '').localeCompare(String(b.start_time || '')),
  );
  if (!sorted.length) return ROTA_WA_DAY_OFF;

  const locations = sorted.map((s) => String(s?.location || '').trim());
  const uniqueLocs = [...new Set(locations.filter(Boolean))];
  const allSameLocation = uniqueLocs.length <= 1;

  const windows = sorted
    .map((s, idx) => {
      const start = formatShiftTime24h(s.start_time);
      const end = formatShiftTime24h(s.end_time);
      const window = start && end ? `${start}-${end}` : (start || end || '');
      if (!window) return '';
      if (!allSameLocation) {
        const loc = locations[idx];
        return loc ? `${window} (${loc})` : window;
      }
      return window;
    })
    .filter(Boolean);

  if (!windows.length) return ROTA_WA_DAY_OFF;

  const dayMatch = String(iso || '').trim().slice(0, 10).match(/^\d{4}-\d{2}-(\d{2})$/);
  const ordinal = dayMatch ? formatOrdinalDay(Number(dayMatch[1])) : '';
  const head = [weekdayLabel, ordinal].filter(Boolean).join(' ');
  const body = windows.join(', ');
  if (allSameLocation && uniqueLocs[0]) {
    return `${head} ${body} (${uniqueLocs[0]})`;
  }
  return `${head} ${body}`;
}

/**
 * Seven values for week template vars {{3}}…{{9}} (v4).
 * Fixed Sat→Fri slots (no left-pack); empty days are `—` (never blank, never `off`).
 * Line shape: `Fri 30th 17:00-05:15 (Rugby)` (bullet lives in the Twilio template).
 *
 * @param {string} weekStartIso yyyy-MM-dd Saturday
 * @param {Array<{ date?: unknown, start_time?: unknown, end_time?: unknown, location?: unknown }>} shifts
 * @returns {string[]} length 7
 */
export function buildShunterWeekDayVariables(weekStartIso, shifts) {
  const byDate = new Map();
  for (const shift of shifts || []) {
    const date = String(shift?.date || '').trim().slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(shift);
  }

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const iso = rotaWeekDayIso(weekStartIso, i);
    days.push(formatShunterWeekDayLine(iso, ROTA_WA_WEEK_DAY_LABELS[i], byDate.get(iso) || []));
  }
  return days;
}

/**
 * Stacked per-day shift summary (no weekday names):
 * "21 December, 5pm–5pm"
 * Multiple days joined with " · ".
 * Kept for assignment ping / short UI labels — not for week ContentVariables.
 *
 * @param {Array<{ date?: unknown, start_time?: unknown, end_time?: unknown }>} shifts
 * @returns {string}
 */
export function formatShunterShiftSummary(shifts) {
  const byDate = new Map();
  for (const shift of shifts || []) {
    const date = String(shift?.date || '').trim().slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(shift);
  }

  const dates = [...byDate.keys()].sort();
  const lines = dates.map((date) => {
    const windows = formatDayShiftWindows(byDate.get(date) || []);
    const dateLabel = formatShiftDateLong(date);
    if (!windows) return dateLabel;
    return `${dateLabel}, ${windows}`;
  }).filter(Boolean);

  return lines.join(' · ');
}

/**
 * Unique location label for week template {{3}} (and ping {{3}}).
 * @param {Array<{ location?: unknown }>} shifts
 * @returns {string}
 */
export function formatShunterLocations(shifts) {
  const seen = new Set();
  const labels = [];
  for (const shift of shifts || []) {
    const loc = String(shift?.location || '').trim();
    if (!loc || seen.has(loc)) continue;
    seen.add(loc);
    labels.push(loc);
  }
  return labels.join(', ');
}

/**
 * @param {{ first_name?: string|null, last_name?: string|null }} profile
 * @returns {string}
 */
export function formatCreatorDisplayName(profile) {
  const first = String(profile?.first_name || '').trim();
  const last = String(profile?.last_name || '').trim();
  return `${first} ${last}`.trim() || 'Yard Rota';
}

/**
 * Classify one recipient for preview / send filtering.
 *
 * @param {{
 *   userId: string,
 *   firstName?: string,
 *   lastName?: string,
 *   phoneE164?: string|null,
 *   whatsappOptIn?: boolean,
 *   alreadySent?: boolean,
 *   lastSentAt?: string|null,
 * }} person
 * @param {{ now?: number, cooldownMs?: number }} [opts]
 * @returns {{
 *   userId: string,
 *   firstName: string,
 *   lastName: string,
 *   status: 'ready'|'skipped_no_phone'|'skipped_no_consent'|'already_sent',
 *   label: string,
 *   canForceResend: boolean,
 * }}
 */
export function classifyRotaWhatsAppRecipient(person, opts = {}) {
  const now = opts.now ?? Date.now();
  const cooldownMs = opts.cooldownMs ?? ROTA_WA_RESEND_COOLDOWN_MS;
  const userId = person.userId;
  const firstName = String(person.firstName || '').trim();
  const lastName = String(person.lastName || '').trim();
  const phone = String(person.phoneE164 || '').trim();
  const optIn = Boolean(person.whatsappOptIn);

  const base = { userId, firstName, lastName, canForceResend: false };

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { ...base, status: 'skipped_no_phone', label: 'Skipped: no phone' };
  }
  if (!optIn) {
    return { ...base, status: 'skipped_no_consent', label: 'Skipped: no WhatsApp consent' };
  }
  if (person.alreadySent) {
    const lastAt = person.lastSentAt ? Date.parse(person.lastSentAt) : NaN;
    const cooled = !Number.isFinite(lastAt) || now - lastAt >= cooldownMs;
    return {
      ...base,
      status: 'already_sent',
      label: 'Already notified',
      canForceResend: cooled,
    };
  }
  return { ...base, status: 'ready', label: 'Ready' };
}

/**
 * @param {Array<{ status: string }>} classified
 * @returns {{ ready: number, skipped: number, alreadySent: number }}
 */
export function summarizeRotaWhatsAppPreview(classified) {
  let ready = 0;
  let skipped = 0;
  let alreadySent = 0;
  for (const row of classified || []) {
    if (row.status === 'ready') ready += 1;
    else if (row.status === 'already_sent') alreadySent += 1;
    else skipped += 1;
  }
  return { ready, skipped, alreadySent };
}

/**
 * Keep people who still need a first send (ready only).
 * @param {Array<{ status: string, userId: string }>} classified
 * @returns {string[]}
 */
export function filterReadyRecipientIds(classified) {
  return (classified || [])
    .filter((row) => row.status === 'ready')
    .map((row) => row.userId);
}

/**
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export function isRotaWhatsAppBlockingStatus(status) {
  return ROTA_WA_BLOCKING_STATUSES.includes(String(status || '').toLowerCase());
}
