/** Attendance exception statuses (DB `attendance.status`). Any status means the person was absent / not present on time. */
export const ATTENDANCE_OPTIONS = [
  { value: 'no_show', label: 'No show' },
  { value: 'sick', label: 'Sick' },
  { value: 'other', label: 'Other' },
];

export const ATTENDANCE_NOTE_MAX_LENGTH = 200;

/** Statuses that unassign the person from the rota after a tracked My Rota / planner flow. */
export const TRACKED_REMOVAL_STATUSES = new Set(['no_show', 'sick', 'other']);

const LABEL_BY_STATUS = {
  ...Object.fromEntries(ATTENDANCE_OPTIONS.map((opt) => [opt.value, opt.label])),
  // Historical records may still use late; keep label for display.
  late: 'Late',
};

export function attendanceLabel(status) {
  return LABEL_BY_STATUS[status] || null;
}

/** True when saving this status should also remove the person from scheduled_rota. */
export function shouldUnassignAfterAttendance(status) {
  return TRACKED_REMOVAL_STATUSES.has(status);
}
