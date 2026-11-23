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
