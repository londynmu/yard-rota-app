/** Mirrors src/utils/rotaAssignmentPush.js for Edge digests. */

export const ROTA_ASSIGNMENT_PUSH_TYPE = "rota_assignment_digest";

export function formatRotaAssignmentDigestBody(count: number): string {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 1) {
    return "You've been added to a shift. Open My Rota to check.";
  }
  return `You've been added to ${n} shifts. Open My Rota to check.`;
}

export type AssignmentPushRow = {
  user_id: string;
  scheduled_rota_id: string;
  idempotency_key: string;
  fcm_token: string;
};

export type AssignmentPushGroup = {
  user_id: string;
  fcm_token: string;
  scheduled_rota_ids: string[];
  idempotency_keys: string[];
  count: number;
};

export function groupRotaAssignmentPushTargets(
  rows: AssignmentPushRow[],
): AssignmentPushGroup[] {
  const byUser = new Map<
    string,
    {
      user_id: string;
      fcm_token: string;
      scheduled_rota_ids: string[];
      idempotency_keys: string[];
      seenRota: Set<string>;
    }
  >();

  for (const row of rows || []) {
    const userId = String(row?.user_id || "");
    const token = String(row?.fcm_token || "");
    const rotaId = String(row?.scheduled_rota_id || "");
    const key = String(row?.idempotency_key || "");
    if (!userId || !token || !rotaId || !key) continue;
    let bucket = byUser.get(userId);
    if (!bucket) {
      bucket = {
        user_id: userId,
        fcm_token: token,
        scheduled_rota_ids: [],
        idempotency_keys: [],
        seenRota: new Set(),
      };
      byUser.set(userId, bucket);
    }
    if (bucket.seenRota.has(rotaId)) continue;
    bucket.seenRota.add(rotaId);
    bucket.scheduled_rota_ids.push(rotaId);
    bucket.idempotency_keys.push(key);
  }

  return [...byUser.values()].map((bucket) => ({
    user_id: bucket.user_id,
    fcm_token: bucket.fcm_token,
    scheduled_rota_ids: bucket.scheduled_rota_ids,
    idempotency_keys: bucket.idempotency_keys,
    count: bucket.scheduled_rota_ids.length,
  }));
}

export type RotaShiftDetail = {
  id: string;
  date: string;
  location: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  label: string;
};

function timeHm(value: unknown): string {
  const raw = String(value ?? "");
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function dateGb(value: unknown): string {
  const raw = String(value ?? "");
  // YYYY-MM-DD -> DD/MM/YYYY
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Human line for inbox: "24/11/2026 · NRC · day · 07:00-17:00" */
export function formatRotaShiftDetailLabel(row: {
  date?: unknown;
  location?: unknown;
  shift_type?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}): string {
  const date = dateGb(row.date);
  const location = String(row.location ?? "").trim() || "Unknown";
  const shift = String(row.shift_type ?? "").trim() || "shift";
  const start = timeHm(row.start_time) || "??:??";
  const end = timeHm(row.end_time) || "??:??";
  return `${date} · ${location} · ${shift} · ${start}-${end}`;
}

export function mapRotaShiftDetails(
  rows: Array<Record<string, unknown>> | null | undefined,
): RotaShiftDetail[] {
  return (rows || [])
    .map((row) => {
      const id = String(row.id ?? "");
      if (!id) return null;
      return {
        id,
        date: String(row.date ?? ""),
        location: String(row.location ?? ""),
        shift_type: String(row.shift_type ?? ""),
        start_time: timeHm(row.start_time),
        end_time: timeHm(row.end_time),
        label: formatRotaShiftDetailLabel(row),
      };
    })
    .filter((row): row is RotaShiftDetail => row != null);
}
