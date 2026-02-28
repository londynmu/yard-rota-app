-- ============================================================
-- Shunter violations (disciplinary notes) – admin adds, user sees own
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shunter_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shunter_violations_user_id ON public.shunter_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_shunter_violations_created_at ON public.shunter_violations(created_at);

ALTER TABLE public.shunter_violations ENABLE ROW LEVEL SECURITY;

-- SELECT: admin sees all; non-admin sees only own (user_id = auth.uid())
CREATE POLICY shunter_violations_select ON public.shunter_violations
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (user_id = (SELECT auth.uid()))
  );

-- INSERT/UPDATE/DELETE: admin only
CREATE POLICY shunter_violations_insert_admin ON public.shunter_violations
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY shunter_violations_update_admin ON public.shunter_violations
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY shunter_violations_delete_admin ON public.shunter_violations
  FOR DELETE TO authenticated USING (is_admin());
