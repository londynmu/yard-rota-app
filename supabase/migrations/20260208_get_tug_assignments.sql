-- Returns the latest tug assignment per user for a given date.
-- Used on break cards to show which tug each person is driving.
-- SECURITY DEFINER so all authenticated users can see tug assignments
-- without exposing full precheck submission details.

CREATE OR REPLACE FUNCTION public.get_tug_assignments_for_date(target_date date)
RETURNS TABLE(user_id uuid, tug_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (ps.user_id)
    ps.user_id,
    COALESCE(t.display_name, t.tug_number) AS tug_name
  FROM precheck_submissions ps
  JOIN tugs t ON t.id = ps.tug_id
  WHERE ps.check_date = target_date
  ORDER BY ps.user_id, ps.check_time DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_tug_assignments_for_date(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tug_assignments_for_date(date) TO service_role;
