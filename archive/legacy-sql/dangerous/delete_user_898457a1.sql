-- Delete user 23f624d1-273e-470c-96c4-43127ee7ea20
-- Run in Supabase SQL Editor (as project owner / service role).

DELETE FROM auth.identities     WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM auth.refresh_tokens WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid::text;
DELETE FROM auth.sessions       WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;

DELETE FROM public.monthly_shunter_awards WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid OR awarded_by = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM public.shunter_performance WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM public.precheck_submissions WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
UPDATE public.precheck_damages SET resolved_by = NULL WHERE resolved_by = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
UPDATE public.defect_activity_log SET user_id = NULL WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM public.user_day_notes WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM public.availability WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM public.page_visits WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
UPDATE public.scheduled_rota SET user_id = NULL WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
UPDATE public.scheduled_breaks SET user_id = NULL WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
UPDATE public.scheduled_breaks SET assigned_by = NULL WHERE assigned_by = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM public.shift_claims WHERE user_id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;

DELETE FROM public.profiles WHERE id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
DELETE FROM auth.users WHERE id = '23f624d1-273e-470c-96c4-43127ee7ea20'::uuid;
