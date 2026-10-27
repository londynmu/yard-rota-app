-- Complete Activity Tracking Setup
-- Run this file to set up full activity tracking with detailed logs

-- PART 1: Create page_visits table and basic functions (if not exists)
-- This is from page_tracking.sql

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

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert their own page visits" ON public.page_visits;
DROP POLICY IF EXISTS "Admins can view all page visits" ON public.page_visits;

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

-- Grant table permissions
GRANT SELECT, INSERT ON public.page_visits TO authenticated;

-- PART 2: Create detailed activity tracking functions

-- Function to get full activity logs with user details
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

-- Grant permissions to all new functions
GRANT EXECUTE ON FUNCTION public.get_full_activity_logs(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_activity_logs(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_activity_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_most_visited_pages(integer) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Activity tracking setup complete!';
  RAISE NOTICE 'You can now view detailed activity logs in Admin Dashboard → Statistics → Page Activity Logs';
END $$;

