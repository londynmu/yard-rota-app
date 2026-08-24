-- Snapshot of assigned rota slots at first weekly download/send.
-- Used to detect additional bookings (dobooks) after agencies already have the week.

CREATE TABLE IF NOT EXISTS public.rota_week_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  source text NOT NULL CHECK (source IN ('download', 'send', 'manual', 'late_send')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_week_baselines_week_start_key UNIQUE (week_start)
);

CREATE TABLE IF NOT EXISTS public.rota_week_baseline_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL
    REFERENCES public.rota_week_baselines(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text NOT NULL,
  shift_type text NOT NULL,
  CONSTRAINT rota_week_baseline_slots_unique_assignment
    UNIQUE (baseline_id, user_id, date, start_time, end_time, location)
);

CREATE INDEX IF NOT EXISTS idx_rota_week_baseline_slots_baseline_id
  ON public.rota_week_baseline_slots (baseline_id);

CREATE INDEX IF NOT EXISTS idx_rota_week_baseline_slots_user_date
  ON public.rota_week_baseline_slots (user_id, date);

COMMENT ON TABLE public.rota_week_baselines IS
  'One baseline per Saturday-start week: first download, send, or manual mark.';
COMMENT ON TABLE public.rota_week_baseline_slots IS
  'Assigned shifts captured in the week baseline; extra current slots are additional bookings.';

ALTER TABLE public.rota_week_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rota_week_baseline_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY rota_week_baselines_select ON public.rota_week_baselines
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY rota_week_baselines_insert ON public.rota_week_baselines
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY rota_week_baselines_update ON public.rota_week_baselines
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY rota_week_baselines_delete ON public.rota_week_baselines
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY rota_week_baseline_slots_select ON public.rota_week_baseline_slots
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY rota_week_baseline_slots_insert ON public.rota_week_baseline_slots
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY rota_week_baseline_slots_update ON public.rota_week_baseline_slots
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY rota_week_baseline_slots_delete ON public.rota_week_baseline_slots
  FOR DELETE TO authenticated USING (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rota_week_baselines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rota_week_baseline_slots TO authenticated;

CREATE OR REPLACE FUNCTION public.update_rota_week_baselines_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rota_week_baselines_updated_at ON public.rota_week_baselines;
CREATE TRIGGER trg_rota_week_baselines_updated_at
  BEFORE UPDATE ON public.rota_week_baselines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rota_week_baselines_updated_at();
