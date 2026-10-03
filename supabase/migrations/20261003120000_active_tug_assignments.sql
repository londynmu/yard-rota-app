-- Active tug badge for the break list.
-- One row per driver: their latest pre-shift check inside the current
-- Europe/London shift cycle. A tug handed to someone else stays with the
-- newer check only.
--
-- Night cycle (local time >= 17:00, or < 07:00): from 15:00 on the night
-- start date through 07:00 the next morning. The two hours before 17:00
-- keep a check done before the shift starts.
-- Day cycle (07:00-17:00): from 05:00 through 17:00 the same calendar day.
-- During-shift damage reports do not assign a tug.

CREATE OR REPLACE FUNCTION public.get_active_tug_assignments(at_time timestamptz DEFAULT now())
RETURNS TABLE(user_id uuid, tug_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH local_now AS (
    SELECT (at_time AT TIME ZONE 'Europe/London') AS local_ts
  ),
  bounds AS (
    SELECT
      CASE
        WHEN local_ts::time >= time '17:00'
          THEN date_trunc('day', local_ts) + interval '15 hours'
        WHEN local_ts::time < time '07:00'
          THEN date_trunc('day', local_ts) - interval '1 day' + interval '15 hours'
        ELSE
          date_trunc('day', local_ts) + interval '5 hours'
      END AS window_start_local,
      CASE
        WHEN local_ts::time >= time '17:00'
          THEN date_trunc('day', local_ts) + interval '1 day' + interval '7 hours'
        WHEN local_ts::time < time '07:00'
          THEN date_trunc('day', local_ts) + interval '7 hours'
        ELSE
          date_trunc('day', local_ts) + interval '17 hours'
      END AS window_end_local
    FROM local_now
  ),
  window_utc AS (
    SELECT
      (window_start_local AT TIME ZONE 'Europe/London') AS window_start,
      (window_end_local AT TIME ZONE 'Europe/London') AS window_end
    FROM bounds
  ),
  latest_per_user AS (
    SELECT DISTINCT ON (ps.user_id)
      ps.user_id,
      ps.tug_id,
      ps.check_time,
      COALESCE(NULLIF(btrim(t.display_name), ''), NULLIF(btrim(t.tug_number), '')) AS tug_name
    FROM precheck_submissions ps
    JOIN tugs t ON t.id = ps.tug_id
    CROSS JOIN window_utc w
    WHERE ps.check_type = 'pre_shift'
      AND ps.check_time >= w.window_start
      AND ps.check_time < w.window_end
    ORDER BY ps.user_id, ps.check_time DESC
  ),
  latest_driver AS (
    SELECT DISTINCT ON (tug_id)
      user_id
    FROM latest_per_user
    WHERE tug_name IS NOT NULL
    ORDER BY tug_id, check_time DESC, user_id
  )
  SELECT l.user_id, l.tug_name
  FROM latest_per_user l
  JOIN latest_driver d ON d.user_id = l.user_id
  WHERE l.tug_name IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_active_tug_assignments(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_tug_assignments(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_tug_assignments(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_tug_assignments(timestamptz) TO service_role;

-- Kept so older callers still resolve. The date argument is ignored:
-- the badge always follows the cycle that is open at now().
CREATE OR REPLACE FUNCTION public.get_tug_assignments_for_date(target_date date)
RETURNS TABLE(user_id uuid, tug_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.user_id, a.tug_name
  FROM public.get_active_tug_assignments(now()) AS a
  WHERE target_date IS NULL OR target_date IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_tug_assignments_for_date(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tug_assignments_for_date(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tug_assignments_for_date(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tug_assignments_for_date(date) TO service_role;
