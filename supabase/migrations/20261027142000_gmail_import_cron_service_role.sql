-- Fix high #5 follow-up: after gmail-import v38 requireAdminOrCron, pg_cron still
-- called the function with the public anon JWT → POST 401 at 06:30.
-- Use Vault SUPABASE_SERVICE_ROLE_KEY at runtime (do not hardcode secrets).
-- Keep a single daily job; drop the duplicate anon job if present.
-- Requires extensions: pg_cron, pg_net, supabase_vault (already on prod).

DO $$
DECLARE
  j record;
BEGIN
  -- Remove duplicate / anon-JWT gmail import jobs
  FOR j IN
    SELECT jobid
    FROM cron.job
    WHERE command ILIKE '%/functions/v1/gmail-import%'
      AND (
        command ILIKE '%"role":"anon"%'
        OR command ILIKE '%role%anon%'
        OR jobname = 'daily-gmail-import'
      )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Ensure one active job uses Vault service_role + 60s timeout
DO $$
DECLARE
  existing_id bigint;
BEGIN
  SELECT jobid INTO existing_id
  FROM cron.job
  WHERE jobname = 'gmail-import-daily'
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      existing_id,
      schedule := '30 6 * * *',
      command := $cmd$
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
  $cmd$,
      active := true
    );
  ELSE
    PERFORM cron.schedule(
      'gmail-import-daily',
      '30 6 * * *',
      $cmd$
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
  $cmd$
    );
  END IF;
END $$;
