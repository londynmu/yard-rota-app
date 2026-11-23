-- Friday 18:00 Europe/London rota WhatsApp week summary (Sat→Fri).
-- Extends ledger trigger for cron; schedules pg_cron INACTIVE until smoke + owner approval.
-- Do NOT apply to production until the owner explicitly approves.

-- Allow cron rows in the audit ledger
ALTER TABLE public.rota_whatsapp_sends
  DROP CONSTRAINT IF EXISTS rota_whatsapp_sends_trigger_check;

ALTER TABLE public.rota_whatsapp_sends
  ADD CONSTRAINT rota_whatsapp_sends_trigger_check
  CHECK (trigger IN ('ui', 'admin_resend', 'cron'));

COMMENT ON TABLE public.rota_whatsapp_sends IS
  'Audit ledger for rota WhatsApp sends to shunters (week summary + assignment ping; ui/admin_resend/cron).';

-- Cron: fire Fri 17:00 and 18:00 UTC; only POST when London is Friday 18:00
-- (covers GMT and BST without seasonal schedule edits).
-- Job starts inactive — enable after Edge smoke + owner approval.
DO $$
DECLARE
  existing_id bigint;
BEGIN
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'rota-whatsapp-friday-week'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '0 17,18 * * 5',
      command := $cmd$
  SELECT CASE
    WHEN EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/London')) = 5
     AND EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) = 18
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-rota-whatsapp',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'action', 'send',
        'kind', 'shunter_week'
      ),
      timeout_milliseconds := 120000
    )
    ELSE NULL
  END;
  $cmd$,
      active := false
    );
  ELSE
    PERFORM cron.schedule(
      'rota-whatsapp-friday-week',
      '0 17,18 * * 5',
      $cmd$
  SELECT CASE
    WHEN EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/London')) = 5
     AND EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) = 18
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-rota-whatsapp',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'action', 'send',
        'kind', 'shunter_week'
      ),
      timeout_milliseconds := 120000
    )
    ELSE NULL
  END;
  $cmd$
    );
    PERFORM cron.alter_job(
      (SELECT jobid FROM cron.job WHERE jobname = 'rota-whatsapp-friday-week' LIMIT 1),
      active := false
    );
  END IF;
END $$;
