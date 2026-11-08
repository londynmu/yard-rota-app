/** Rota WhatsApp helpers for Edge Functions (mirrors src/utils/rotaWhatsApp.js). */

export const ROTA_WA_BLOCKING_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "accepted",
  "read",
] as const;

export const ROTA_WA_RESEND_COOLDOWN_MS = 15 * 60 * 1000;

export function shunterWeekIdempotencyKey(
  weekStartIso: string,
  userId: string,
): string {
  return `shunter_week:${weekStartIso}:${userId}`;
}

export function assignmentPingIdempotencyKey(scheduledRotaId: string): string {
  return `assignment_ping:${scheduledRotaId}:shunter`;
}

export function adminResendIdempotencyKey(
  baseKey: string,
  at: number | string = Date.now(),
): string {
  return `${baseKey}:resend:${String(at)}`;
}

export function isBlockingStatus(status: string | null | undefined): boolean {
  return ROTA_WA_BLOCKING_STATUSES.includes(
    String(status || "").toLowerCase() as (typeof ROTA_WA_BLOCKING_STATUSES)[number],
  );
}

export function formatShiftTimeAmPm(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return s;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return s;
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  if (minute === 0) return `${hour}${suffix}`;
  return `${hour}:${String(minute).padStart(2, "0")}${suffix}`;
}

export function formatShiftDateLong(iso: unknown): string {
  if (iso == null || iso === "") return "";
  const raw = String(iso).trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** Week range for template {{2}}: e.g. 24-30 Oct (ASCII hyphen, no leading zeros). */
export function formatRotaWeekRangeShort(weekStartIso: string): string {
  const raw = String(weekStartIso || "").trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(start.getTime())) return raw;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startDay = String(start.getDate());
  const endDay = String(end.getDate());
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const mon = start.toLocaleDateString("en-GB", { month: "short" });
    return `${startDay}-${endDay} ${mon}`;
  }
  const startMon = start.toLocaleDateString("en-GB", { month: "short" });
  const endMon = end.toLocaleDateString("en-GB", { month: "short" });
  return `${startDay} ${startMon}-${endDay} ${endMon}`;
}

/**
 * Placeholder for unused week-template day slots (Meta forbids empty vars).
 * Em dash — never empty, never the word "off".
 */
export const ROTA_WA_DAY_OFF = "—";

/** Title Case EN weekday labels Sat→Fri (embedded in v4 day line values). */
export const ROTA_WA_WEEK_DAY_LABELS = [
  "Sat",
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
] as const;

/** English ordinal day-of-month: 1st, 2nd, 3rd, 4th, … */
export function formatOrdinalDay(day: unknown): string {
  const n = Number(day);
  if (!Number.isFinite(n) || n <= 0) return String(day ?? "");
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

export function rotaWeekDayIso(weekStartIso: string, dayOffset: number): string {
  const raw = String(weekStartIso || "").trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + dayOffset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatShiftTime24h(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return s;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return s;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Short calendar date for week lines: d/m (no leading zeros). */
export function formatShiftDateShort(iso: unknown): string {
  if (iso == null || iso === "") return "";
  const raw = String(iso).trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return raw;
  return `${day}/${month}`;
}

/** am/pm windows — assignment ping / short UI labels. */
export function formatDayShiftWindows(
  dayShifts: Array<{ start_time?: unknown; end_time?: unknown }>,
): string {
  const sorted = (dayShifts || []).slice().sort((a, b) =>
    String(a.start_time || "").localeCompare(String(b.start_time || ""))
  );
  return sorted
    .map((s) => {
      const start = formatShiftTimeAmPm(s.start_time);
      const end = formatShiftTimeAmPm(s.end_time);
      if (start && end) return `${start}–${end}`;
      return start || end || "";
    })
    .filter(Boolean)
    .join(", ");
}

/** 24h windows for week ContentVariables. */
export function formatDayShiftWindows24h(
  dayShifts: Array<{ start_time?: unknown; end_time?: unknown }>,
): string {
  const sorted = (dayShifts || []).slice().sort((a, b) =>
    String(a.start_time || "").localeCompare(String(b.start_time || ""))
  );
  return sorted
    .map((s) => {
      const start = formatShiftTime24h(s.start_time);
      const end = formatShiftTime24h(s.end_time);
      if (start && end) return `${start}-${end}`;
      return start || end || "";
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * One v4 day line: `Fri 30th 17:00-05:15 (Rugby)`.
 * Multi-window same yard: location once at end; different yards: per window.
 */
export function formatShunterWeekDayLine(
  iso: string,
  weekdayLabel: string,
  dayShifts: Array<{ start_time?: unknown; end_time?: unknown; location?: unknown }>,
): string {
  const sorted = (dayShifts || []).slice().sort((a, b) =>
    String(a.start_time || "").localeCompare(String(b.start_time || ""))
  );
  if (!sorted.length) return ROTA_WA_DAY_OFF;

  const locations = sorted.map((s) => String(s?.location || "").trim());
  const uniqueLocs = [...new Set(locations.filter(Boolean))];
  const allSameLocation = uniqueLocs.length <= 1;

  const windows = sorted
    .map((s, idx) => {
      const start = formatShiftTime24h(s.start_time);
      const end = formatShiftTime24h(s.end_time);
      const window = start && end ? `${start}-${end}` : (start || end || "");
      if (!window) return "";
      if (!allSameLocation) {
        const loc = locations[idx];
        return loc ? `${window} (${loc})` : window;
      }
      return window;
    })
    .filter(Boolean);

  if (!windows.length) return ROTA_WA_DAY_OFF;

  const dayMatch = String(iso || "").trim().slice(0, 10).match(/^\d{4}-\d{2}-(\d{2})$/);
  const ordinal = dayMatch ? formatOrdinalDay(Number(dayMatch[1])) : "";
  const head = [weekdayLabel, ordinal].filter(Boolean).join(" ");
  const body = windows.join(", ");
  if (allSameLocation && uniqueLocs[0]) {
    return `${head} ${body} (${uniqueLocs[0]})`;
  }
  return `${head} ${body}`;
}

/**
 * Seven values for week template vars {{3}}…{{9}} (v4).
 * Fixed Sat→Fri slots (no left-pack); empty days are `—`.
 * Line shape: `Fri 30th 17:00-05:15 (Rugby)` (bullet lives in the Twilio template).
 */
export function buildShunterWeekDayVariables(
  weekStartIso: string,
  shifts: Array<{
    date?: unknown;
    start_time?: unknown;
    end_time?: unknown;
    location?: unknown;
  }>,
): string[] {
  const byDate = new Map<string, typeof shifts>();
  for (const shift of shifts || []) {
    const date = String(shift?.date || "").trim().slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(shift);
  }

  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const iso = rotaWeekDayIso(weekStartIso, i);
    days.push(
      formatShunterWeekDayLine(iso, ROTA_WA_WEEK_DAY_LABELS[i], byDate.get(iso) || []),
    );
  }
  return days;
}

/** Kept for assignment ping / short UI labels — not for week ContentVariables. */
export function formatShunterShiftSummary(
  shifts: Array<{ date?: unknown; start_time?: unknown; end_time?: unknown }>,
): string {
  const byDate = new Map<string, typeof shifts>();
  for (const shift of shifts || []) {
    const date = String(shift?.date || "").trim().slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(shift);
  }
  const dates = [...byDate.keys()].sort();
  const lines = dates.map((date) => {
    const windows = formatDayShiftWindows(byDate.get(date) || []);
    const dateLabel = formatShiftDateLong(date);
    if (!windows) return dateLabel;
    return `${dateLabel}, ${windows}`;
  }).filter(Boolean);
  return lines.join(" · ");
}

export function formatShunterLocations(
  shifts: Array<{ location?: unknown }>,
): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const shift of shifts || []) {
    const loc = String(shift?.location || "").trim();
    if (!loc || seen.has(loc)) continue;
    seen.add(loc);
    labels.push(loc);
  }
  return labels.join(", ");
}

export function formatCreatorDisplayName(profile: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();
  return `${first} ${last}`.trim() || "Yard Rota";
}

export function isValidPhoneE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
