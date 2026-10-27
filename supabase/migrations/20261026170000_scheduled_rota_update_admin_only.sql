-- High #22: shunters must not UPDATE their own scheduled_rota row.
-- Admin planner keeps INSERT / UPDATE / DELETE. claim_shift (SECURITY DEFINER)
-- remains the only non-admin path that can assign a free slot to auth.uid().

DROP POLICY IF EXISTS scheduled_rota_update ON public.scheduled_rota;

CREATE POLICY scheduled_rota_update
  ON public.scheduled_rota
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
