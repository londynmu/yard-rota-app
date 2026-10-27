-- =============================================================================
-- 1. FIND USER: where user 9fcd701e-e6c8-4607-9dfd-53aa936dd535 appears
-- Run this first to see all tables and row counts.
-- =============================================================================

DO $$
DECLARE
  uid uuid := '9fcd701e-e6c8-4607-9dfd-53aa936dd535';
  n   bigint;
  t   text;
BEGIN
  RAISE NOTICE '=== User % ===', uid;

  -- auth
  SELECT count(*) INTO n FROM auth.users WHERE id = uid;
  RAISE NOTICE 'auth.users: %', n;

  SELECT count(*) INTO n FROM auth.identities WHERE user_id = uid;
  RAISE NOTICE 'auth.identities: %', n;

  SELECT count(*) INTO n FROM auth.sessions WHERE user_id = uid;
  RAISE NOTICE 'auth.sessions: %', n;

  -- public
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    SELECT count(*) INTO n FROM public.profiles WHERE id = uid;
    RAISE NOTICE 'public.profiles: %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_day_notes') THEN
    SELECT count(*) INTO n FROM public.user_day_notes WHERE user_id = uid;
    RAISE NOTICE 'public.user_day_notes (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'availability') THEN
    SELECT count(*) INTO n FROM public.availability WHERE user_id = uid;
    RAISE NOTICE 'public.availability (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'page_visits') THEN
    SELECT count(*) INTO n FROM public.page_visits WHERE user_id = uid;
    RAISE NOTICE 'public.page_visits (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scheduled_rota') THEN
    SELECT count(*) INTO n FROM public.scheduled_rota WHERE user_id = uid;
    RAISE NOTICE 'public.scheduled_rota (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scheduled_breaks') THEN
    SELECT count(*) INTO n FROM public.scheduled_breaks WHERE user_id = uid OR assigned_by = uid;
    RAISE NOTICE 'public.scheduled_breaks (user_id or assigned_by): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shift_claims') THEN
    SELECT count(*) INTO n FROM public.shift_claims WHERE user_id = uid;
    RAISE NOTICE 'public.shift_claims (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'precheck_submissions') THEN
    SELECT count(*) INTO n FROM public.precheck_submissions WHERE user_id = uid;
    RAISE NOTICE 'public.precheck_submissions (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'precheck_damages') THEN
    SELECT count(*) INTO n FROM public.precheck_damages WHERE resolved_by = uid;
    RAISE NOTICE 'public.precheck_damages (resolved_by): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'precheck_damage_confirmations') THEN
    SELECT count(*) INTO n FROM public.precheck_damage_confirmations WHERE user_id = uid;
    RAISE NOTICE 'public.precheck_damage_confirmations (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'precheck_damage_fixed_confirmations') THEN
    SELECT count(*) INTO n FROM public.precheck_damage_fixed_confirmations WHERE user_id = uid;
    RAISE NOTICE 'public.precheck_damage_fixed_confirmations (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shunter_violations') THEN
    SELECT count(*) INTO n FROM public.shunter_violations WHERE user_id = uid OR created_by = uid;
    RAISE NOTICE 'public.shunter_violations (user_id or created_by): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attendance') THEN
    SELECT count(*) INTO n FROM public.attendance WHERE recorded_by = uid;
    RAISE NOTICE 'public.attendance (recorded_by): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'monthly_shunter_awards') THEN
    SELECT count(*) INTO n FROM public.monthly_shunter_awards WHERE user_id = uid OR awarded_by = uid;
    RAISE NOTICE 'public.monthly_shunter_awards (user_id or awarded_by): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shunter_performance') THEN
    SELECT count(*) INTO n FROM public.shunter_performance WHERE user_id = uid;
    RAISE NOTICE 'public.shunter_performance (user_id): %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'defect_activity_log') THEN
    SELECT count(*) INTO n FROM public.defect_activity_log WHERE user_id = uid;
    RAISE NOTICE 'public.defect_activity_log (user_id): %', n;
  END IF;

  RAISE NOTICE '=== End ===';
END $$;

-- =============================================================================
-- 2. SINGLE QUERY: table name + count (run in Supabase SQL Editor for a result set)
-- =============================================================================

SELECT "table", cnt
FROM (
  SELECT 'auth.users' AS "table", count(*) AS cnt FROM auth.users WHERE id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'profiles', count(*) FROM public.profiles WHERE id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'user_day_notes', count(*) FROM public.user_day_notes WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'availability', count(*) FROM public.availability WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'page_visits', count(*) FROM public.page_visits WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'scheduled_rota', count(*) FROM public.scheduled_rota WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'scheduled_breaks', count(*) FROM public.scheduled_breaks WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid OR assigned_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'shift_claims', count(*) FROM public.shift_claims WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'precheck_submissions', count(*) FROM public.precheck_submissions WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'precheck_damages (resolved_by)', count(*) FROM public.precheck_damages WHERE resolved_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'precheck_damage_confirmations', count(*) FROM public.precheck_damage_confirmations WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'precheck_damage_fixed_confirmations', count(*) FROM public.precheck_damage_fixed_confirmations WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'shunter_violations', count(*) FROM public.shunter_violations WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid OR created_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'attendance (recorded_by)', count(*) FROM public.attendance WHERE recorded_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'monthly_shunter_awards', count(*) FROM public.monthly_shunter_awards WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid OR awarded_by = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'shunter_performance', count(*) FROM public.shunter_performance WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
  UNION ALL SELECT 'defect_activity_log', count(*) FROM public.defect_activity_log WHERE user_id = '9fcd701e-e6c8-4607-9dfd-53aa936dd535'::uuid
) t
ORDER BY "table";
