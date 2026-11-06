-- WhatsApp PreCheck reminders — Phase A (data only).
-- Adds messaging phone + WhatsApp opt-in on profiles, privilege-guard
-- handling for self-edit, admin list RPC fields, and anonymise cleanup.
-- Do NOT apply to production until the owner explicitly approves.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_by uuid;

COMMENT ON COLUMN public.profiles.phone_e164 IS
  'WhatsApp/SMS messaging number in E.164 (+44…). Null when unset.';
COMMENT ON COLUMN public.profiles.whatsapp_opt_in IS
  'User/admin consent for operational WhatsApp PreCheck reminders (not marketing).';
COMMENT ON COLUMN public.profiles.whatsapp_opt_in_at IS
  'When whatsapp_opt_in last changed.';
COMMENT ON COLUMN public.profiles.whatsapp_opt_in_by IS
  'Who last changed whatsapp_opt_in (auth.uid of user or admin).';

-- One messaging number per profile when set.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_unique
  ON public.profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Messaging columns follow the email pattern:
-- profiles RLS SELECT is USING (true), so column-level SELECT for
-- anon/authenticated would leak every user's phone. Do NOT grant SELECT.
-- Clients may INSERT/UPDATE their own messaging fields; own-row read goes
-- through get_own_messaging_settings(). Admins use get_admin_profiles_with_emails().
REVOKE SELECT (
  phone_e164,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_by
) ON public.profiles FROM PUBLIC, anon, authenticated;

GRANT INSERT (
  phone_e164,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_by
) ON public.profiles TO anon, authenticated;

GRANT UPDATE (
  phone_e164,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_by
) ON public.profiles TO anon, authenticated;

-- Definer roles / Edge (service_role) need to read phones for send + admin RPCs.
GRANT SELECT (
  phone_e164,
  whatsapp_opt_in,
  whatsapp_opt_in_at,
  whatsapp_opt_in_by
) ON public.profiles TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Privilege guard: allow own-row phone + opt-in; stamp opt-in audit;
-- still block privileged columns for non-admins.
-- ---------------------------------------------------------------------------
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
    IF TG_OP = 'INSERT' THEN
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
      -- Stamp WhatsApp opt-in audit on create when opted in.
      IF COALESCE(NEW.whatsapp_opt_in, false) THEN
        NEW.whatsapp_opt_in_at := coalesce(NEW.whatsapp_opt_in_at, now());
        NEW.whatsapp_opt_in_by := coalesce(NEW.whatsapp_opt_in_by, caller);
      ELSE
        NEW.whatsapp_opt_in := false;
        NEW.whatsapp_opt_in_at := NULL;
        NEW.whatsapp_opt_in_by := NULL;
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

      -- phone_e164 + whatsapp_opt_in are intentionally editable on own row.
      -- Stamp audit when opt-in flips; ignore client-forged at/by otherwise.
      IF NEW.whatsapp_opt_in IS DISTINCT FROM OLD.whatsapp_opt_in THEN
        NEW.whatsapp_opt_in_at := now();
        NEW.whatsapp_opt_in_by := caller;
      ELSE
        NEW.whatsapp_opt_in_at := OLD.whatsapp_opt_in_at;
        NEW.whatsapp_opt_in_by := OLD.whatsapp_opt_in_by;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- Admin path: allow only known roles
  IF NEW.role IS NOT NULL
     AND NEW.role NOT IN ('user', 'admin', 'transport_manager', 'vmu') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
  END IF;

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

  -- Admin may edit anyone's phone/opt-in; stamp audit when opt-in changes.
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.whatsapp_opt_in, false) THEN
      NEW.whatsapp_opt_in_at := coalesce(NEW.whatsapp_opt_in_at, now());
      NEW.whatsapp_opt_in_by := coalesce(NEW.whatsapp_opt_in_by, caller);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.whatsapp_opt_in IS DISTINCT FROM OLD.whatsapp_opt_in THEN
      NEW.whatsapp_opt_in_at := now();
      NEW.whatsapp_opt_in_by := caller;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin list RPC: include phone + WhatsApp opt-in
-- ---------------------------------------------------------------------------
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
    phone_e164 text,
    whatsapp_opt_in boolean,
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
        p.phone_e164,
        COALESCE(p.whatsapp_opt_in, false),
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

-- ---------------------------------------------------------------------------
-- Own-row messaging read (no column SELECT on phone for authenticated)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_own_messaging_settings()
RETURNS TABLE (
  phone_e164 text,
  whatsapp_opt_in boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.phone_e164,
    COALESCE(p.whatsapp_opt_in, false) AS whatsapp_opt_in
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_own_messaging_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_messaging_settings() TO authenticated;

-- ---------------------------------------------------------------------------
-- Soft-delete: clear messaging fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.anonymise_account(target uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  anonymised_email text := format('deleted-%s@deleted.invalid', target);
  personal_table text;
  personal_column text;
BEGIN
  FOR personal_table, personal_column IN
    SELECT v.tbl, v.col
      FROM (VALUES
        ('public.availability', 'user_id'),
        ('public.user_day_notes', 'user_id'),
        ('public.page_visits', 'user_id'),
        ('public.notifications', 'recipient_id')
      ) AS v(tbl, col)
  LOOP
    IF to_regclass(personal_table) IS NOT NULL AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = to_regclass(personal_table)
         AND a.attname = personal_column
         AND NOT a.attisdropped
    ) THEN
      EXECUTE format(
        'DELETE FROM %s WHERE %I = $1',
        to_regclass(personal_table),
        personal_column
      ) USING target;
    END IF;
  END LOOP;

  UPDATE public.profiles
     SET first_name = 'Deleted',
         last_name = 'user',
         email = anonymised_email,
         avatar_url = NULL,
         yard_system_id = NULL,
         phone_e164 = NULL,
         whatsapp_opt_in = false,
         whatsapp_opt_in_at = NULL,
         whatsapp_opt_in_by = NULL,
         role = 'user',
         account_status = 'rejected',
         is_active = false,
         deleted_at = coalesce(deleted_at, now()),
         updated_at = now()
   WHERE id = target;

  UPDATE auth.users
     SET email = anonymised_email,
         phone = NULL,
         encrypted_password = '',
         raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity',
         updated_at = now()
   WHERE id = target;

  DELETE FROM auth.identities WHERE user_id = target;
  DELETE FROM auth.sessions WHERE user_id = target;
END;
$$;

REVOKE ALL ON FUNCTION private.anonymise_account(uuid) FROM public, anon, authenticated;
