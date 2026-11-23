-- Android FCM: device tokens, push opt-in, break push ledger + targeting RPC.
-- Do NOT apply to production until the owner explicitly approves.
-- Cron template at bottom stays DISABLED until FIREBASE_SERVICE_ACCOUNT is set
-- and a manual Edge smoke test succeeds.

-- ---------------------------------------------------------------------------
-- profiles.push_opt_in
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_opt_in boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.push_opt_in IS
  'When false, break/precheck FCM pushes are not sent to this user.';

-- Own-row updates (same pattern as whatsapp_opt_in column grant).
GRANT UPDATE (push_opt_in) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- device_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android'
    CHECK (platform IN ('android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_tokens_token_key UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx
  ON public.device_tokens (user_id);

COMMENT ON TABLE public.device_tokens IS
  'FCM registration tokens for Android push (one row per device token).';

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tokens_select_own ON public.device_tokens;
CREATE POLICY device_tokens_select_own
  ON public.device_tokens
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS device_tokens_insert_own ON public.device_tokens;
CREATE POLICY device_tokens_insert_own
  ON public.device_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS device_tokens_update_own ON public.device_tokens;
CREATE POLICY device_tokens_update_own
  ON public.device_tokens
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS device_tokens_delete_own ON public.device_tokens;
CREATE POLICY device_tokens_delete_own
  ON public.device_tokens
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.device_tokens FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_tokens TO authenticated;
GRANT ALL ON TABLE public.device_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- break_push_sends (ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.break_push_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  break_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('t10', 'start')),
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'skipped')),
  idempotency_key text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS break_push_sends_idempotency_key_uidx
  ON public.break_push_sends (idempotency_key);

CREATE INDEX IF NOT EXISTS break_push_sends_user_created_idx
  ON public.break_push_sends (user_id, created_at DESC);

COMMENT ON TABLE public.break_push_sends IS
  'Idempotent ledger for break FCM pushes (T-10 and start).';

ALTER TABLE public.break_push_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS break_push_sends_select_admin ON public.break_push_sends;
CREATE POLICY break_push_sends_select_admin
  ON public.break_push_sends
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.break_push_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.break_push_sends TO authenticated;
GRANT ALL ON TABLE public.break_push_sends TO service_role;

-- ---------------------------------------------------------------------------
-- Targeting: due break pushes in Europe/London (T-10 and start windows)
-- ---------------------------------------------------------------------------
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
  INNER JOIN public.device_tokens dt
    ON dt.user_id = d.user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.break_push_sends s
    WHERE s.idempotency_key = d.idempotency_key
      AND s.status = 'sent'
  );
$$;

REVOKE ALL ON FUNCTION public.get_due_break_push_targets(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_due_break_push_targets(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_due_break_push_targets(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_break_push_targets(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- Cron template (DISABLED until secrets + smoke test)
-- ---------------------------------------------------------------------------
/*
DO $$
DECLARE
  existing_id bigint;
BEGIN
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'break-push-reminders'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '* * * * *',
      command := $cmd$
  SELECT net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-break-push-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$,
      active := false
    );
  ELSE
    PERFORM cron.schedule(
      'break-push-reminders',
      '* * * * *',
      $cmd$
  SELECT net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-break-push-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
    );
    UPDATE cron.job SET active = false WHERE jobname = 'break-push-reminders';
  END IF;
END $$;
*/
