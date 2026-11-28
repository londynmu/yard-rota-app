-- VMU defect email digests (twice daily) + recipient RPC + settings.
-- No per-INSERT email trigger — digests are the only outbound channel (max 2/day).
-- Do NOT apply to production until the owner explicitly approves.
-- Requires Vault secret SUPABASE_SERVICE_ROLE_KEY (same as other cron/net.http_post jobs).
-- Edge secrets (set by owner, not in this file):
--   VMU_DEFECT_EMAIL_FROM=vmu@shunters.net
--   VMU_DEFECT_EMAIL_FROM_NAME=VMU Alerts (optional)
--   VMU_SENDGRID_API_KEY (do not overwrite rota SENDGRID_API_KEY)
--   APP_BASE_URL (existing)

-- ---------------------------------------------------------------------------
-- Digest ledger (idempotent claim per London slot+date)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vmu_defect_digest_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  slot text NOT NULL CHECK (slot IN ('morning', 'evening')),
  london_date date NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  defect_count integer NOT NULL DEFAULT 0,
  recipients text[],
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vmu_defect_digest_sends_idempotency_uidx
  ON public.vmu_defect_digest_sends (idempotency_key);

CREATE INDEX IF NOT EXISTS vmu_defect_digest_sends_created_idx
  ON public.vmu_defect_digest_sends (created_at DESC);

COMMENT ON TABLE public.vmu_defect_digest_sends IS
  'Idempotent ledger for twice-daily VMU defect digest emails (morning 10:00 / evening 21:00 Europe/London).';

ALTER TABLE public.vmu_defect_digest_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vmu_defect_digest_sends_select_admin ON public.vmu_defect_digest_sends;
CREATE POLICY vmu_defect_digest_sends_select_admin
  ON public.vmu_defect_digest_sends
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.vmu_defect_digest_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.vmu_defect_digest_sends TO authenticated;
GRANT ALL ON TABLE public.vmu_defect_digest_sends TO service_role;

-- Legacy per-damage ledger (unused by digests; keep if already created in earlier draft)
CREATE TABLE IF NOT EXISTS public.vmu_defect_alert_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  damage_id uuid NOT NULL REFERENCES public.precheck_damages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  recipients text[],
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vmu_defect_alert_sends_damage_id_uidx
  ON public.vmu_defect_alert_sends (damage_id);

ALTER TABLE public.vmu_defect_alert_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vmu_defect_alert_sends_select_admin ON public.vmu_defect_alert_sends;
CREATE POLICY vmu_defect_alert_sends_select_admin
  ON public.vmu_defect_alert_sends
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.vmu_defect_alert_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.vmu_defect_alert_sends TO authenticated;
GRANT ALL ON TABLE public.vmu_defect_alert_sends TO service_role;

-- ---------------------------------------------------------------------------
-- Settings seeds
-- ---------------------------------------------------------------------------
INSERT INTO public.settings (key, value, description)
VALUES (
  'vmu_defect_alerts_enabled',
  'true',
  'When true, twice-daily VMU defect digest emails are sent (10:00 and 21:00 Europe/London).'
)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO public.settings (key, value, description)
VALUES (
  'vmu_defect_alert_emails',
  '',
  'Optional extra digest recipients (comma/semicolon/newline-separated). Role=vmu accounts are always included.'
)
ON CONFLICT (key) DO NOTHING;

-- Prevent non-admins from reading the mailing list (settings_select is otherwise open to approved users).
DROP POLICY IF EXISTS settings_select ON public.settings;
CREATE POLICY settings_select ON public.settings
  FOR SELECT TO authenticated
  USING (
    public.is_approved_active_user()
    AND (
      public.is_admin()
      OR key <> 'vmu_defect_alert_emails'
    )
  );

-- ---------------------------------------------------------------------------
-- Recipient emails for role = vmu (service_role / Edge only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vmu_defect_alert_emails()
RETURNS TABLE(email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT lower(u.email)::text AS email
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'vmu'
    AND p.deleted_at IS NULL
    AND COALESCE(p.is_active, true)
    AND p.account_status = 'approved'
    AND u.email IS NOT NULL
    AND length(trim(u.email)) > 0;
$$;

REVOKE ALL ON FUNCTION public.get_vmu_defect_alert_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vmu_defect_alert_emails() TO service_role;

COMMENT ON FUNCTION public.get_vmu_defect_alert_emails() IS
  'Emails of approved active profiles with role=vmu for defect digest Edge Function.';

-- ---------------------------------------------------------------------------
-- Ensure NO per-INSERT email trigger (digests only)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_precheck_damages_notify_vmu ON public.precheck_damages;
DROP FUNCTION IF EXISTS public.notify_vmu_defect_on_insert();

-- ---------------------------------------------------------------------------
-- pg_cron: morning 10:00 + evening 21:00 Europe/London → notify-vmu-defect
-- Fire UTC hours covering GMT/BST; gate on London hour. Starts INACTIVE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  morning_id bigint;
  evening_id bigint;
BEGIN
  SELECT jobid INTO morning_id
  FROM cron.job
  WHERE jobname = 'vmu-defect-digest-morning'
  LIMIT 1;

  IF morning_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      morning_id,
      schedule := '0 9,10 * * *',
      command := $cmd$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) = 10
     AND EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Europe/London')) = 0
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/notify-vmu-defect',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('slot', 'morning'),
      timeout_milliseconds := 120000
    )
    ELSE NULL
  END;
  $cmd$,
      active := false
    );
  ELSE
    PERFORM cron.schedule(
      'vmu-defect-digest-morning',
      '0 9,10 * * *',
      $cmd$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) = 10
     AND EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Europe/London')) = 0
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/notify-vmu-defect',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('slot', 'morning'),
      timeout_milliseconds := 120000
    )
    ELSE NULL
  END;
  $cmd$
    );
    PERFORM cron.alter_job(
      (SELECT jobid FROM cron.job WHERE jobname = 'vmu-defect-digest-morning' LIMIT 1),
      active := false
    );
  END IF;

  SELECT jobid INTO evening_id
  FROM cron.job
  WHERE jobname = 'vmu-defect-digest-evening'
  LIMIT 1;

  IF evening_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      evening_id,
      schedule := '0 20,21 * * *',
      command := $cmd$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) = 21
     AND EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Europe/London')) = 0
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/notify-vmu-defect',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('slot', 'evening'),
      timeout_milliseconds := 120000
    )
    ELSE NULL
  END;
  $cmd$,
      active := false
    );
  ELSE
    PERFORM cron.schedule(
      'vmu-defect-digest-evening',
      '0 20,21 * * *',
      $cmd$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/London')) = 21
     AND EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Europe/London')) = 0
    THEN net.http_post(
      url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/notify-vmu-defect',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('slot', 'evening'),
      timeout_milliseconds := 120000
    )
    ELSE NULL
  END;
  $cmd$
    );
    PERFORM cron.alter_job(
      (SELECT jobid FROM cron.job WHERE jobname = 'vmu-defect-digest-evening' LIMIT 1),
      active := false
    );
  END IF;
END $$;
