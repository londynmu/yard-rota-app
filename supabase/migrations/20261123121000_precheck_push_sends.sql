-- Phase 2: FCM pre-check reminder ledger + targeting (WhatsApp unchanged).
-- Do NOT apply to production until the owner explicitly approves.
-- Depends on 20261123120000_device_tokens_break_push.sql (device_tokens, push_opt_in).

CREATE TABLE IF NOT EXISTS public.precheck_push_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  rota_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'skipped')),
  idempotency_key text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS precheck_push_sends_idempotency_key_uidx
  ON public.precheck_push_sends (idempotency_key);

CREATE INDEX IF NOT EXISTS precheck_push_sends_user_created_idx
  ON public.precheck_push_sends (user_id, created_at DESC);

COMMENT ON TABLE public.precheck_push_sends IS
  'Idempotent ledger for missing pre-check FCM pushes (separate from WhatsApp).';

ALTER TABLE public.precheck_push_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS precheck_push_sends_select_admin ON public.precheck_push_sends;
CREATE POLICY precheck_push_sends_select_admin
  ON public.precheck_push_sends
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.precheck_push_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.precheck_push_sends TO authenticated;
GRANT ALL ON TABLE public.precheck_push_sends TO service_role;

-- Reuse WhatsApp targeting window; filter to push_opt_in + device token.
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
    format(
      'precheck_push:%s:%s',
      t.rota_id,
      to_char(at_time AT TIME ZONE 'Europe/London', 'YYYYMMDD')
    ) AS idempotency_key,
    dt.token AS fcm_token
  FROM public.get_missing_precheck_reminder_targets(at_time) t
  INNER JOIN public.profiles pr
    ON pr.id = t.user_id
   AND COALESCE(pr.push_opt_in, true) = true
  INNER JOIN public.device_tokens dt
    ON dt.user_id = t.user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.precheck_push_sends s
    WHERE s.idempotency_key = format(
      'precheck_push:%s:%s',
      t.rota_id,
      to_char(at_time AT TIME ZONE 'Europe/London', 'YYYYMMDD')
    )
    AND s.status = 'sent'
  );
$$;

REVOKE ALL ON FUNCTION public.get_due_precheck_push_targets(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_due_precheck_push_targets(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_due_precheck_push_targets(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_precheck_push_targets(timestamptz) TO service_role;

/*
DO $$
DECLARE
  existing_id bigint;
BEGIN
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'precheck-push-reminders'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '*/10 * * * *',
      command := $cmd$
  SELECT net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-precheck-push-reminders',
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
      'precheck-push-reminders',
      '*/10 * * * *',
      $cmd$
  SELECT net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-precheck-push-reminders',
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
    UPDATE cron.job SET active = false WHERE jobname = 'precheck-push-reminders';
  END IF;
END $$;
*/
