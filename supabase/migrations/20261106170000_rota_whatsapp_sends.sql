-- WhatsApp rota notifies to shunters (manual admin send).
-- Separate ledger from precheck_reminder_sends.
-- Do NOT apply to production until the owner explicitly approves.

CREATE TABLE IF NOT EXISTS public.rota_whatsapp_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  message_kind text NOT NULL
    CHECK (message_kind IN ('shunter_week', 'assignment_ping')),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  scheduled_rota_id uuid REFERENCES public.scheduled_rota(id) ON DELETE SET NULL,
  recipient_e164 text NOT NULL,
  creator_user_id uuid REFERENCES public.profiles(id),
  creator_name text NOT NULL DEFAULT '',
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
  trigger text NOT NULL DEFAULT 'ui'
    CHECK (trigger IN ('ui', 'admin_resend')),
  attempt_count integer NOT NULL DEFAULT 1
    CHECK (attempt_count >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rota_whatsapp_sends_idempotency_key_uidx
  ON public.rota_whatsapp_sends (idempotency_key);

CREATE INDEX IF NOT EXISTS rota_whatsapp_sends_week_user_idx
  ON public.rota_whatsapp_sends (week_start, user_id, message_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS rota_whatsapp_sends_provider_sid_idx
  ON public.rota_whatsapp_sends (provider_message_sid)
  WHERE provider_message_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS rota_whatsapp_sends_scheduled_rota_idx
  ON public.rota_whatsapp_sends (scheduled_rota_id)
  WHERE scheduled_rota_id IS NOT NULL;

COMMENT ON TABLE public.rota_whatsapp_sends IS
  'Audit ledger for manual rota WhatsApp sends to shunters (week summary + assignment ping).';

ALTER TABLE public.rota_whatsapp_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rota_whatsapp_sends_select_admin ON public.rota_whatsapp_sends;
CREATE POLICY rota_whatsapp_sends_select_admin
  ON public.rota_whatsapp_sends
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE ALL ON TABLE public.rota_whatsapp_sends FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.rota_whatsapp_sends TO authenticated;
GRANT ALL ON TABLE public.rota_whatsapp_sends TO service_role;
