-- Page visit tracking for detailed analytics
-- This will allow admins to see which pages are most visited

-- Create page_visits table
CREATE TABLE IF NOT EXISTS public.page_visits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  page_path text NOT NULL,
  page_title text,
  visited_at timestamptz DEFAULT now() NOT NULL,
  session_id text,
  user_agent text,
  ip_address inet
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_page_visits_user_id ON public.page_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_page_visits_page_path ON public.page_visits(page_path);
CREATE INDEX IF NOT EXISTS idx_page_visits_visited_at ON public.page_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_visits_session_id ON public.page_visits(session_id);

-- Enable RLS
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own page visits
CREATE POLICY "Users can insert their own page visits"
  ON public.page_visits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all page visits
CREATE POLICY "Admins can view all page visits"
  ON public.page_visits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to get most visited pages
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

-- Function to get page visits by hour
CREATE OR REPLACE FUNCTION public.get_page_visits_by_hour(days_back integer DEFAULT 7)
RETURNS TABLE (
  hour_of_day integer,
  visit_count bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    EXTRACT(HOUR FROM visited_at AT TIME ZONE 'UTC')::integer as hour_of_day,
    COUNT(*)::bigint as visit_count
  FROM public.page_visits
  WHERE visited_at >= now() - (days_back || ' days')::interval
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
$$;

-- Function to get page visits by day
CREATE OR REPLACE FUNCTION public.get_page_visits_by_day(days_back integer DEFAULT 30)
RETURNS TABLE (
  visit_date date,
  visit_count bigint,
  unique_visitors bigint
)
LANGUAGE sql
SECURITY DEFINER
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

-- Function to get user page visit history
CREATE OR REPLACE FUNCTION public.get_user_page_visits(target_user_id uuid, limit_count integer DEFAULT 100)
RETURNS TABLE (
  page_path text,
  page_title text,
  visited_at timestamptz,
  session_id text
)
LANGUAGE sql
SECURITY DEFINER
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

-- Function to get detailed login history with more information
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
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE login_events AS (
    -- This is a simplified version - in production you'd track actual login events
    SELECT 
      u.id as user_id,
      u.email,
      p.first_name,
      p.last_name,
      u.last_sign_in_at as login_time,
      u.last_sign_in_at::text as ip_address, -- Placeholder, actual IP not available in auth.users
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

-- Function to get active users in time ranges
CREATE OR REPLACE FUNCTION public.get_active_users_by_timerange()
RETURNS TABLE (
  time_range text,
  user_count bigint,
  percentage numeric
)
LANGUAGE sql
SECURITY DEFINER
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_most_visited_pages(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_page_visits_by_hour(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_page_visits_by_day(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_page_visits(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_detailed_login_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_users_by_timerange() TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT ON public.page_visits TO authenticated;





