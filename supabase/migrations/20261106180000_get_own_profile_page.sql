-- Own-row Profile page load via SECURITY DEFINER.
-- Avoids table SELECT of revoked messaging columns (phone_e164 / whatsapp_opt_in*)
-- and gives a single RPC for the Profile form (same pattern as get_own_whatsapp_messaging).
-- Do NOT apply to production until the owner explicitly approves.

CREATE OR REPLACE FUNCTION public.get_own_profile_page()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  shift_preference text,
  avatar_url text,
  preferred_start_time time without time zone,
  custom_start_time time without time zone,
  preferred_location text,
  agency_id uuid,
  account_status text,
  profile_completed boolean,
  role character varying,
  phone_e164 text,
  whatsapp_opt_in boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.shift_preference,
    p.avatar_url,
    p.preferred_start_time,
    p.custom_start_time,
    p.preferred_location,
    p.agency_id,
    p.account_status,
    COALESCE(p.profile_completed, false),
    p.role,
    p.phone_e164,
    COALESCE(p.whatsapp_opt_in, false)
  FROM public.profiles p
  WHERE p.id = caller
    AND p.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_own_profile_page() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_profile_page() TO authenticated;

COMMENT ON FUNCTION public.get_own_profile_page() IS
  'Own-row Profile page fields including WhatsApp messaging; SECURITY DEFINER for revoked phone columns.';
