-- Index scheduled_rota by date for team break / rota day queries.
-- Additive only; do not apply to production without owner approval.
CREATE INDEX IF NOT EXISTS idx_scheduled_rota_date
  ON public.scheduled_rota (date);
