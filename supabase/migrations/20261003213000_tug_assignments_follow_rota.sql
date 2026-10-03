-- Tug badge follows the open scheduled_rota shift, in Europe/London.
-- A person is on a tug only while at_time is inside [shift_start, shift_end).
-- The pre_shift that counts is the latest one after their previous shift
-- ended (or after local midnight of this rota date, when they have no
-- earlier shift) and before this shift ends. During-shift reports do not
-- assign a tug. One tug keeps the newest check among people still on shift.

CREATE OR REPLACE FUNCTION public.get_active_tug_assignments(at_time timestamptz DEFAULT now())
RETURNS TABLE(user_id uuid, tug_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clock AS (
    SELECT
      at_time AS instant,
      (at_time AT TIME ZONE 'Europe/London')::date AS london_today
  ),
  raw_shifts AS (
    SELECT
      r.user_id,
      r.date::date AS rota_date,
      r.start_time::time AS start_time,
      r.end_time::time AS end_time
    FROM scheduled_rota r
    CROSS JOIN clock c
    WHERE r.user_id IS NOT NULL
      AND r.date IS NOT NULL
      AND r.start_time IS NOT NULL
      AND r.end_time IS NOT NULL
      AND r.date BETWEEN (c.london_today - 1) AND c.london_today
  ),
  intervals AS (
    SELECT
      user_id,
      rota_date,
      ((rota_date + start_time) AT TIME ZONE 'Europe/London') AS shift_start,
      (
        CASE
          WHEN end_time <= start_time THEN ((rota_date + 1) + end_time)
          ELSE (rota_date + end_time)
        END
      ) AT TIME ZONE 'Europe/London' AS shift_end
    FROM raw_shifts
  ),
  open_shift AS (
    SELECT DISTINCT ON (i.user_id)
      i.user_id,
      i.rota_date,
      i.shift_start,
      i.shift_end
    FROM intervals i
    CROSS JOIN clock c
    WHERE c.instant >= i.shift_start
      AND c.instant < i.shift_end
    ORDER BY i.user_id, i.shift_start DESC
  ),
  previous_end AS (
    SELECT
      o.user_id,
      MAX(i.shift_end) AS prev_end
    FROM open_shift o
    JOIN intervals i
      ON i.user_id = o.user_id
     AND i.shift_end <= o.shift_start
    GROUP BY o.user_id
  ),
  bounds AS (
    SELECT
      o.user_id,
      o.shift_end,
      COALESCE(
        p.prev_end,
        (o.rota_date::timestamp AT TIME ZONE 'Europe/London')
      ) AS window_start
    FROM open_shift o
    LEFT JOIN previous_end p ON p.user_id = o.user_id
  ),
  latest_per_user AS (
    SELECT DISTINCT ON (b.user_id)
      b.user_id,
      ps.tug_id,
      ps.check_time,
      COALESCE(NULLIF(btrim(t.display_name), ''), NULLIF(btrim(t.tug_number), '')) AS tug_name
    FROM bounds b
    JOIN precheck_submissions ps
      ON ps.user_id = b.user_id
     AND ps.check_type = 'pre_shift'
     AND ps.check_time >= b.window_start
     AND ps.check_time < b.shift_end
    JOIN tugs t ON t.id = ps.tug_id
    ORDER BY b.user_id, ps.check_time DESC
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

-- Older callers keep resolving. The date argument is ignored: the badge
-- follows whoever is inside a rota shift at now().
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
