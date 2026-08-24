/**
 * Additional-booking (dobook) helpers: clock format, delta vs week baseline, agency emails.
 */

export const EMAIL_SIGN_OFF = 'Michal Warda';
export const MAILTO_BODY_SAFE_LIMIT = 1800;

/**
 * Postgres time often arrives as HH:mm:ss. Display and compare as HH:mm.
 * @param {unknown} value
 * @returns {string}
 */
export function formatShiftClock(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return s;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/**
 * @param {unknown} value
 * @returns {string} yyyy-MM-dd
 */
export function normalizeShiftDate(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

/**
 * Stable identity for an assigned shift (not scheduled_rota.id).
 * @param {{ user_id?: string, date?: unknown, start_time?: unknown, end_time?: unknown, location?: string }} slot
 * @returns {string}
 */
export function assignmentSlotKey(slot) {
  return [
    slot?.user_id ?? '',
    normalizeShiftDate(slot?.date),
    formatShiftClock(slot?.start_time),
    formatShiftClock(slot?.end_time),
    String(slot?.location ?? '').trim(),
  ].join('|');
}

/**
 * @param {{ first_name?: string, last_name?: string, name?: string }} person
 * @returns {string}
 */
export function staffDisplayName(person) {
  if (person?.name) return String(person.name).trim();
  const first = String(person?.first_name ?? '').trim();
  const last = String(person?.last_name ?? '').trim();
  const full = `${first} ${last}`.trim();
  return full || 'Unassigned';
}

/**
 * @param {unknown} shiftType
 * @returns {string}
 */
export function formatShiftTypeLabel(shiftType) {
  const raw = String(shiftType ?? '').trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Current assigned slots minus baseline snapshot.
 * @param {object[]} currentSlots
 * @param {object[]} baselineSlots
 * @returns {object[]}
 */
export function diffAddedSlots(currentSlots, baselineSlots) {
  const baseKeys = new Set((baselineSlots || []).map(assignmentSlotKey));
  return (currentSlots || []).filter(
    (slot) => slot?.user_id && !baseKeys.has(assignmentSlotKey(slot))
  );
}

/**
 * Group added slots by agency, then person. Kind is "new" if the person had
 * no slots in the baseline; otherwise "extra".
 * @param {object[]} addedSlots
 * @param {object[]} baselineSlots
 * @returns {Array<{
 *   agencyId: string|null,
 *   agencyName: string,
 *   agencyEmail: string,
 *   people: Array<{
 *     userId: string,
 *     name: string,
 *     kind: 'new'|'extra',
 *     shifts: Array<{ date: string, shift_type: string, start_time: string, end_time: string, location: string }>
 *   }>
 * }>}
 */
export function groupAddedSlotsByAgency(addedSlots, baselineSlots) {
  const baselineUserIds = new Set((baselineSlots || []).map((s) => s.user_id).filter(Boolean));
  const byAgency = new Map();

  for (const slot of addedSlots || []) {
    if (!slot?.user_id) continue;
    const agencyId = slot.agency_id || null;
    const mapKey = agencyId || '__none__';
    if (!byAgency.has(mapKey)) {
      byAgency.set(mapKey, {
        agencyId,
        agencyName: slot.agency_name || 'No agency',
        agencyEmail: slot.agency_email || '',
        peopleMap: new Map(),
      });
    }
    const group = byAgency.get(mapKey);
    if (!group.peopleMap.has(slot.user_id)) {
      group.peopleMap.set(slot.user_id, {
        userId: slot.user_id,
        name: staffDisplayName(slot),
        kind: baselineUserIds.has(slot.user_id) ? 'extra' : 'new',
        shifts: [],
      });
    }
    group.peopleMap.get(slot.user_id).shifts.push({
      date: normalizeShiftDate(slot.date),
      shift_type: slot.shift_type || '',
      start_time: formatShiftClock(slot.start_time),
      end_time: formatShiftClock(slot.end_time),
      location: slot.location || '',
    });
  }

  const groups = Array.from(byAgency.values()).map((group) => {
    const people = Array.from(group.peopleMap.values()).map((person) => {
      person.shifts.sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.start_time.localeCompare(b.start_time);
      });
      return person;
    });
    people.sort((a, b) => a.name.localeCompare(b.name));
    return {
      agencyId: group.agencyId,
      agencyName: group.agencyName,
      agencyEmail: group.agencyEmail,
      people,
    };
  });

  groups.sort((a, b) => {
    if (!a.agencyId && b.agencyId) return 1;
    if (a.agencyId && !b.agencyId) return -1;
    return a.agencyName.localeCompare(b.agencyName);
  });

  return groups;
}

/**
 * @param {ReturnType<typeof groupAddedSlotsByAgency>} groups
 * @returns {number}
 */
export function countAdditionalPeople(groups) {
  return (groups || []).reduce((n, group) => n + group.people.length, 0);
}

/**
 * @param {string} weekStartIso yyyy-MM-dd Saturday
 * @returns {string} dd/MM/yyyy - dd/MM/yyyy
 */
export function formatWeekRangeLabel(weekStartIso) {
  const start = parseIsoDateLocal(weekStartIso);
  if (!start) return '';
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatUkDate(start)} - ${formatUkDate(end)}`;
}

/**
 * @param {string} iso yyyy-MM-dd
 * @returns {string} e.g. Wednesday 27/08/2026
 */
export function formatShiftDayLabel(iso) {
  const d = parseIsoDateLocal(iso);
  if (!d) return iso || '';
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  return `${weekday} ${formatUkDate(d)}`;
}

/**
 * @param {{ weekStartIso: string, people: Array<{ name: string, kind: 'new'|'extra', shifts: object[] }> }} args
 * @returns {{ subject: string, body: string }}
 */
export function buildAdditionalBookingsEmail({ weekStartIso, people }) {
  const weekRange = formatWeekRangeLabel(weekStartIso);
  const subject = `Additional shunter bookings: ${weekRange}`;
  const blocks = (people || []).map((person) => {
    const kindLabel = person.kind === 'new' ? 'new booking' : 'extra shifts';
    const lines = (person.shifts || []).map((shift) => {
      const day = formatShiftDayLabel(shift.date);
      const hours = `${formatShiftClock(shift.start_time)}-${formatShiftClock(shift.end_time)}`;
      const shiftLabel = formatShiftTypeLabel(shift.shift_type);
      const location = shift.location ? `, ${shift.location}` : '';
      return `- ${day}, ${shiftLabel}, ${hours}${location}`;
    });
    return `${person.name} (${kindLabel})\n${lines.join('\n')}`;
  });

  const body = [
    `Please book the following additional shunter(s) for the week ${weekRange}:`,
    '',
    blocks.join('\n\n'),
    '',
    'Please confirm these bookings.',
    '',
    'Best regards',
    '',
    EMAIL_SIGN_OFF,
  ].join('\n');

  return { subject, body };
}

/**
 * @param {unknown} emailField
 * @returns {string[]}
 */
export function parseAgencyEmails(emailField) {
  if (emailField == null) return [];
  return String(emailField)
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * @param {{ emails: string[], subject: string, body: string }} args
 * @returns {string}
 */
export function buildMailtoHref({ emails, subject, body }) {
  const to = (emails || []).filter(Boolean).join(',');
  return `mailto:${to}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
}

/**
 * @param {string} href
 * @param {string} [body]
 * @returns {boolean}
 */
export function isMailtoTooLong(href, body) {
  if (body != null && body.length > MAILTO_BODY_SAFE_LIMIT) return true;
  return String(href || '').length > 2000;
}

/**
 * @param {{ subject: string, body: string }} email
 * @returns {string}
 */
export function formatEmailForClipboard({ subject, body }) {
  return `Subject: ${subject}\n\n${body}`;
}

function parseIsoDateLocal(iso) {
  const normalized = normalizeShiftDate(iso);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatUkDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
