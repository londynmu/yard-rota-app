-- ============================================================
-- Transport Manager: application role + RLS for dashboard
-- ============================================================
-- The app uses profiles.role = 'transport_manager' (no PostgreSQL role).
-- Run this entire file in Supabase SQL Editor.
-- ============================================================

-- -------------------------------------------------------------
-- 1. Helper function: is_transport_manager()
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_transport_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'transport_manager'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_transport_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_transport_manager() TO anon;


-- -------------------------------------------------------------
-- 2. Ensure profiles.role can hold 'transport_manager'
-- -------------------------------------------------------------
-- If your profiles.role has a CHECK constraint limiting values,
-- add 'transport_manager' to it. Example if you had:
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
--   ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
--     CHECK (role IS NULL OR role IN ('admin', 'vmu', 'transport_manager'));
-- Most setups use a plain text column with no CHECK, so nothing to do here.


-- -------------------------------------------------------------
-- 3. RLS: shunter_violations – allow transport_manager to SELECT all
-- -------------------------------------------------------------
DROP POLICY IF EXISTS shunter_violations_select ON public.shunter_violations;

CREATE POLICY shunter_violations_select ON public.shunter_violations
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR is_transport_manager()
    OR (user_id = auth.uid())
  );

-- INSERT/UPDATE/DELETE stay admin-only (existing policies unchanged).


-- -------------------------------------------------------------
-- 4. Other tables used by Transport Manager dashboard
-- -------------------------------------------------------------
-- Already readable by authenticated (no change needed):
--   scheduled_rota, profiles, attendance, scheduled_breaks,
--   shunter_performance, locations, tugs
-- get_tug_assignments_for_date(date) already has GRANT EXECUTE TO authenticated.


-- -------------------------------------------------------------
-- 5. Assign Transport Manager role to a user
-- -------------------------------------------------------------
-- Run one of these (replace email with the real address):

-- By email:
-- UPDATE public.profiles
-- SET role = 'transport_manager'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'manager@example.com' LIMIT 1);

-- By user id (UUID from auth.users or profiles):
-- UPDATE public.profiles
-- SET role = 'transport_manager'
-- WHERE id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- To remove the role (revert to normal user):
-- UPDATE public.profiles SET role = NULL WHERE id = (SELECT id FROM auth.users WHERE email = 'manager@example.com' LIMIT 1);
