/**
 * Pure helpers for Admin Dashboard "Recent activity" rows.
 */

const SYSTEM_ACTION_LABELS = {
  slot_added: 'Added a slot',
  slot_deleted: 'Deleted a slot',
  slot_updated: 'Updated a slot',
  employee_assigned: 'Assigned',
  employee_unassigned: 'Unassigned',
  slots_copied: 'Copied slots',
  template_applied: 'Applied a template',
  template_saved: 'Saved a template',
  shift_claimed: 'Claimed a shift',
  breaks_saved: 'Saved breaks',
  breaks_custom_slot_deleted: 'Deleted a custom break',
  break_assignment_added: 'Added to a break',
  break_assignment_removed: 'Removed from a break',
  rota_baseline_created: 'Created rota baseline',
  additional_bookings_sent: 'Sent additional bookings',
};

/** Actions worth showing on the dashboard feed (skip noisy bulk noise later if needed). */
export const DASHBOARD_SYSTEM_ACTIONS = new Set([
  'employee_assigned',
  'employee_unassigned',
  'break_assignment_added',
  'break_assignment_removed',
  'slot_added',
  'slot_deleted',
  'slot_updated',
  'slots_copied',
  'additional_bookings_sent',
  'rota_baseline_created',
  'template_applied',
]);

function personName(first, last) {
  const name = `${first || ''} ${last || ''}`.trim();
  return name || 'Unknown';
}

function parsePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'object') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function systemActionLabel(actionType) {
  return SYSTEM_ACTION_LABELS[actionType] || actionType || 'Updated';
}

export function targetUserIdFromPayload(payload, actionType) {
  const p = parsePayload(payload);
  if (!p) return null;
  if (
    actionType === 'employee_assigned' ||
    actionType === 'break_assignment_added'
  ) {
    return p.assigned_user_id || null;
  }
  if (
    actionType === 'employee_unassigned' ||
    actionType === 'break_assignment_removed'
  ) {
    return p.unassigned_user_id || p.assigned_user_id || null;
  }
  return null;
}

/**
 * @param {object} log - row from get_system_activity_log
 * @param {Record<string, string>} nameById - target user id → display name
 */
export function formatSystemActivityItem(log, nameById = {}) {
  if (!log?.id) return null;
  if (log.action_type && !DASHBOARD_SYSTEM_ACTIONS.has(log.action_type)) {
    return null;
  }

  const actor = personName(log.first_name, log.last_name);
  const area = log.entity_type === 'breaks' ? 'Breaks' : 'Rota';
  const action = systemActionLabel(log.action_type);
  const targetId = targetUserIdFromPayload(log.payload, log.action_type);
  const targetName = targetId ? nameById[targetId] : null;
  const payload = parsePayload(log.payload);
  const whenBits = [payload?.date, payload?.shift_type, payload?.location]
    .filter(Boolean)
    .join(' · ');

  let detail = `${area} · ${action}`;
  if (targetName) detail = `${area} · ${action} ${targetName}`;
  else if (whenBits) detail = `${area} · ${action} · ${whenBits}`;

  return {
    id: `system-${log.id}`,
    kind: 'system',
    actionType: log.action_type || null,
    section: log.entity_type === 'breaks' ? 'breaks' : 'rota-planner',
    title: actor,
    detail,
    at: log.created_at,
  };
}

/**
 * Keep the feed readable: at most `maxPerAction` rows per system action_type
 * (newest first — pass a date-sorted list).
 */
export function diversifySystemItems(items, maxPerAction = 3) {
  const counts = Object.create(null);
  return (items || []).filter((item) => {
    const key = item?.actionType || 'other';
    counts[key] = (counts[key] || 0) + 1;
    return counts[key] <= maxPerAction;
  });
}

/**
 * @param {object} row - shunter_assessments row with nested profiles
 */
export function formatAssessmentActivityItem(row) {
  if (!row?.id) return null;
  const assessed = personName(
    row.profiles?.first_name ?? row.assessed_first_name,
    row.profiles?.last_name ?? row.assessed_last_name,
  );
  const creator = personName(
    row.creator?.first_name ?? row.created_by_profile?.first_name,
    row.creator?.last_name ?? row.created_by_profile?.last_name,
  );
  const dateLabel = row.assessment_date
    ? ` · ${row.assessment_date}`
    : '';

  return {
    id: `assessment-${row.id}`,
    kind: 'assessment',
    section: 'users',
    userId: row.user_id || null,
    title: assessed,
    detail: `Shunter assessment · by ${creator}${dateLabel}`,
    at: row.created_at || row.updated_at,
  };
}

/**
 * Merge and sort activity items newest-first.
 * @param {Array<object>} groups
 * @param {number} limit
 */
export function mergeActivityItems(groups, limit = 12) {
  const flat = (groups || []).flat().filter(Boolean);
  flat.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return flat.slice(0, limit);
}

/**
 * Prefer a mixed feed: take from each source bucket in round-robin order
 * after each bucket is already newest-first.
 */
export function interleaveActivityItems(groups, limit = 12) {
  const queues = (groups || [])
    .map((group) => [...(group || [])].filter(Boolean))
    .filter((group) => group.length > 0);
  queues.forEach((group) => {
    group.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  });

  const out = [];
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (const group of queues) {
      if (out.length >= limit) break;
      if (group.length === 0) continue;
      out.push(group.shift());
      progressed = true;
    }
  }
  out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return out;
}
