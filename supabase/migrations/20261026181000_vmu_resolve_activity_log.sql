-- Wave F / audit #14 + #17:
-- Ensure private.resolve_precheck_damage writes defect_activity_log with caller id,
-- and add (damage_id, created_at) index for per-card activity fetches.
-- Do not apply to production without owner approval.

CREATE OR REPLACE FUNCTION private.resolve_precheck_damage(
  damage_id uuid,
  actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status text;
BEGIN
  SELECT repair_status INTO old_status
  FROM precheck_damages
  WHERE id = damage_id;

  IF old_status IS NULL OR old_status = 'resolved' THEN
    RETURN;
  END IF;

  UPDATE precheck_damages
  SET repair_status = 'resolved',
      resolved_at = now(),
      resolved_by = actor
  WHERE id = damage_id
    AND repair_status <> 'resolved';

  IF FOUND THEN
    INSERT INTO defect_activity_log (
      damage_id,
      user_id,
      action_type,
      field_name,
      old_value,
      new_value
    ) VALUES (
      damage_id,
      actor,
      'status_change',
      'repair_status',
      old_status,
      'resolved'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_precheck_damage(uuid, uuid) FROM public, anon, authenticated;

-- Per-card activity log lookups (damage_id + newest first)
CREATE INDEX IF NOT EXISTS idx_defect_activity_log_damage_created
  ON public.defect_activity_log (damage_id, created_at DESC);
