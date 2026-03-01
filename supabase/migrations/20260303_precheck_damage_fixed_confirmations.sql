-- ============================================================
-- precheck_damage_fixed_confirmations – count "Fixed?" on submit
-- Defect becomes resolved only after X confirmations (setting).
-- VMU/admin resolve immediately via existing RPC.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.precheck_damage_fixed_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  damage_id uuid NOT NULL REFERENCES public.precheck_damages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.precheck_submissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precheck_damage_fixed_confirmations_damage_id
  ON public.precheck_damage_fixed_confirmations(damage_id);

ALTER TABLE public.precheck_damage_fixed_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY precheck_damage_fixed_confirmations_select ON public.precheck_damage_fixed_confirmations
  FOR SELECT TO authenticated
  USING (true);

-- INSERT is done only from record_precheck_damage_fixed_confirmation (SECURITY DEFINER)

-- ============================================================
-- Setting: how many shunter "Fixed?" confirmations before resolve
-- ============================================================

INSERT INTO public.settings (key, value, description)
VALUES (
  'defect_resolve_confirmations_required',
  '1',
  'Number of shunter "Fixed?" confirmations (on submit) required before a defect is marked resolved. VMU/admin resolve immediately.'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- RPC: record one fixed confirmation; resolve if VMU/admin or count >= setting
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_precheck_damage_fixed_confirmation(
  damage_id uuid,
  submission_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required int;
  v_count bigint;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- VMU or admin: resolve immediately (no confirmation row)
  IF is_vmu() OR is_admin() THEN
    PERFORM mark_precheck_damage_resolved(damage_id);
    RETURN;
  END IF;

  -- Only record if damage exists and is not already resolved
  SELECT repair_status INTO v_status
  FROM precheck_damages
  WHERE id = damage_id;

  IF v_status IS NULL OR v_status = 'resolved' THEN
    RETURN;
  END IF;

  INSERT INTO precheck_damage_fixed_confirmations (damage_id, user_id, submission_id)
  VALUES (damage_id, auth.uid(), submission_id);

  -- Read setting (default 1)
  SELECT COALESCE(
    (SELECT (value::int) FROM settings WHERE key = 'defect_resolve_confirmations_required' LIMIT 1),
    1
  ) INTO v_required;

  IF v_required < 1 THEN
    v_required := 1;
  END IF;

  SELECT count(*) INTO v_count
  FROM precheck_damage_fixed_confirmations
  WHERE precheck_damage_fixed_confirmations.damage_id = record_precheck_damage_fixed_confirmation.damage_id;

  IF v_count >= v_required THEN
    PERFORM mark_precheck_damage_resolved(damage_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_precheck_damage_fixed_confirmation(uuid, uuid) TO authenticated;
