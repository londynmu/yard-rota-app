/**
 * Log to system_activity_log. Returns a Promise – callers should await it before
 * updating UI so the request is not cancelled on unmount/navigation.
 * Never throws; errors are only logged to console.
 * @param {object} supabase - Supabase client
 * @param {object|null} user - { id } from useAuth; if null, log is skipped
 * @param {{ entity_type: string, action_type: string, entity_id?: string, payload?: object }} params
 * @returns {Promise<void>}
 */
export function logSystemActivity(supabase, user, params) {
  if (!supabase || !params?.entity_type || !params?.action_type) return Promise.resolve();
  const userId = user?.id ?? null;
  if (userId == null) return Promise.resolve();

  const row = {
    user_id: userId,
    entity_type: params.entity_type,
    action_type: params.action_type,
    entity_id: params.entity_id ?? null,
    payload: params.payload ?? null,
  };

  return supabase
    .from('system_activity_log')
    .insert(row)
    .then(() => {})
    .catch((err) => console.error('[systemActivityLog]', err));
}
