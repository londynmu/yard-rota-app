-- ============================================================
-- Attendance – exceptions only (no show, sick, late per slot)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_rota_id uuid NOT NULL
    REFERENCES public.scheduled_rota(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('no_show', 'sick', 'late')),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scheduled_rota_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_scheduled_rota_id ON public.attendance(scheduled_rota_id);
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_at ON public.attendance(recorded_at);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_select_authenticated ON public.attendance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY attendance_insert_admin ON public.attendance
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY attendance_update_admin ON public.attendance
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY attendance_delete_admin ON public.attendance
  FOR DELETE TO authenticated USING (is_admin());
