-- High #21: hide email + notes_for_admin from direct table SELECT for authenticated/anon.
-- Own-row gate fields (role, account_status, profile_completed) stay readable.
-- Admin email lists continue via SECURITY DEFINER get_admin_profiles_with_emails().
-- yard_system_id stays readable for the performance leaderboard embed.

REVOKE SELECT (email, notes_for_admin) ON public.profiles FROM PUBLIC;
REVOKE SELECT (email, notes_for_admin) ON public.profiles FROM anon;
REVOKE SELECT (email, notes_for_admin) ON public.profiles FROM authenticated;

-- Table-level SELECT remains; only those two columns are withheld from clients.
-- service_role / postgres / SECURITY DEFINER RPCs still see all columns.
