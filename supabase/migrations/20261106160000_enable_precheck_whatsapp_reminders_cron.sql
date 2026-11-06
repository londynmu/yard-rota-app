-- Enable WhatsApp PreCheck reminder cron (owner approved after successful force-send).
-- Every 10 minutes; eligibility gated by get_missing_precheck_reminder_targets
-- (1 hour after Europe/London shift_start).
-- Use cron.schedule / cron.alter_job only (direct UPDATE on cron.job is denied).

DO $$
DECLARE
  existing_id bigint;
BEGIN
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'precheck-whatsapp-reminders'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '*/10 * * * *',
      command := $cmd$
  SELECT net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-precheck-whatsapp-reminders',
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
      active := true
    );
  ELSE
    PERFORM cron.schedule(
      'precheck-whatsapp-reminders',
      '*/10 * * * *',
      $cmd$
  SELECT net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/send-precheck-whatsapp-reminders',
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
  END IF;
END $$;
