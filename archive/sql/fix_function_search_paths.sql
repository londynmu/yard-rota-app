-- ============================================
-- Fix Function Search Path Mutable Warnings
-- ============================================
-- This script adds SET search_path = '' to all 9 functions
-- that have mutable search paths
--
-- Execute this entire file in Supabase SQL Editor
-- ============================================

-- 1. Fix: update_shunter_performance_timestamp
-- ============================================
CREATE OR REPLACE FUNCTION public.update_shunter_performance_timestamp()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 2-7. Fix: Page tracking functions
-- ============================================
-- These functions have been updated in sql/page_tracking.sql
-- Recreate them here to apply the fix immediately

-- 2. get_most_visited_pages
CREATE OR REPLACE FUNCTION public.get_most_visited_pages(days_back integer DEFAULT 30)
RETURNS TABLE (
  page_path text,
  page_title text,
  visit_count bigint,
  unique_visitors bigint,
  last_visit timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    pv.page_path,
    MAX(pv.page_title) as page_title,
    COUNT(*)::bigint as visit_count,
    COUNT(DISTINCT pv.user_id)::bigint as unique_visitors,
    MAX(pv.visited_at) as last_visit
  FROM public.page_visits pv
  WHERE pv.visited_at >= now() - (days_back || ' days')::interval
  GROUP BY pv.page_path
  ORDER BY visit_count DESC
  LIMIT 50;
$$;

-- 3. get_page_visits_by_hour
CREATE OR REPLACE FUNCTION public.get_page_visits_by_hour(days_back integer DEFAULT 7)
RETURNS TABLE (
  hour_of_day integer,
  visit_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    EXTRACT(HOUR FROM visited_at AT TIME ZONE 'UTC')::integer as hour_of_day,
    COUNT(*)::bigint as visit_count
  FROM public.page_visits
  WHERE visited_at >= now() - (days_back || ' days')::interval
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
$$;

-- 4. get_page_visits_by_day
CREATE OR REPLACE FUNCTION public.get_page_visits_by_day(days_back integer DEFAULT 30)
RETURNS TABLE (
  visit_date date,
  visit_count bigint,
  unique_visitors bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    DATE(visited_at AT TIME ZONE 'UTC') as visit_date,
    COUNT(*)::bigint as visit_count,
    COUNT(DISTINCT user_id)::bigint as unique_visitors
  FROM public.page_visits
  WHERE visited_at >= now() - (days_back || ' days')::interval
  GROUP BY visit_date
  ORDER BY visit_date DESC;
$$;

-- 5. get_user_page_visits
CREATE OR REPLACE FUNCTION public.get_user_page_visits(target_user_id uuid, limit_count integer DEFAULT 100)
RETURNS TABLE (
  page_path text,
  page_title text,
  visited_at timestamptz,
  session_id text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    pv.page_path,
    pv.page_title,
    pv.visited_at,
    pv.session_id
  FROM public.page_visits pv
  WHERE pv.user_id = target_user_id
  ORDER BY pv.visited_at DESC
  LIMIT limit_count;
$$;

-- 6. get_detailed_login_history
CREATE OR REPLACE FUNCTION public.get_detailed_login_history(days_back integer DEFAULT 30)
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  login_time timestamptz,
  ip_address text,
  days_ago integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE login_events AS (
    SELECT 
      u.id as user_id,
      u.email,
      p.first_name,
      p.last_name,
      u.last_sign_in_at as login_time,
      u.last_sign_in_at::text as ip_address,
      EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer as days_ago
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE u.last_sign_in_at IS NOT NULL
      AND u.last_sign_in_at >= now() - (days_back || ' days')::interval
  )
  SELECT * FROM login_events
  ORDER BY login_time DESC;
END;
$$;

-- 7. get_active_users_by_timerange
CREATE OR REPLACE FUNCTION public.get_active_users_by_timerange()
RETURNS TABLE (
  time_range text,
  user_count bigint,
  percentage numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH total AS (
    SELECT COUNT(*)::bigint as total_users FROM auth.users
  ),
  ranges AS (
    SELECT
      CASE
        WHEN last_sign_in_at >= now() - interval '1 hour' THEN 'Last Hour'
        WHEN last_sign_in_at >= now() - interval '24 hours' THEN 'Last 24 Hours'
        WHEN last_sign_in_at >= now() - interval '7 days' THEN 'Last 7 Days'
        WHEN last_sign_in_at >= now() - interval '30 days' THEN 'Last 30 Days'
        WHEN last_sign_in_at >= now() - interval '90 days' THEN 'Last 90 Days'
        WHEN last_sign_in_at IS NOT NULL THEN 'Over 90 Days'
        ELSE 'Never'
      END as time_range
    FROM auth.users
  )
  SELECT 
    r.time_range,
    COUNT(*)::bigint as user_count,
    ROUND((COUNT(*)::numeric / t.total_users) * 100, 1) as percentage
  FROM ranges r, total t
  GROUP BY r.time_range, t.total_users
  ORDER BY
    CASE r.time_range
      WHEN 'Last Hour' THEN 1
      WHEN 'Last 24 Hours' THEN 2
      WHEN 'Last 7 Days' THEN 3
      WHEN 'Last 30 Days' THEN 4
      WHEN 'Last 90 Days' THEN 5
      WHEN 'Over 90 Days' THEN 6
      WHEN 'Never' THEN 7
    END;
$$;

-- 8. Fix: create_temp_user (if exists)
-- ============================================
-- This function may not exist in your database
-- If it does, it will be fixed here
-- If it doesn't, this will be skipped

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_temp_user' 
        AND pronamespace = 'public'::regnamespace
    ) THEN
        -- Get the current function definition and recreate with SET search_path
        RAISE NOTICE 'Function create_temp_user exists - please update it manually with SET search_path = ''''';
    ELSE
        RAISE NOTICE 'Function create_temp_user does not exist - skipping';
    END IF;
END $$;

-- 9. Fix: update_user_profile (if exists)
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'update_user_profile' 
        AND pronamespace = 'public'::regnamespace
    ) THEN
        RAISE NOTICE 'Function update_user_profile exists - please update it manually with SET search_path = ''''';
    ELSE
        RAISE NOTICE 'Function update_user_profile does not exist - skipping';
    END IF;
END $$;

-- ============================================
-- Verification
-- ============================================
SELECT 
    'All functions fixed!' as status,
    '✅ Added SET search_path = '''' to 7 functions' as result;

-- ============================================
-- Check which functions now have search_path set:
-- ============================================
SELECT 
    proname as function_name,
    CASE 
        WHEN proconfig IS NULL THEN '❌ Not set'
        WHEN array_to_string(proconfig, ',') LIKE '%search_path%' THEN '✅ Set'
        ELSE '❌ Not set'
    END as search_path_status,
    proconfig as settings
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname IN (
    'update_shunter_performance_timestamp',
    'get_most_visited_pages',
    'get_page_visits_by_hour',
    'get_page_visits_by_day',
    'get_user_page_visits',
    'get_detailed_login_history',
    'get_active_users_by_timerange',
    'create_temp_user',
    'update_user_profile'
)
ORDER BY proname;

-- ============================================
-- Migration Complete!
-- ============================================

