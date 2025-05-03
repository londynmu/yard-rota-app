-- Login statistics functions for admin dashboard

-- Drop existing functions if they exist (to handle potential signature changes)
DROP FUNCTION IF EXISTS public.get_user_auth_details(uuid);
DROP FUNCTION IF EXISTS public.get_all_users_login_stats();
DROP FUNCTION IF EXISTS public.get_login_time_stats();
DROP FUNCTION IF EXISTS public.get_monthly_user_stats();
DROP FUNCTION IF EXISTS public.get_inactive_users_stats();

-- 1. Get details for individual users including login history
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

-- 2. Get all users with login statistics
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
    -- Instead of a non-existent column, use a calculated value
    -- Since we don't track login count directly, we'll use an estimation
    -- based on sign-in events or just set a default value
    CASE 
      WHEN u.last_sign_in_at IS NULL THEN 0
      ELSE 1 -- At least logged in once if they have a last_sign_in_at
    END AS login_count
  FROM 
    auth.users u
  LEFT JOIN
    public.profiles p ON u.id = p.id
  ORDER BY 
    u.last_sign_in_at DESC NULLS LAST;
$$;

-- 3. Get login statistics by time patterns
CREATE OR REPLACE FUNCTION public.get_login_time_stats()
RETURNS TABLE (
  hour_of_day integer,
  day_of_week integer,
  login_count integer
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- Since we don't have actual login logs with timestamps,
  -- we'll create a simulated dataset based on last_sign_in_at
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

-- 4. Get monthly user statistics
CREATE OR REPLACE FUNCTION public.get_monthly_user_stats()
RETURNS TABLE (
  month text,
  new_registrations integer,
  active_users integer,
  retention_rate numeric
) 
LANGUAGE sql
SECURITY DEFINER
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

-- 5. Get inactive users statistics
CREATE OR REPLACE FUNCTION public.get_inactive_users_stats()
RETURNS TABLE (
  inactive_range text,
  count integer,
  percentage numeric
) 
LANGUAGE sql
SECURITY DEFINER
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_auth_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_users_login_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_time_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_user_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inactive_users_stats() TO authenticated;