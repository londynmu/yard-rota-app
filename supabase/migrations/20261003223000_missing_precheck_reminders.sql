-- Admin reminder: shunters whose rota shift is open and who have no
-- pre-shift in that shift's window. Same Europe/London bounds as
-- get_active_tug_assignments. Absent slots (no show / sick / late) are
-- left out. Non-admins get an empty set.

CREATE OR REPLACE FUNCTION public.get_missing_precheck_reminders(at_time timestamptz DEFAULT now())
RETURNS TABLE(
  user_id uuid,
  first_name text,
  last_name text,
  start_time text,
  end_time text
)
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
      r.id AS rota_id,
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
      rota_id,
      user_id,
      rota_date,
      start_time,
      end_time,
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
      i.rota_id,
      i.user_id,
      i.rota_date,
      i.start_time,
      i.end_time,
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
      o.rota_id,
      o.user_id,
      o.start_time,
      o.end_time,
      o.shift_end,
      COALESCE(
        p.prev_end,
        (o.rota_date::timestamp AT TIME ZONE 'Europe/London')
      ) AS window_start
    FROM open_shift o
    LEFT JOIN previous_end p ON p.user_id = o.user_id
  )
  SELECT
    b.user_id,
    COALESCE(pr.first_name, '') AS first_name,
    COALESCE(pr.last_name, '') AS last_name,
    to_char(b.start_time, 'HH24:MI') AS start_time,
    to_char(b.end_time, 'HH24:MI') AS end_time
  FROM bounds b
  JOIN profiles pr ON pr.id = b.user_id
  WHERE COALESCE(public.is_admin(), false)
    AND NOT EXISTS (
      SELECT 1
      FROM attendance a
      WHERE a.scheduled_rota_id = b.rota_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM precheck_submissions ps
      WHERE ps.user_id = b.user_id
        AND ps.check_type = 'pre_shift'
        AND ps.check_time >= b.window_start
        AND ps.check_time < b.shift_end
    )
  ORDER BY pr.last_name, pr.first_name;
$$;

REVOKE ALL ON FUNCTION public.get_missing_precheck_reminders(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_missing_precheck_reminders(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_missing_precheck_reminders(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_missing_precheck_reminders(timestamptz) TO service_role;
