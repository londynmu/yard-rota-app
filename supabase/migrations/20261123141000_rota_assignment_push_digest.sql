-- FCM digest when a shunter is added to scheduled_rota (no removal pushes).
-- Cron 10:00 and 16:00 Europe/London; starts INACTIVE until smoke + owner approval.
-- Depends on device_tokens + profiles.push_opt_in.
-- Do NOT apply to production until the owner explicitly approves.

CREATE TABLE IF NOT EXISTS public.rota_assignment_push_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  scheduled_rota_id uuid NOT NULL REFERENCES public.scheduled_rota(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'skipped')),
  idempotency_key text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rota_assignment_push_sends_idempotency_key_uidx
  ON public.rota_assignment_push_sends (idempotency_key);

CREATE INDEX IF NOT EXISTS rota_assignment_push_sends_user_created_idx
  ON public.rota_assignment_push_sends (user_id, created_at DESC);

COMMENT ON TABLE public.rota_assignment_push_sends IS
  'Idempotent ledger for rota-assignment FCM digests (added-to-shift only).';

ALTER TABLE public.rota_assignment_push_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rota_assignment_push_sends_select_admin
  ON public.rota_assignment_push_sends;
CREATE POLICY rota_assignment_push_sends_select_admin
  ON public.rota_assignment_push_sends
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.rota_assignment_push_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.rota_assignment_push_sends TO authenticated;
GRANT ALL ON TABLE public.rota_assignment_push_sends TO service_role;

COMMENT ON COLUMN public.profiles.push_opt_in IS
  'When false, break/precheck/rota-assignment FCM pushes are not sent to this user.';

CREATE OR REPLACE FUNCTION public.get_due_rota_assignment_push_targets(
  at_time timestamptz DEFAULT now()
)
RETURNS TABLE(
  scheduled_rota_id uuid,
  user_id uuid,
  idempotency_key text,
  fcm_token text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT (at_time AT TIME ZONE 'Europe/London')::date AS london_today
  ),
  due AS (
    SELECT DISTINCT ON (sr.id)
      sr.id AS scheduled_rota_id,
      sr.user_id,
      format('rota_assignment_push:%s', sr.id) AS idempotency_key,
      dt.token AS fcm_token
    FROM public.scheduled_rota sr
    CROSS JOIN params p
    INNER JOIN public.profiles pr
      ON pr.id = sr.user_id
     AND pr.deleted_at IS NULL
     AND COALESCE(pr.is_active, true)
     AND COALESCE(pr.push_opt_in, true) = true
    INNER JOIN public.device_tokens dt
      ON dt.user_id = sr.user_id
    WHERE sr.user_id IS NOT NULL
      AND sr.date >= p.london_today
      AND NOT EXISTS (
        SELECT 1
        FROM public.rota_assignment_push_sends s
        WHERE s.idempotency_key = format('rota_assignment_push:%s', sr.id)
          AND s.status = 'sent'
      )
    ORDER BY sr.id, dt.updated_at DESC NULLS LAST, dt.created_at DESC
  )
  SELECT
    due.scheduled_rota_id,
    due.user_id,
    due.idempotency_key,
    due.fcm_token
  FROM due
  ORDER BY due.user_id, due.scheduled_rota_id;
$$;

REVOKE ALL ON FUNCTION public.get_due_rota_assignment_push_targets(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_due_rota_assignment_push_targets(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_due_rota_assignment_push_targets(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_rota_assignment_push_targets(timestamptz) TO service_role;

-- Cron template: hourly Fri-style London guard for 10:00 and 16:00.
-- Starts inactive.
DO $$
DECLARE
  existing_id bigint;
BEGIN
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'rota-assignment-push-digest'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '0 9,10,15,16 * * *',
      command := $cmd$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) IN (10, 16)
     AND EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Europe/London')) = 0
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-rota-assignment-push',
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
    )
    ELSE NULL
  END;
  $cmd$,
      active := false
    );
  ELSE
    PERFORM cron.schedule(
      'rota-assignment-push-digest',
      '0 9,10,15,16 * * *',
      $cmd$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) IN (10, 16)
     AND EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Europe/London')) = 0
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-rota-assignment-push',
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
    )
    ELSE NULL
  END;
  $cmd$
    );
    PERFORM cron.alter_job(
      (SELECT jobid FROM cron.job WHERE jobname = 'rota-assignment-push-digest' LIMIT 1),
      active := false
    );
  END IF;
END $$;
