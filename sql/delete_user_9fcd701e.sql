-- Delete user 9fcd701e-e6c8-4607-9dfd-53aa936dd535
-- Run in Supabase SQL Editor as project owner / service role.
-- Run sql/find_user_references.sql first to see where this user appears.

-- 1. Auth (so no sessions/identities block later deletes)
DELETE FROM auth.refresh_tokens WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::text;
DELETE FROM auth.sessions   WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM auth.identities  WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;

-- 2. Public – tables that reference profiles(id) or auth.users(id)
DELETE FROM public.monthly_shunter_awards WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid OR awarded_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.shunter_performance   WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.shunter_violations    WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid OR created_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.precheck_submissions  WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
-- (precheck_items, precheck_damages removed by CASCADE from precheck_submissions;
--  precheck_damage_confirmations / precheck_damage_fixed_confirmations may need explicit delete if they reference user_id)
DELETE FROM public.precheck_damage_confirmations       WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.precheck_damage_fixed_confirmations WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
UPDATE public.precheck_damages SET resolved_by = NULL WHERE resolved_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
UPDATE public.defect_activity_log SET user_id = NULL WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.user_day_notes   WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.availability     WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.page_visits     WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
UPDATE public.scheduled_rota   SET user_id = NULL WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
UPDATE public.scheduled_breaks SET user_id = NULL, assigned_by = NULL WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid OR assigned_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.shift_claims WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM public.attendance   WHERE recorded_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;

-- 3. Profile and auth user
DELETE FROM public.profiles WHERE id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
DELETE FROM auth.users     WHERE id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid;
