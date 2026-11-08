-- Morning YMS mail sometimes arrives after 06:30 UTC (observed 2026-11-08 ~06:38).
-- Keep gmail-import-daily at 06:30 for early reports, and add a catch-up run at 07:45
-- so late mail is still imported the same morning. Idempotent: PROCESSED label + upsert.
-- Do NOT apply to production until the owner explicitly approves.

DO $$
DECLARE
  existing_id bigint;
  catchup_cmd text := $cmd$
  SELECT net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/gmail-import',
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
  $cmd$;
BEGIN
  -- Keep primary job on the early slot (unchanged schedule + auth).
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'gmail-import-daily'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '30 6 * * *',
      command := catchup_cmd,
      active := true
    );
  ELSE
    PERFORM cron.schedule(
      'gmail-import-daily',
      '30 6 * * *',
      catchup_cmd
    );
  END IF;

  -- Catch-up for late morning YMS delivery
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'gmail-import-catchup'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '45 7 * * *',
      command := catchup_cmd,
      active := true
    );
  ELSE
    PERFORM cron.schedule(
      'gmail-import-catchup',
      '45 7 * * *',
      catchup_cmd
    );
  END IF;
END $$;
