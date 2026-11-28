-- VMU defect email alerts: ledger, recipient RPC, settings seeds, RLS for mailing list,
-- AFTER INSERT trigger → notify-vmu-defect Edge Function via pg_net.
-- Do NOT apply to production until the owner explicitly approves.
-- Requires Vault secret SUPABASE_SERVICE_ROLE_KEY (same as other cron/net.http_post jobs).
-- Edge secrets (set by owner, not in this file):
--   VMU_DEFECT_EMAIL_FROM=vmu@shunters.net
--   VMU_DEFECT_EMAIL_FROM_NAME=VMU Alerts (optional)
--   SENDGRID_API_KEY (existing), APP_BASE_URL (existing)

-- ---------------------------------------------------------------------------
-- Ledger (idempotent claim before SendGrid)
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS vmu_defect_alert_sends_created_idx
  ON public.vmu_defect_alert_sends (created_at DESC);

COMMENT ON TABLE public.vmu_defect_alert_sends IS
  'Idempotent ledger for VMU defect alert emails (one row per precheck_damages id).';

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
  'When true, new precheck_damages rows trigger VMU defect alert emails.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.settings (key, value, description)
VALUES (
  'vmu_defect_alert_emails',
  '',
  'Optional extra alert recipients (comma/semicolon/newline-separated). Role=vmu accounts are always included.'
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
  'Emails of approved active profiles with role=vmu for defect alert Edge Function.';

-- ---------------------------------------------------------------------------
-- AFTER INSERT trigger → Edge Function (pg_net)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_vmu_defect_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
BEGIN
  SELECT decrypted_secret
  INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF service_key IS NULL OR length(trim(service_key)) = 0 THEN
    RAISE WARNING 'notify_vmu_defect_on_insert: SUPABASE_SERVICE_ROLE_KEY missing in Vault';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://jkjvtvwedjiupxoibpld.supabase.co/functions/v1/notify-vmu-defect',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('damage_id', NEW.id),
    timeout_milliseconds := 60000
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notify_vmu_defect_on_insert failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_precheck_damages_notify_vmu ON public.precheck_damages;
CREATE TRIGGER trg_precheck_damages_notify_vmu
  AFTER INSERT ON public.precheck_damages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_vmu_defect_on_insert();

REVOKE ALL ON FUNCTION public.notify_vmu_defect_on_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_vmu_defect_on_insert() TO service_role;

COMMENT ON FUNCTION public.notify_vmu_defect_on_insert() IS
  'AFTER INSERT on precheck_damages: async http_post to notify-vmu-defect Edge Function.';
