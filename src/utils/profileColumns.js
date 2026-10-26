/**
 * Columns safe for authenticated clients after #21 column revoke
 * (email + notes_for_admin are admin RPC only).
 */
export const PROFILE_DIRECTORY_COLUMNS =
  'id, first_name, last_name, avatar_url, shift_preference, preferred_location, additional_locations, preferred_start_time, custom_start_time, custom_end_time, agency_id, yard_system_id, role, account_status, profile_completed, is_active, location';

export const PROFILE_SELF_COLUMNS = `${PROFILE_DIRECTORY_COLUMNS}, has_break_15, has_break_30, has_break_45, has_break_60, total_break_minutes, max_daily_hours, unavailable_days, status, performance_score, created_at, updated_at`;
