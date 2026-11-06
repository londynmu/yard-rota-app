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

export function formatRotaWeekRangeShort(weekStartIso: string): string {
  const raw = String(weekStartIso || "").trim().slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(start.getTime())) return raw;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startDay = String(start.getDate()).padStart(2, "0");
  const endDay = String(end.getDate()).padStart(2, "0");
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const mon = start.toLocaleDateString("en-GB", { month: "short" });
    return `${startDay}–${endDay} ${mon}`;
  }
  const startLabel = start.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  const endLabel = end.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  return `${startLabel}–${endLabel}`;
}

/** Placeholder for empty Sat–Fri day slots in week template v2 (Meta forbids empty vars). */
export const ROTA_WA_DAY_OFF = "off";

/** Fixed weekday labels for Sat→Fri week (matches yard_rota_week_shunter_v2 body). */
export const ROTA_WA_WEEK_DAY_LABELS = [
  "Sat",
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
] as const;

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

/**
 * Seven Sat→Fri values for week template vars {{4}}…{{10}}.
 * Empty days are always `off` (never blank — Meta rejects empty Content Variables).
 */
export function buildShunterWeekDayVariables(
  weekStartIso: string,
  shifts: Array<{ date?: unknown; start_time?: unknown; end_time?: unknown }>,
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
    const windows = formatDayShiftWindows(byDate.get(iso) || []);
    days.push(windows || ROTA_WA_DAY_OFF);
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
