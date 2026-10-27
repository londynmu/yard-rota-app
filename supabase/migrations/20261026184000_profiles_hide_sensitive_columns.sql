-- High #21 (attempt): hide email + notes_for_admin from direct table SELECT.
-- NOTE: with an existing table-level SELECT grant this REVOKE is a no-op in
-- Postgres. The real fix is 20261027053000_profiles_hide_sensitive_columns_fix.sql
-- (REVOKE table SELECT + GRANT SELECT on safe columns only).
-- Kept for migration history / idempotent replay on fresh envs that never had
-- table-level SELECT (unlikely on Supabase defaults).

REVOKE SELECT (email, notes_for_admin) ON public.profiles FROM PUBLIC;
REVOKE SELECT (email, notes_for_admin) ON public.profiles FROM anon;
REVOKE SELECT (email, notes_for_admin) ON public.profiles FROM authenticated;
