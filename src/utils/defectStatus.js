/** Repair statuses VMU can pick. Older values (awaiting_parts, in_progress) stay valid in the database. */
export const VMU_STATUS_KEYS = ['open', 'reported', 'acknowledged', 'resolved'];

/**
 * Options for a status picker. A legacy current status is appended so the picker
 * never shows a wrong value for an older defect.
 */
export function getStatusOptions(statusConfig, currentStatus) {
  const keys = currentStatus && !VMU_STATUS_KEYS.includes(currentStatus)
    ? [...VMU_STATUS_KEYS, currentStatus]
    : VMU_STATUS_KEYS;
  return keys.map((value) => ({
    value,
    label: statusConfig?.[value]?.label || value,
    dot: statusConfig?.[value]?.dot || 'bg-slate-300',
  }));
}
