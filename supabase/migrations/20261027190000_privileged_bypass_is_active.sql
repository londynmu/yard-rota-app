-- Privileged roles (admin / vmu / transport_manager) must not be locked out of
-- operational SELECT by profiles.is_active = false. Account status remains
-- bypassed for those roles (same as 20261026182000 intent).
-- Regular users still need is_active + account_status = approved.
-- DO NOT apply to production without owner approval.

CREATE OR REPLACE FUNCTION public.is_approved_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.deleted_at IS NULL
      AND (
        p.role IN ('admin', 'vmu', 'transport_manager')
        OR (
          COALESCE(p.is_active, true)
          AND p.account_status = 'approved'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_approved_active_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_active_user() TO authenticated;

COMMENT ON FUNCTION public.is_approved_active_user() IS
  'True when the caller is a non-deleted privileged role, or an approved active user.';
