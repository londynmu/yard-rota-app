-- Corrective: ensure authenticated can UPDATE messaging columns on profiles.
-- SELECT stays revoked (read via get_own_whatsapp_messaging / admin RPCs).
-- Audit columns whatsapp_opt_in_at / whatsapp_opt_in_by are stamped by
-- profiles_privilege_guard — clients must not write them.
--
-- Note: INSERT … ON CONFLICT DO UPDATE (PostgREST upsert) that includes
-- phone_e164 / whatsapp_opt_in still fails without SELECT on those columns.
-- Clients must UPDATE messaging fields separately (not upsert them).

-- Match email pattern: UPDATE (+ INSERT for signup-shaped writes), no SELECT.
REVOKE SELECT (
  phone_e164,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_by
) ON public.profiles FROM PUBLIC;
REVOKE SELECT (
  phone_e164,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_by
) ON public.profiles FROM anon;
REVOKE SELECT (
  phone_e164,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_by
) ON public.profiles FROM authenticated;

GRANT UPDATE (phone_e164, whatsapp_opt_in) ON public.profiles TO authenticated;
GRANT INSERT (phone_e164, whatsapp_opt_in) ON public.profiles TO authenticated;

-- anon already has INSERT/UPDATE on other profile columns for signup-shaped
-- paths; mirror the same for messaging columns without granting SELECT.
GRANT UPDATE (phone_e164, whatsapp_opt_in) ON public.profiles TO anon;
GRANT INSERT (phone_e164, whatsapp_opt_in) ON public.profiles TO anon;
