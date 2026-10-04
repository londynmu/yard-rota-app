-- Account deletion without losing safety records.
--
-- Accounts are anonymised instead of hard-deleted, both when a user deletes
-- their own account (App Store 5.1.1(v) / Google Play) and when an admin
-- deletes a user. Deleting auth.users would cascade through profiles into
-- precheck_submissions -> precheck_damages and shunter_violations, wiping tug
-- defect reports and safety/audit records.
--
-- What anonymisation does:
--   * sign-in is permanently disabled (banned, password and identities removed,
--     sessions revoked) and the auth e-mail / phone / metadata are scrubbed;
--   * the profile keeps its id but loses all personal data ("Deleted user")
--     and gets deleted_at, which hides it from admin lists;
--   * personal-only data (availability, day notes, page visits, notifications)
--     is deleted;
--   * PreCheck history, defect reports and violations stay, without a name.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Not exposed through the API: only the SECURITY DEFINER entry points below
-- (running as the schema owner) can call into it.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

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

-- Self-service deletion.
-- Guards:
--   * no parameters: only the caller (auth.uid() from the signed JWT) is affected;
--   * the caller must have signed in within the last 10 minutes (amr timestamp),
--     so a stolen long-lived session cannot be used to delete the account;
--   * the last active admin cannot delete themselves.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  last_sign_in_epoch numeric;
  caller_role text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT max((entry ->> 'timestamp')::numeric)
    INTO last_sign_in_epoch
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(auth.jwt() -> 'amr') = 'array' THEN auth.jwt() -> 'amr'
        ELSE '[]'::jsonb
      END
    ) AS entry;

  IF last_sign_in_epoch IS NULL
     OR last_sign_in_epoch < extract(epoch FROM now()) - 600 THEN
    RAISE EXCEPTION 'REAUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.role
    INTO caller_role
    FROM public.profiles p
   WHERE p.id = caller
     FOR UPDATE;

  IF caller_role = 'admin' THEN
    PERFORM 1 FROM public.profiles p WHERE p.role = 'admin' FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.role = 'admin'
         AND p.id <> caller
         AND p.deleted_at IS NULL
         AND p.account_status IS DISTINCT FROM 'rejected'
    ) THEN
      RAISE EXCEPTION 'LAST_ADMIN' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM private.anonymise_account(caller);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

COMMENT ON FUNCTION public.delete_own_account() IS
  'Anonymises and disables the calling user''s account. Requires a sign-in within the last 10 minutes. Safety records (PreChecks, defects, violations) are retained without personal data.';

-- Admin deletion of another user. Same signature as before so existing
-- clients keep working; admins delete themselves through delete_own_account,
-- which carries the re-auth and last-admin guards.
CREATE OR REPLACE FUNCTION public.delete_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role = 'admin'
       AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only administrators can delete users' USING ERRCODE = '42501';
  END IF;

  IF delete_user.user_id = auth.uid() THEN
    RAISE EXCEPTION 'USE_SELF_DELETE' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
     FROM public.profiles p
    WHERE p.id = delete_user.user_id
      FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM private.anonymise_account(delete_user.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_user(uuid) IS
  'Admin only. Anonymises and disables another user''s account. Safety records (PreChecks, defects, violations) are retained without personal data.';

-- Admin user list: hide anonymised accounts. Same columns as
-- 20261002110000_profile_preferred_start_time.sql.
DROP FUNCTION IF EXISTS public.get_admin_profiles_with_emails();

CREATE OR REPLACE FUNCTION public.get_admin_profiles_with_emails()
RETURNS TABLE (
    id uuid,
    first_name text,
    last_name text,
    avatar_url text,
    shift_preference text,
    is_active boolean,
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
    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.shift_preference,
        COALESCE(p.is_active, true),
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

REVOKE ALL ON FUNCTION public.get_admin_profiles_with_emails() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_profiles_with_emails() TO authenticated;
