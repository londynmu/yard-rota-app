-- Fix high #21 follow-up: REVOKE SELECT (col) is a no-op when table-level
-- SELECT exists (Postgres keeps table GRANT; column REVOKE does nothing).
-- Convert anon/authenticated SELECT on public.profiles to column grants
-- excluding email + notes_for_admin.
-- Admin email lists stay on SECURITY DEFINER RPCs
-- (get_admin_profiles_with_emails / get_pending_users).
-- yard_system_id stays readable for the performance leaderboard embed.

REVOKE SELECT ON TABLE public.profiles FROM PUBLIC;
REVOKE SELECT ON TABLE public.profiles FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM authenticated;

GRANT SELECT (
  id,
  first_name,
  last_name,
  shift_preference,
  avatar_url,
  created_at,
  updated_at,
  profile_completed,
  role,
  is_active,
  performance_score,
  custom_start_time,
  custom_end_time,
  preferred_location,
  max_daily_hours,
  unavailable_days,
  status,
  agency_id,
  account_status,
  location,
  has_break_15,
  has_break_30,
  has_break_45,
  has_break_60,
  total_break_minutes,
  yard_system_id,
  additional_locations,
  preferred_start_time,
  deleted_at
) ON public.profiles TO anon, authenticated;
