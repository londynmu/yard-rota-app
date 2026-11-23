-- Corrective (idempotent): PR #82 Bugbot + prod if earlier push migrations
-- were already applied without these guards.
-- Safe to re-run.

GRANT SELECT (push_opt_in) ON public.profiles TO authenticated;
GRANT UPDATE (push_opt_in) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_due_break_push_targets(
  at_time timestamptz DEFAULT now()
)
RETURNS TABLE(
  break_id uuid,
  user_id uuid,
  kind text,
  wall_start timestamptz,
  start_hm text,
  idempotency_key text,
  fcm_token text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      at_time AS instant,
      (at_time AT TIME ZONE 'Europe/London')::date AS london_today
  ),
  candidates AS (
    SELECT
      sb.id AS break_id,
      sb.user_id,
      sb.break_start_time,
      CASE
        WHEN sb.shift_type = 'night'
          AND sb.break_start_time < TIME '07:00'
        THEN ((sb.date + 1) + sb.break_start_time) AT TIME ZONE 'Europe/London'
        ELSE (sb.date + sb.break_start_time) AT TIME ZONE 'Europe/London'
      END AS wall_start
    FROM public.scheduled_breaks sb
    CROSS JOIN params p
    WHERE sb.user_id IS NOT NULL
      AND sb.date BETWEEN (p.london_today - 1) AND (p.london_today + 1)
  ),
  due AS (
    SELECT
      c.break_id,
      c.user_id,
      't10'::text AS kind,
      c.wall_start,
      to_char(c.wall_start AT TIME ZONE 'Europe/London', 'HH24:MI') AS start_hm,
      format(
        'break:%s:t10:%s',
        c.break_id,
        to_char(c.wall_start AT TIME ZONE 'Europe/London', 'YYYYMMDDHH24MI')
      ) AS idempotency_key
    FROM candidates c
    CROSS JOIN params p
    WHERE c.wall_start >= p.instant + interval '9 minutes'
      AND c.wall_start < p.instant + interval '11 minutes'

    UNION ALL

    SELECT
      c.break_id,
      c.user_id,
      'start'::text AS kind,
      c.wall_start,
      to_char(c.wall_start AT TIME ZONE 'Europe/London', 'HH24:MI') AS start_hm,
      format(
        'break:%s:start:%s',
        c.break_id,
        to_char(c.wall_start AT TIME ZONE 'Europe/London', 'YYYYMMDDHH24MI')
      ) AS idempotency_key
    FROM candidates c
    CROSS JOIN params p
    WHERE c.wall_start >= p.instant - interval '1 minute'
      AND c.wall_start < p.instant + interval '1 minute'
  )
  SELECT
    d.break_id,
    d.user_id,
    d.kind,
    d.wall_start,
    d.start_hm,
    d.idempotency_key,
    dt.token AS fcm_token
  FROM due d
  INNER JOIN public.profiles pr
    ON pr.id = d.user_id
   AND COALESCE(pr.push_opt_in, true) = true
   AND pr.deleted_at IS NULL
   AND COALESCE(pr.is_active, true)
  INNER JOIN public.device_tokens dt
    ON dt.user_id = d.user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.break_push_sends s
    WHERE s.idempotency_key = d.idempotency_key
      AND s.status = 'sent'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_due_precheck_push_targets(
  at_time timestamptz DEFAULT now()
)
RETURNS TABLE(
  user_id uuid,
  rota_id uuid,
  first_name text,
  start_time text,
  idempotency_key text,
  fcm_token text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.user_id,
    t.rota_id,
    t.first_name,
    t.start_time,
    format('precheck_push:%s', t.rota_id) AS idempotency_key,
    dt.token AS fcm_token
  FROM public.get_missing_precheck_reminder_targets(at_time) t
  INNER JOIN public.profiles pr
    ON pr.id = t.user_id
   AND COALESCE(pr.push_opt_in, true) = true
   AND pr.deleted_at IS NULL
   AND COALESCE(pr.is_active, true)
  INNER JOIN public.device_tokens dt
    ON dt.user_id = t.user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.precheck_push_sends s
    WHERE s.idempotency_key = format('precheck_push:%s', t.rota_id)
    AND s.status = 'sent'
  );
$$;
