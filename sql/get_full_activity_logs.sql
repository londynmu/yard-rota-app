-- Function to get full activity logs with user details
-- This will show exactly who (email, name) visited which page and when

CREATE OR REPLACE FUNCTION public.get_full_activity_logs(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 500
)
RETURNS TABLE (
  visit_id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  page_path text,
  page_title text,
  visited_at timestamptz,
  session_id text,
  time_ago text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    pv.id as visit_id,
    pv.user_id,
    u.email,
    p.first_name,
    p.last_name,
    pv.page_path,
    pv.page_title,
    pv.visited_at,
    pv.session_id,
    CASE 
      WHEN pv.visited_at > now() - interval '1 hour' THEN 
        EXTRACT(MINUTE FROM now() - pv.visited_at)::text || ' minutes ago'
      WHEN pv.visited_at > now() - interval '24 hours' THEN 
        EXTRACT(HOUR FROM now() - pv.visited_at)::text || ' hours ago'
      ELSE 
        EXTRACT(DAY FROM now() - pv.visited_at)::text || ' days ago'
    END as time_ago
  FROM public.page_visits pv
  INNER JOIN auth.users u ON pv.user_id = u.id
  LEFT JOIN public.profiles p ON pv.user_id = p.id
  WHERE pv.visited_at >= now() - (days_back || ' days')::interval
  ORDER BY pv.visited_at DESC
  LIMIT limit_count;
$$;

-- Grant permission to authenticated users (admins will be able to see all via RLS)
GRANT EXECUTE ON FUNCTION public.get_full_activity_logs(integer, integer) TO authenticated;

-- Function to get activity logs for a specific user
CREATE OR REPLACE FUNCTION public.get_user_activity_logs(
  target_user_id uuid,
  limit_count integer DEFAULT 100
)
RETURNS TABLE (
  visit_id uuid,
  page_path text,
  page_title text,
  visited_at timestamptz,
  session_id text,
  time_ago text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 
    pv.id as visit_id,
    pv.page_path,
    pv.page_title,
    pv.visited_at,
    pv.session_id,
    CASE 
      WHEN pv.visited_at > now() - interval '1 hour' THEN 
        EXTRACT(MINUTE FROM now() - pv.visited_at)::text || ' minutes ago'
      WHEN pv.visited_at > now() - interval '24 hours' THEN 
        EXTRACT(HOUR FROM now() - pv.visited_at)::text || ' hours ago'
      ELSE 
        EXTRACT(DAY FROM now() - pv.visited_at)::text || ' days ago'
    END as time_ago
  FROM public.page_visits pv
  WHERE pv.user_id = target_user_id
  ORDER BY pv.visited_at DESC
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_activity_logs(uuid, integer) TO authenticated;

-- Function to get activity summary by user (showing who was most active)
CREATE OR REPLACE FUNCTION public.get_user_activity_summary(days_back integer DEFAULT 7)
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  total_page_views bigint,
  unique_pages_visited bigint,
  last_activity timestamptz,
  most_visited_page text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH user_stats AS (
    SELECT 
      pv.user_id,
      COUNT(*)::bigint as total_views,
      COUNT(DISTINCT pv.page_path)::bigint as unique_pages,
      MAX(pv.visited_at) as last_visit,
      MODE() WITHIN GROUP (ORDER BY pv.page_title) as top_page
    FROM public.page_visits pv
    WHERE pv.visited_at >= now() - (days_back || ' days')::interval
    GROUP BY pv.user_id
  )
  SELECT 
    us.user_id,
    u.email,
    p.first_name,
    p.last_name,
    us.total_views,
    us.unique_pages,
    us.last_visit,
    us.top_page
  FROM user_stats us
  INNER JOIN auth.users u ON us.user_id = u.id
  LEFT JOIN public.profiles p ON us.user_id = p.id
  ORDER BY us.total_views DESC, us.last_visit DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_activity_summary(integer) TO authenticated;

