-- Harden remaining activity / page-visit RPCs left open after 20261026140000.
-- Body admin check first, then REVOKE anon/public (same order as critical hardening).

-- get_page_visits_by_hour (was LANGUAGE sql — convert to plpgsql for guard)
CREATE OR REPLACE FUNCTION public.get_page_visits_by_hour(days_back integer DEFAULT 7)
RETURNS TABLE (
  hour_of_day integer,
  visit_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM pv.visited_at AT TIME ZONE 'UTC')::integer AS hour_of_day,
    COUNT(*)::bigint AS visit_count
  FROM public.page_visits pv
  WHERE pv.visited_at >= now() - (days_back || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_page_visits_by_hour(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_page_visits_by_hour(integer) TO authenticated;

-- get_page_visits_by_day
CREATE OR REPLACE FUNCTION public.get_page_visits_by_day(days_back integer DEFAULT 30)
RETURNS TABLE (
  visit_date date,
  visit_count bigint,
  unique_visitors bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    DATE(pv.visited_at AT TIME ZONE 'UTC') AS visit_date,
    COUNT(*)::bigint AS visit_count,
    COUNT(DISTINCT pv.user_id)::bigint AS unique_visitors
  FROM public.page_visits pv
  WHERE pv.visited_at >= now() - (days_back || ' days')::interval
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_page_visits_by_day(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_page_visits_by_day(integer) TO authenticated;

-- get_user_page_visits
CREATE OR REPLACE FUNCTION public.get_user_page_visits(
  target_user_id uuid,
  limit_count integer DEFAULT 100
)
RETURNS TABLE (
  page_path text,
  page_title text,
  visited_at timestamptz,
  session_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pv.page_path,
    pv.page_title,
    pv.visited_at,
    pv.session_id
  FROM public.page_visits pv
  WHERE pv.user_id = target_user_id
  ORDER BY pv.visited_at DESC
  LIMIT limit_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_page_visits(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_page_visits(uuid, integer) TO authenticated;

-- get_active_users_by_timerange
CREATE OR REPLACE FUNCTION public.get_active_users_by_timerange()
RETURNS TABLE (
  time_range text,
  user_count bigint,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH total AS (
    SELECT COUNT(*)::bigint AS total_users FROM auth.users
  ),
  ranges AS (
    SELECT
      CASE
        WHEN u.last_sign_in_at >= now() - interval '1 hour' THEN 'Last Hour'
        WHEN u.last_sign_in_at >= now() - interval '24 hours' THEN 'Last 24 Hours'
        WHEN u.last_sign_in_at >= now() - interval '7 days' THEN 'Last 7 Days'
        WHEN u.last_sign_in_at >= now() - interval '30 days' THEN 'Last 30 Days'
        WHEN u.last_sign_in_at >= now() - interval '90 days' THEN 'Last 90 Days'
        WHEN u.last_sign_in_at IS NOT NULL THEN 'Over 90 Days'
        ELSE 'Never'
      END AS time_range
    FROM auth.users u
  )
  SELECT
    r.time_range,
    COUNT(*)::bigint AS user_count,
    ROUND((COUNT(*)::numeric / t.total_users) * 100, 1) AS percentage
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
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_users_by_timerange() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_users_by_timerange() TO authenticated;

-- get_most_active_users (prod reads public.page_views — keep that)
CREATE OR REPLACE FUNCTION public.get_most_active_users(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  user_email text,
  first_name text,
  last_name text,
  page_view_count bigint,
  last_activity timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pv.user_email,
    pv.first_name,
    pv.last_name,
    COUNT(*)::bigint AS page_view_count,
    MAX(pv.visited_at) AS last_activity
  FROM public.page_views pv
  WHERE pv.visited_at >= now() - (days_back || ' days')::interval
  GROUP BY pv.user_email, pv.first_name, pv.last_name
  ORDER BY page_view_count DESC
  LIMIT limit_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_most_active_users(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_most_active_users(integer, integer) TO authenticated;

-- get_system_activity_log already checks is_admin — revoke anon/public only
REVOKE ALL ON FUNCTION public.get_system_activity_log(integer, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_activity_log(integer, integer, text, uuid) TO authenticated;
