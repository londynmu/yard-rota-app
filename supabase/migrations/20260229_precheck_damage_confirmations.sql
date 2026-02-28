-- ============================================================
-- precheck_damage_confirmations – shunters confirm "still exists"
-- instead of creating duplicate defect reports
-- ============================================================

CREATE TABLE IF NOT EXISTS public.precheck_damage_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  damage_id uuid NOT NULL REFERENCES public.precheck_damages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.precheck_submissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precheck_damage_confirmations_damage_id
  ON public.precheck_damage_confirmations(damage_id);

ALTER TABLE public.precheck_damage_confirmations ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated can read
CREATE POLICY precheck_damage_confirmations_select ON public.precheck_damage_confirmations
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: user can add their own confirmation
CREATE POLICY precheck_damage_confirmations_insert ON public.precheck_damage_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
