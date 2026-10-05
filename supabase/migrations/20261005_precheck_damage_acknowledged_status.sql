-- ============================================================
-- repair_status 'acknowledged' – VMU knows about the defect and
-- it will not be repaired (e.g. cosmetic scratch). Shunters see it
-- as information only during the check; no confirmation needed.
-- ============================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.precheck_damages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%repair_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.precheck_damages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.precheck_damages
  ADD CONSTRAINT precheck_damages_repair_status_check
  CHECK (repair_status IN ('open', 'reported', 'awaiting_parts', 'in_progress', 'acknowledged', 'resolved'));

-- ============================================================
-- Shunter "Fixed?" must not resolve an acknowledged defect.
-- VMU/admin still resolve immediately.
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

  -- Only record if damage exists, is not resolved and not acknowledged by VMU
  SELECT repair_status INTO v_status
  FROM precheck_damages
  WHERE id = damage_id;

  IF v_status IS NULL OR v_status IN ('resolved', 'acknowledged') THEN
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
