-- Allow any authenticated user to mark a precheck damage as resolved (e.g. "Fixed?" in PreCheck form).
-- Uses RPC with SECURITY DEFINER so the update is allowed without relaxing full UPDATE RLS.

CREATE OR REPLACE FUNCTION public.mark_precheck_damage_resolved(damage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE precheck_damages
  SET repair_status = 'resolved',
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = damage_id
    AND repair_status <> 'resolved';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_precheck_damage_resolved(uuid) TO authenticated;
