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
 * Week range for template {{2}}: e.g. 08–14 Nov
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
  const startDay = String(start.getDate()).padStart(2, '0');
  const endDay = String(end.getDate()).padStart(2, '0');
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const mon = start.toLocaleDateString('en-GB', { month: 'short' });
    return `${startDay}–${endDay} ${mon}`;
  }
  const startLabel = start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const endLabel = end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${startLabel}–${endLabel}`;
}

/** Placeholder for empty Sat–Fri day slots in week template v2 (Meta forbids empty vars). */
export const ROTA_WA_DAY_OFF = 'off';

/** Fixed weekday labels for Sat→Fri week (matches yard_rota_week_shunter_v2 body). */
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
 * Shift windows for one calendar day (am/pm). Multiple windows joined with ", ".
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
 * Seven Sat→Fri values for week template vars {{4}}…{{10}}.
 * Empty days are always `off` (never blank — Meta rejects empty Content Variables).
 *
 * @param {string} weekStartIso yyyy-MM-dd Saturday
 * @param {Array<{ date?: unknown, start_time?: unknown, end_time?: unknown }>} shifts
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
    const windows = formatDayShiftWindows(byDate.get(iso) || []);
    days.push(windows || ROTA_WA_DAY_OFF);
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
