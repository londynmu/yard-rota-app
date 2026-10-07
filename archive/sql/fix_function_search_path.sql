-- Fix function_search_path_mutable security warnings
-- This script adds SET search_path to all functions to prevent SQL injection attacks
-- IMPORTANT: This is SAFE - it only modifies function definitions, NOT data

-- ============================================================================
-- 1. get_user_auth_details
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_user_auth_details(uuid);
CREATE OR REPLACE FUNCTION public.get_user_auth_details(user_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  days_since_last_login integer,
  days_since_registration integer
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    u.id AS user_id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    CASE WHEN u.last_sign_in_at IS NOT NULL
      THEN EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer
      ELSE NULL
    END as days_since_last_login,
    EXTRACT(DAY FROM now() - u.created_at)::integer as days_since_registration
  FROM auth.users u
  WHERE u.id = user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_auth_details(uuid) TO authenticated;

-- ============================================================================
-- 2. get_user_role
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_user_role(UUID);
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS JSONB 
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role TEXT;
  is_admin BOOLEAN := FALSE;
BEGIN
  SELECT role INTO user_role FROM auth.users WHERE id = user_id;
  
  IF user_role = 'service_role' OR EXISTS (
    SELECT 1 FROM auth.users WHERE id = user_id AND email = 'tideend@gmail.com'
  ) THEN
    is_admin := TRUE;
  END IF;
  
  RETURN jsonb_build_object('is_admin', is_admin);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. update_agencies_updated_at
-- ============================================================================
-- Note: Using CASCADE because this function is used by a trigger
DROP FUNCTION IF EXISTS public.update_agencies_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_agencies_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Recreate the trigger that was dropped by CASCADE
DROP TRIGGER IF EXISTS update_agencies_updated_at ON public.agencies;
CREATE TRIGGER update_agencies_updated_at
BEFORE UPDATE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.update_agencies_updated_at();

-- ============================================================================
-- 4. update_user_day_notes_updated_at
-- ============================================================================
-- Note: Using CASCADE because this function is used by a trigger
DROP FUNCTION IF EXISTS public.update_user_day_notes_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_user_day_notes_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Recreate the trigger that was dropped by CASCADE
DROP TRIGGER IF EXISTS update_user_day_notes_updated_at ON public.user_day_notes;
CREATE TRIGGER update_user_day_notes_updated_at
BEFORE UPDATE ON public.user_day_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_user_day_notes_updated_at();

-- ============================================================================
-- 5. is_admin
-- ============================================================================
-- Note: This function is used by RLS policies, so we need to drop policies first
-- Drop policies that depend on is_admin() function
DROP POLICY IF EXISTS "Admin Full Access" ON public.profiles;
DROP POLICY IF EXISTS "Allow admin read access on availability" ON public.availability;
DROP POLICY IF EXISTS "Allow admin read access on profiles" ON public.profiles;

-- Now drop and recreate the function
DROP FUNCTION IF EXISTS public.is_admin();
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Recreate the RLS policies that use is_admin()
-- Policy: Admin Full Access on profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Admin Full Access'
    ) THEN
        CREATE POLICY "Admin Full Access" 
        ON public.profiles
        FOR ALL
        USING (public.is_admin() = true)
        WITH CHECK (public.is_admin() = true);
    END IF;
END $$;

-- Policy: Allow admin read access on availability
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'availability' 
        AND policyname = 'Allow admin read access on availability'
    ) THEN
        CREATE POLICY "Allow admin read access on availability" 
        ON public.availability
        FOR SELECT
        USING (public.is_admin() = true);
    END IF;
END $$;

-- Policy: Allow admin read access on profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'profiles' 
        AND policyname = 'Allow admin read access on profiles'
    ) THEN
        CREATE POLICY "Allow admin read access on profiles" 
        ON public.profiles
        FOR SELECT
        USING (public.is_admin() = true);
    END IF;
END $$;

-- ============================================================================
-- 6. get_user_last_login
-- ============================================================================
-- Note: auth.user_logins table doesn't exist in Supabase
-- Using auth.users.last_sign_in_at instead
DROP FUNCTION IF EXISTS public.get_user_last_login(uuid);
CREATE OR REPLACE FUNCTION public.get_user_last_login(uid uuid)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT last_sign_in_at FROM auth.users WHERE id = uid;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_last_login(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_last_login(uuid) TO service_role;

-- ============================================================================
-- 7. update_modified_column
-- ============================================================================
-- Note: Using CASCADE because this function is used by multiple triggers
DROP FUNCTION IF EXISTS public.update_modified_column() CASCADE;
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Recreate the triggers that were dropped by CASCADE
DROP TRIGGER IF EXISTS set_timestamp_profiles ON public.profiles;
CREATE TRIGGER set_timestamp_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS set_timestamp_availability ON public.availability;
CREATE TRIGGER set_timestamp_availability
BEFORE UPDATE ON public.availability
FOR EACH ROW
EXECUTE FUNCTION public.update_modified_column();

-- ============================================================================
-- 8. update_settings_updated_at
-- ============================================================================
-- Note: Using CASCADE because this function is used by a trigger
DROP FUNCTION IF EXISTS public.update_settings_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.update_settings_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Recreate the trigger that was dropped by CASCADE
DROP TRIGGER IF EXISTS update_settings_updated_at ON public.settings;
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.update_settings_updated_at();

-- ============================================================================
-- 9. create_pending_user
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_pending_user(TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_pending_user(
  first_name TEXT,
  last_name TEXT,
  shift_preference TEXT DEFAULT 'day',
  user_role TEXT DEFAULT 'user'
) RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_id UUID;
BEGIN
  SELECT gen_random_uuid() INTO new_id;
  
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    shift_preference,
    role,
    status,
    is_active,
    profile_completed,
    performance_score
  ) VALUES (
    new_id,
    first_name,
    last_name,
    shift_preference,
    user_role,
    'pending',
    true,
    false,
    50
  );
  
  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pending_user(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_user(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 10. get_all_unique_tasks
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_all_unique_tasks();
CREATE OR REPLACE FUNCTION public.get_all_unique_tasks()
RETURNS TABLE (task TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT sr.task 
  FROM public.scheduled_rota sr 
  WHERE sr.task IS NOT NULL AND sr.task != '' 
  ORDER BY sr.task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_unique_tasks() TO authenticated;

-- ============================================================================
-- 11. get_profiles_with_emails
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_profiles_with_emails();
CREATE OR REPLACE FUNCTION public.get_profiles_with_emails()
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    shift_preference TEXT,
    is_active BOOLEAN,
    performance_score INTEGER,
    email VARCHAR
) 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.shift_preference,
        p.is_active,
        p.performance_score,
        au.email
    FROM 
        public.profiles p
    JOIN 
        auth.users au ON p.id = au.id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. get_pending_users
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_pending_users();
CREATE OR REPLACE FUNCTION public.get_pending_users()
RETURNS TABLE (
    id uuid,
    email text,
    first_name text,
    last_name text,
    account_status text,
    shift_preference text,
    preferred_location text,
    created_at timestamptz,
    updated_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    u.email,
    p.first_name,
    p.last_name,
    p.account_status,
    p.shift_preference,
    p.preferred_location,
    p.created_at,
    p.updated_at
  FROM
    public.profiles p
  JOIN
    auth.users u ON p.id = u.id
  WHERE
    p.account_status = 'pending_approval'
  ORDER BY
    p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_users() TO service_role;

-- ============================================================================
-- 13. get_login_time_stats
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_login_time_stats();
CREATE OR REPLACE FUNCTION public.get_login_time_stats()
RETURNS TABLE (
  hour_of_day integer,
  day_of_week integer,
  login_count integer
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH login_times AS (
    SELECT 
      EXTRACT(HOUR FROM last_sign_in_at AT TIME ZONE 'UTC')::integer AS hour_of_day,
      EXTRACT(DOW FROM last_sign_in_at AT TIME ZONE 'UTC')::integer AS day_of_week
    FROM auth.users
    WHERE last_sign_in_at IS NOT NULL
  )
  SELECT 
    hour_of_day,
    day_of_week,
    COUNT(*)::integer AS login_count
  FROM login_times
  GROUP BY hour_of_day, day_of_week
  ORDER BY day_of_week, hour_of_day;
$$;

GRANT EXECUTE ON FUNCTION public.get_login_time_stats() TO authenticated;

-- ============================================================================
-- 14. create_temp_user (if exists - checking if needed)
-- ============================================================================
-- Note: This function may not exist. If it does, just set search_path.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'create_temp_user'
          AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'text, text, text'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.create_temp_user(TEXT, TEXT, TEXT) SET search_path = '''';';
    END IF;
END $$;

-- ============================================================================
-- 15. get_all_users_login_stats
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_all_users_login_stats();
CREATE OR REPLACE FUNCTION public.get_all_users_login_stats()
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  days_since_last_login integer,
  days_since_registration integer,
  login_count integer
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    p.id AS user_id,
    u.email,
    p.first_name,
    p.last_name,
    u.created_at,
    u.last_sign_in_at,
    CASE WHEN u.last_sign_in_at IS NOT NULL
      THEN EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer
      ELSE NULL
    END AS days_since_last_login,
    EXTRACT(DAY FROM now() - u.created_at)::integer AS days_since_registration,
    CASE 
      WHEN u.last_sign_in_at IS NULL THEN 0
      ELSE 1
    END AS login_count
  FROM 
    auth.users u
  LEFT JOIN
    public.profiles p ON u.id = p.id
  ORDER BY 
    u.last_sign_in_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users_login_stats() TO authenticated;

-- ============================================================================
-- 16. claim_shift
-- ============================================================================
DROP FUNCTION IF EXISTS public.claim_shift(UUID, UUID);
CREATE OR REPLACE FUNCTION public.claim_shift(
  shift_id UUID,
  user_id UUID
) 
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_shift RECORD;
  conflict_check RECORD;
  user_profile RECORD;
  response JSONB;
BEGIN
  SELECT * INTO target_shift 
  FROM public.scheduled_rota 
  WHERE id = shift_id 
  AND status = 'available'
  AND user_id IS NULL;

  IF target_shift IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Shift not found or not available for claiming'
    );
  END IF;
  
  SELECT * INTO user_profile 
  FROM public.profiles 
  WHERE id = claim_shift.user_id;

  IF user_profile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  SELECT * INTO conflict_check
  FROM public.scheduled_rota
  WHERE date = target_shift.date
  AND user_id = claim_shift.user_id
  AND id != shift_id
  AND (
    (start_time < target_shift.end_time AND end_time > target_shift.start_time)
  );

  IF conflict_check IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User already has a shift at this time'
    );
  END IF;

  UPDATE public.scheduled_rota
  SET user_id = claim_shift.user_id,
      status = 'claimed',
      updated_at = NOW()
  WHERE id = shift_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Shift claimed successfully'
  );
END;
$$;

-- ============================================================================
-- 17. get_complete_profiles_with_emails
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_complete_profiles_with_emails();
CREATE OR REPLACE FUNCTION public.get_complete_profiles_with_emails()
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    shift_preference TEXT,
    is_active BOOLEAN,
    performance_score INTEGER,
    email VARCHAR,
    custom_start_time TIME,
    custom_end_time TIME,
    preferred_location TEXT,
    max_daily_hours INTEGER,
    unavailable_days TEXT[],
    notes_for_admin TEXT,
    role TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.shift_preference,
        p.is_active,
        p.performance_score,
        au.email,
        p.custom_start_time,
        p.custom_end_time,
        p.preferred_location,
        p.max_daily_hours,
        p.unavailable_days,
        p.notes_for_admin,
        p.role,
        p.created_at,
        p.updated_at
    FROM 
        public.profiles p
    JOIN 
        auth.users au ON p.id = au.id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_complete_profiles_with_emails() TO authenticated;

-- ============================================================================
-- 18. get_inactive_users_stats
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_inactive_users_stats();
CREATE OR REPLACE FUNCTION public.get_inactive_users_stats()
RETURNS TABLE (
  inactive_range text,
  count integer,
  percentage numeric
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH user_counts AS (
    SELECT COUNT(*)::integer AS total FROM auth.users
  ),
  inactive_groups AS (
    SELECT
      CASE
        WHEN last_sign_in_at IS NULL THEN 'Never logged in'
        WHEN last_sign_in_at >= current_date - interval '7 days' THEN 'Active (last 7 days)'
        WHEN last_sign_in_at >= current_date - interval '30 days' THEN 'Inactive 7-30 days'
        WHEN last_sign_in_at >= current_date - interval '90 days' THEN 'Inactive 30-90 days'
        ELSE 'Inactive >90 days'
      END AS inactive_range,
      COUNT(*)::integer AS count
    FROM auth.users
    GROUP BY 1
  )
  SELECT 
    i.inactive_range,
    i.count,
    round((i.count::numeric / c.total) * 100, 1) AS percentage
  FROM inactive_groups i, user_counts c
  ORDER BY
    CASE i.inactive_range
      WHEN 'Active (last 7 days)' THEN 1
      WHEN 'Inactive 7-30 days' THEN 2
      WHEN 'Inactive 30-90 days' THEN 3
      WHEN 'Inactive >90 days' THEN 4
      WHEN 'Never logged in' THEN 5
    END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inactive_users_stats() TO authenticated;

-- ============================================================================
-- 19. get_monthly_user_stats
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_monthly_user_stats();
CREATE OR REPLACE FUNCTION public.get_monthly_user_stats()
RETURNS TABLE (
  month text,
  new_registrations integer,
  active_users integer,
  retention_rate numeric
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', current_date - interval '12 months'),
      date_trunc('month', current_date),
      interval '1 month'
    ) AS month_start
  ),
  registrations AS (
    SELECT 
      date_trunc('month', created_at) AS month,
      COUNT(*)::integer AS count
    FROM auth.users
    WHERE created_at >= current_date - interval '12 months'
    GROUP BY 1
  ),
  active AS (
    SELECT 
      date_trunc('month', last_sign_in_at) AS month,
      COUNT(DISTINCT id)::integer AS count
    FROM auth.users
    WHERE last_sign_in_at >= current_date - interval '12 months'
    GROUP BY 1
  ),
  total_users AS (
    SELECT 
      m.month_start,
      COUNT(u.id)::integer AS total
    FROM months m
    LEFT JOIN auth.users u ON u.created_at < m.month_start + interval '1 month'
    GROUP BY m.month_start
  )
  SELECT 
    to_char(m.month_start, 'YYYY-MM') AS month,
    COALESCE(r.count, 0) AS new_registrations,
    COALESCE(a.count, 0) AS active_users,
    CASE 
      WHEN t.total = 0 THEN 0
      ELSE round((COALESCE(a.count, 0)::numeric / t.total) * 100, 1)
    END AS retention_rate
  FROM months m
  LEFT JOIN registrations r ON m.month_start = r.month
  LEFT JOIN active a ON m.month_start = a.month
  LEFT JOIN total_users t ON m.month_start = t.month_start
  ORDER BY m.month_start;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_user_stats() TO authenticated;

-- ============================================================================
-- 20. manage_availability (if exists)
-- ============================================================================
-- Note: This function may not exist. If it does, just set search_path.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'manage_availability'
          AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'uuid, date, text, text'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.manage_availability(UUID, DATE, TEXT, TEXT) SET search_path = '''';';
    END IF;
END $$;

-- ============================================================================
-- 21. update_user_profile (if exists)
-- ============================================================================
-- Note: This function may not exist. If it does, just set search_path.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'update_user_profile'
          AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'uuid, jsonb'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.update_user_profile(UUID, JSONB) SET search_path = '''';';
    END IF;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================
-- All functions now have SET search_path = '' which prevents SQL injection
-- attacks through search_path manipulation. This is a security best practice
-- recommended by Supabase and PostgreSQL security guidelines.

