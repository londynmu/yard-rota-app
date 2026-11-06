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

/**
 * Stacked per-day shift summary (no weekday names):
 * "21 December, 5pm–5pm"
 * Multiple days joined with " · ".
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
    const dayShifts = byDate.get(date).slice().sort((a, b) =>
      String(a.start_time || '').localeCompare(String(b.start_time || '')),
    );
    const windows = dayShifts.map((s) => {
      const start = formatShiftTimeAmPm(s.start_time);
      const end = formatShiftTimeAmPm(s.end_time);
      if (start && end) return `${start}–${end}`;
      return start || end || '';
    }).filter(Boolean);
    const dateLabel = formatShiftDateLong(date);
    if (!windows.length) return dateLabel;
    return `${dateLabel}, ${windows.join(', ')}`;
  }).filter(Boolean);

  return lines.join(' · ');
}

/**
 * Unique location label for template {{4}}.
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
