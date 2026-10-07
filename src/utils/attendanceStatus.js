/** Attendance exception statuses (DB `attendance.status`). Any status means the person was absent / not present on time. */
export const ATTENDANCE_OPTIONS = [
  { value: 'no_show', label: 'No show' },
  { value: 'sick', label: 'Sick' },
  { value: 'late', label: 'Late' },
  { value: 'other', label: 'Other' },
];

export const ATTENDANCE_NOTE_MAX_LENGTH = 200;

const LABEL_BY_STATUS = Object.fromEntries(ATTENDANCE_OPTIONS.map((opt) => [opt.value, opt.label]));

export function attendanceLabel(status) {
  return LABEL_BY_STATUS[status] || null;
}
