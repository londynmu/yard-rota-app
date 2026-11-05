-- Performance display visibility flag (separate from is_active / account security).
-- Default true keeps all current users visible. Imports stay unfiltered.
-- Do NOT apply to production until the owner explicitly approves.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_on_reports boolean NOT NULL DEFAULT true;

-- Column-level SELECT (table SELECT was revoked in
-- 20261027053000_profiles_hide_sensitive_columns_fix).
GRANT SELECT (show_on_reports) ON public.profiles TO anon, authenticated;

-- Non-admins cannot self-hide/unhide (same pattern as yard_system_id).
CREATE OR REPLACE FUNCTION public.profiles_privilege_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  anonymise_owner name;
  table_owner name;
  caller uuid := auth.uid();
  is_caller_admin boolean := false;
BEGIN
  -- Bypass when running as the owner used by SECURITY DEFINER
  -- private.anonymise_account (self-delete / admin delete).
  SELECT r.rolname
    INTO anonymise_owner
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
   WHERE n.nspname = 'private'
     AND p.proname = 'anonymise_account'
   LIMIT 1;

  SELECT r.rolname
    INTO table_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
   WHERE n.nspname = 'public'
     AND c.relname = 'profiles'
   LIMIT 1;

  IF current_user IS NOT DISTINCT FROM anonymise_owner
     OR (anonymise_owner IS NULL AND current_user IS NOT DISTINCT FROM table_owner) THEN
    RETURN NEW;
  END IF;

  -- Real admin only: same criteria as last-admin protection.
  -- Deactivated / rejected / deleted admins take the restricted path
  -- (cannot self-restore is_active or account_status via is_admin() alone).
  is_caller_admin := caller IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = caller
       AND p.role = 'admin'
       AND p.deleted_at IS NULL
       AND p.account_status IS DISTINCT FROM 'rejected'
       AND COALESCE(p.is_active, true)
  );

  IF NOT is_caller_admin THEN
    -- Non-admin: force safe defaults / block privilege columns
    IF TG_OP = 'INSERT' THEN
      -- Force safe defaults (DB default for account_status is 'approved' — override)
      NEW.role := 'user';
      NEW.is_active := true;
      NEW.deleted_at := NULL;
      NEW.performance_score := 50;
      NEW.yard_system_id := NULL;
      NEW.show_on_reports := true;
      NEW.notes_for_admin := NULL;
      NEW.account_status := 'pending_approval';
      IF caller IS NULL OR NEW.id IS DISTINCT FROM caller THEN
        RAISE EXCEPTION 'Cannot create profile for another user'
          USING ERRCODE = '42501';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Cannot change role' USING ERRCODE = '42501';
      END IF;
      IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        RAISE EXCEPTION 'Cannot change is_active' USING ERRCODE = '42501';
      END IF;
      IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION 'Cannot change deleted_at' USING ERRCODE = '42501';
      END IF;
      IF NEW.performance_score IS DISTINCT FROM OLD.performance_score THEN
        RAISE EXCEPTION 'Cannot change performance_score' USING ERRCODE = '42501';
      END IF;
      IF NEW.yard_system_id IS DISTINCT FROM OLD.yard_system_id THEN
        RAISE EXCEPTION 'Cannot change yard_system_id' USING ERRCODE = '42501';
      END IF;
      IF NEW.show_on_reports IS DISTINCT FROM OLD.show_on_reports THEN
        RAISE EXCEPTION 'Cannot change show_on_reports' USING ERRCODE = '42501';
      END IF;
      IF NEW.notes_for_admin IS DISTINCT FROM OLD.notes_for_admin THEN
        RAISE EXCEPTION 'Cannot change notes_for_admin' USING ERRCODE = '42501';
      END IF;
      IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
        -- Allow first-time completion → pending_approval; block rejected → pending_approval
        IF NEW.account_status IS DISTINCT FROM 'pending_approval'
           OR caller IS NULL
           OR NEW.id IS DISTINCT FROM caller
           OR OLD.account_status = 'rejected' THEN
          RAISE EXCEPTION 'Only pending_approval is allowed for account_status on own row'
            USING ERRCODE = '42501';
        END IF;
      END IF;
      IF caller IS NULL OR NEW.id IS DISTINCT FROM caller THEN
        RAISE EXCEPTION 'Cannot update another user profile'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- Admin path: allow only known roles
  IF NEW.role IS NOT NULL
     AND NEW.role NOT IN ('user', 'admin', 'transport_manager', 'vmu') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
  END IF;

  -- Refuse removing / deactivating the last admin
  IF TG_OP = 'UPDATE'
     AND OLD.role = 'admin'
     AND (
       NEW.role IS DISTINCT FROM 'admin'
       OR NEW.is_active IS FALSE
       OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
       OR NEW.account_status = 'rejected'
     ) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.role = 'admin'
         AND p.id <> OLD.id
         AND p.deleted_at IS NULL
         AND p.account_status IS DISTINCT FROM 'rejected'
         AND COALESCE(p.is_active, true)
    ) THEN
      RAISE EXCEPTION 'Cannot remove or deactivate the last admin'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.role = 'admin'
     AND NEW.is_active IS FALSE THEN
    RAISE EXCEPTION 'Cannot create inactive admin' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate admin list RPC to include show_on_reports (return type change).
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_emails();

CREATE OR REPLACE FUNCTION public.get_admin_profiles_with_emails()
RETURNS TABLE (
    id uuid,
    first_name text,
    last_name text,
    avatar_url text,
    shift_preference text,
    is_active boolean,
    show_on_reports boolean,
    performance_score integer,
    yard_system_id text,
    custom_start_time time,
    preferred_start_time time,
    preferred_location text,
    additional_locations text[],
    agency_id uuid,
    agency_name text,
    role text,
    last_activity_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.shift_preference,
        COALESCE(p.is_active, true),
        COALESCE(p.show_on_reports, true),
        p.performance_score,
        p.yard_system_id,
        p.custom_start_time,
        p.preferred_start_time,
        p.preferred_location,
        COALESCE(p.additional_locations, '{}'::text[]),
        p.agency_id,
        a.name::text AS agency_name,
        p.role::text,
        (SELECT MAX(ts) FROM (
            SELECT pv.visited_at AS ts FROM public.page_visits pv WHERE pv.user_id = p.id
            UNION ALL
            SELECT ps.created_at AS ts FROM public.precheck_submissions ps WHERE ps.user_id = p.id
            UNION ALL
            SELECT dal.created_at AS ts FROM public.defect_activity_log dal WHERE dal.user_id = p.id
        ) x) AS last_activity_at,
        p.created_at,
        p.updated_at
    FROM public.profiles p
    LEFT JOIN public.agencies a ON a.id = p.agency_id
    WHERE p.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_profiles_with_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_profiles_with_emails() TO authenticated;
