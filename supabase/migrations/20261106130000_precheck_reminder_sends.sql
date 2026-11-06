-- WhatsApp PreCheck reminders — Phase B (ledger + targeting RPC).
-- Depends on 20261106120000_profiles_whatsapp_phone_opt_in.sql (phone_e164 / opt-in).
-- Do NOT apply to production until the owner explicitly approves.
-- Cron job SQL is included at the bottom as COMMENTED template until Edge
-- Function secrets (Twilio + Content SID) exist in the project.

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.precheck_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  rota_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued', 'sent', 'delivered', 'failed', 'undelivered',
      'read', 'canceled', 'accepted'
    )),
  provider text NOT NULL DEFAULT 'twilio'
    CHECK (provider IN ('twilio')),
  provider_message_sid text,
  error_code text,
  error_message text,
  idempotency_key text NOT NULL,
  trigger text NOT NULL DEFAULT 'cron'
    CHECK (trigger IN ('cron', 'admin_force')),
  sent_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS precheck_reminder_sends_idempotency_key_uidx
  ON public.precheck_reminder_sends (idempotency_key);

CREATE INDEX IF NOT EXISTS precheck_reminder_sends_user_created_idx
  ON public.precheck_reminder_sends (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS precheck_reminder_sends_rota_idx
  ON public.precheck_reminder_sends (rota_id);

CREATE INDEX IF NOT EXISTS precheck_reminder_sends_provider_sid_idx
  ON public.precheck_reminder_sends (provider_message_sid)
  WHERE provider_message_sid IS NOT NULL;

COMMENT ON TABLE public.precheck_reminder_sends IS
  'Audit ledger for PreCheck WhatsApp (and future SMS) reminder sends.';

ALTER TABLE public.precheck_reminder_sends ENABLE ROW LEVEL SECURITY;

-- Admin read-only via RLS; Edge Function uses service_role (bypasses RLS).
DROP POLICY IF EXISTS precheck_reminder_sends_select_admin ON public.precheck_reminder_sends;
CREATE POLICY precheck_reminder_sends_select_admin
  ON public.precheck_reminder_sends
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.precheck_reminder_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.precheck_reminder_sends TO authenticated;
GRANT ALL ON TABLE public.precheck_reminder_sends TO service_role;

-- ---------------------------------------------------------------------------
-- Targeting RPC for cron / Edge Function (service_role only)
-- Same Europe/London open-shift logic as get_missing_precheck_reminders,
-- plus phone/opt-in, ledger flag, and 30-minute delay after shift_start.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_missing_precheck_reminder_targets(
  at_time timestamptz DEFAULT now()
)
RETURNS TABLE(
  user_id uuid,
  rota_id uuid,
  first_name text,
  last_name text,
  start_time text,
  end_time text,
  shift_start timestamptz,
  shift_end timestamptz,
  phone_e164 text,
  whatsapp_opt_in boolean,
  already_sent boolean
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
      o.shift_start,
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
    b.rota_id,
    COALESCE(pr.first_name, '') AS first_name,
    COALESCE(pr.last_name, '') AS last_name,
    to_char(b.start_time, 'HH24:MI') AS start_time,
    to_char(b.end_time, 'HH24:MI') AS end_time,
    b.shift_start,
    b.shift_end,
    pr.phone_e164,
    COALESCE(pr.whatsapp_opt_in, false) AS whatsapp_opt_in,
    EXISTS (
      SELECT 1
      FROM public.precheck_reminder_sends s
      WHERE s.idempotency_key = format('precheck-wa:%s:%s', b.user_id, b.rota_id)
    ) AS already_sent
  FROM bounds b
  JOIN profiles pr ON pr.id = b.user_id
  CROSS JOIN clock c
  WHERE pr.deleted_at IS NULL
    AND COALESCE(pr.is_active, true)
    AND c.instant >= (b.shift_start + interval '30 minutes')
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

REVOKE ALL ON FUNCTION public.get_missing_precheck_reminder_targets(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_missing_precheck_reminder_targets(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_missing_precheck_reminder_targets(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_missing_precheck_reminder_targets(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- Extend admin poll RPC with rota_id + messaging fields (for force send UI)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_missing_precheck_reminders(timestamptz);

CREATE OR REPLACE FUNCTION public.get_missing_precheck_reminders(
  at_time timestamptz DEFAULT now()
)
RETURNS TABLE(
  user_id uuid,
  rota_id uuid,
  first_name text,
  last_name text,
  start_time text,
  end_time text,
  phone_e164 text,
  whatsapp_opt_in boolean
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
    b.rota_id,
    COALESCE(pr.first_name, '') AS first_name,
    COALESCE(pr.last_name, '') AS last_name,
    to_char(b.start_time, 'HH24:MI') AS start_time,
    to_char(b.end_time, 'HH24:MI') AS end_time,
    pr.phone_e164,
    COALESCE(pr.whatsapp_opt_in, false) AS whatsapp_opt_in
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

-- ---------------------------------------------------------------------------
-- Cron template (DISABLED until Twilio secrets + Content SID are set).
-- Uncomment and run after Edge Function deploy + Vault secrets exist.
-- Pattern mirrors gmail-import-daily (service_role from Vault).
-- ---------------------------------------------------------------------------
/*
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
      active := false
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
    -- Leave inactive until soft-launch:
    -- UPDATE cron.job SET active = false WHERE jobname = 'precheck-whatsapp-reminders';
  END IF;
END $$;
*/
