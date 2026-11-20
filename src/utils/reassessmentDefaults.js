import { addYears, format, parseISO } from 'date-fns';

/** Roles that never get auto reassessment dates or Assessments UI. */
export const REASSESSMENT_EXCLUDED_ROLES = new Set([
  'admin',
  'vmu',
  'transport_manager',
  'transport',
]);

export const AUTO_DUE_SOURCE = 'auto_due';

export function isReassessmentEligibleRole(role) {
  // Admin Users UI stores plain shunters as '' / null (option "User"), or explicit 'user'.
  if (role == null || role === '') return true;
  if (typeof role !== 'string') return false;
  if (REASSESSMENT_EXCLUDED_ROLES.has(role)) return false;
  return role === 'user';
}

export function isAutoDueAssessment(row) {
  return row?.profile_snapshot?.source === AUTO_DUE_SOURCE;
}

/**
 * First reassessment due = one year from first login / account created_at.
 * @param {string|Date} createdAt
 * @returns {string|null} yyyy-MM-dd
 */
export function defaultNextDueFromFirstLogin(createdAt) {
  if (!createdAt) return null;
  try {
    const base = typeof createdAt === 'string'
      ? (createdAt.includes('T') ? parseISO(createdAt) : new Date(`${createdAt.slice(0, 10)}T12:00:00`))
      : new Date(createdAt);
    if (Number.isNaN(base.getTime())) return null;
    return format(addYears(base, 1), 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

export function firstLoginYmd(createdAt) {
  if (!createdAt) return null;
  try {
    const base = typeof createdAt === 'string'
      ? (createdAt.includes('T') ? parseISO(createdAt) : new Date(`${createdAt.slice(0, 10)}T12:00:00`))
      : new Date(createdAt);
    if (Number.isNaN(base.getTime())) return null;
    return format(base, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

function buildProfileSnapshot(user) {
  if (!user) return { source: AUTO_DUE_SOURCE };
  return {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    yard_system_id: user.yard_system_id || '',
    agency_name: user.agency_name || '',
    preferred_location: user.preferred_location || user.location || '',
    source: AUTO_DUE_SOURCE,
  };
}

/**
 * Placeholder shunter_assessments row: schedules next due without a real assessment.
 */
export function buildAutoDueAssessmentPayload({ user, createdBy, nextDueDate }) {
  const loginYmd = firstLoginYmd(user?.created_at) || format(new Date(), 'yyyy-MM-dd');
  const due = nextDueDate || defaultNextDueFromFirstLogin(user?.created_at);
  if (!user?.id || !createdBy || !due) return null;
  return {
    user_id: user.id,
    assessment_date: loginYmd,
    next_due_date: due,
    duration: null,
    time_from: null,
    time_to: null,
    profile_snapshot: buildProfileSnapshot(user),
    image_paths: [],
    notes: 'Default reassessment date (one year from first login). No assessment recorded yet.',
    created_by: createdBy,
  };
}

/**
 * Insert default due rows for eligible users who have no shunter_assessments yet.
 * @returns {{ inserted: number, skipped: number }}
 */
export async function backfillMissingReassessmentDefaults(supabase, {
  users,
  createdBy,
  existingUserIds,
} = {}) {
  if (!supabase || !createdBy) return { inserted: 0, skipped: 0 };

  let knownIds = existingUserIds;
  if (!knownIds) {
    const { data, error } = await supabase.from('shunter_assessments').select('user_id');
    if (error) throw error;
    knownIds = new Set((data || []).map((r) => r.user_id));
  } else {
    knownIds = new Set(knownIds);
  }

  const eligible = (users || []).filter(
    (u) => u?.id && isReassessmentEligibleRole(u.role) && !knownIds.has(u.id),
  );

  if (eligible.length === 0) return { inserted: 0, skipped: (users || []).length };

  const payloads = eligible
    .map((user) => buildAutoDueAssessmentPayload({ user, createdBy }))
    .filter(Boolean);

  if (payloads.length === 0) return { inserted: 0, skipped: eligible.length };

  const { error: insertError } = await supabase.from('shunter_assessments').insert(payloads);
  if (insertError) throw insertError;

  return { inserted: payloads.length, skipped: (users || []).length - payloads.length };
}

/**
 * Ensure one default due row exists for a single eligible user.
 * @returns {object|null} inserted row or null if skipped
 */
export async function ensureUserReassessmentDefault(supabase, { user, createdBy }) {
  if (!supabase || !user?.id || !createdBy) return null;
  if (!isReassessmentEligibleRole(user.role)) return null;

  const { data: existing, error: fetchError } = await supabase
    .from('shunter_assessments')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);
  if (fetchError) throw fetchError;
  if (existing?.length) return null;

  const payload = buildAutoDueAssessmentPayload({ user, createdBy });
  if (!payload) return null;

  const { data, error } = await supabase
    .from('shunter_assessments')
    .insert(payload)
    .select('id, user_id, assessment_date, next_due_date, duration, time_from, time_to, profile_snapshot, image_paths, notes, created_at')
    .single();
  if (error) throw error;
  return data;
}
