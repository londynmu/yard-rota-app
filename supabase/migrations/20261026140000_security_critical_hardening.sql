-- ============================================================
-- Critical security hardening (PR1)
--
-- A) Profiles privilege guard (INSERT + UPDATE), with bypass for
--    private.anonymise_account (SECURITY DEFINER owner path)
-- B) Admin-only checks + REVOKE anon/public on leaky RPCs
-- C) claim_shift: auth.uid() + approved only; REVOKE anon
-- D) Precheck resolve: private helper; mark_ admin/vmu only;
--    confirmation never PERFORM mark_ (calls private helper)
--
-- Do NOT apply to production until the owner explicitly approves.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

-- -------------------------------------------------------------
-- A) Profiles privilege guard
-- -------------------------------------------------------------

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

DROP TRIGGER IF EXISTS profiles_privilege_guard_insert ON public.profiles;
DROP TRIGGER IF EXISTS profiles_privilege_guard_update ON public.profiles;

CREATE TRIGGER profiles_privilege_guard_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_privilege_guard();

CREATE TRIGGER profiles_privilege_guard_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_privilege_guard();

-- -------------------------------------------------------------
-- B) Admin RPCs — is_admin() first, then REVOKE anon/public
-- -------------------------------------------------------------

-- Live admin user list (columns from 20261004120000_delete_own_account.sql)
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

-- Activity / login / email-leaking RPCs that may exist only on some DBs
DO $harden$
BEGIN
  -- get_full_activity_logs(integer, integer)
  IF to_regprocedure('public.get_full_activity_logs(integer, integer)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_full_activity_logs(
        days_back integer DEFAULT 7,
        limit_count integer DEFAULT 500
      )
      RETURNS TABLE (
        visit_id uuid,
        user_id uuid,
        email text,
        first_name text,
        last_name text,
        page_path text,
        page_title text,
        visited_at timestamptz,
        session_id text,
        time_ago text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          pv.id as visit_id,
          pv.user_id,
          u.email::text,
          p.first_name,
          p.last_name,
          pv.page_path,
          pv.page_title,
          pv.visited_at,
          pv.session_id,
          CASE
            WHEN pv.visited_at > now() - interval '1 hour' THEN
              EXTRACT(MINUTE FROM now() - pv.visited_at)::text || ' minutes ago'
            WHEN pv.visited_at > now() - interval '24 hours' THEN
              EXTRACT(HOUR FROM now() - pv.visited_at)::text || ' hours ago'
            ELSE
              EXTRACT(DAY FROM now() - pv.visited_at)::text || ' days ago'
          END as time_ago
        FROM public.page_visits pv
        INNER JOIN auth.users u ON pv.user_id = u.id
        LEFT JOIN public.profiles p ON pv.user_id = p.id
        WHERE pv.visited_at >= now() - (days_back || ' days')::interval
        ORDER BY pv.visited_at DESC
        LIMIT limit_count;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_full_activity_logs(integer, integer) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_full_activity_logs(integer, integer) TO authenticated';
  END IF;

  -- get_user_activity_summary(integer)
  IF to_regprocedure('public.get_user_activity_summary(integer)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_user_activity_summary(days_back integer DEFAULT 7)
      RETURNS TABLE (
        user_id uuid,
        email text,
        first_name text,
        last_name text,
        total_page_views bigint,
        unique_pages_visited bigint,
        last_activity timestamptz,
        most_visited_page text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        WITH user_stats AS (
          SELECT
            pv.user_id,
            COUNT(*)::bigint as total_views,
            COUNT(DISTINCT pv.page_path)::bigint as unique_pages,
            MAX(pv.visited_at) as last_visit,
            MODE() WITHIN GROUP (ORDER BY pv.page_title) as top_page
          FROM public.page_visits pv
          WHERE pv.visited_at >= now() - (days_back || ' days')::interval
          GROUP BY pv.user_id
        )
        SELECT
          us.user_id,
          u.email::text,
          p.first_name,
          p.last_name,
          us.total_views,
          us.unique_pages,
          us.last_visit,
          us.top_page
        FROM user_stats us
        INNER JOIN auth.users u ON us.user_id = u.id
        LEFT JOIN public.profiles p ON us.user_id = p.id
        ORDER BY us.total_views DESC, us.last_visit DESC;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_user_activity_summary(integer) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_activity_summary(integer) TO authenticated';
  END IF;

  -- get_complete_profiles_with_emails()
  IF to_regprocedure('public.get_complete_profiles_with_emails()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_complete_profiles_with_emails()
      RETURNS TABLE (
        id uuid,
        first_name text,
        last_name text,
        avatar_url text,
        shift_preference text,
        is_active boolean,
        performance_score integer,
        email character varying,
        custom_start_time time,
        custom_end_time time,
        preferred_location text,
        max_daily_hours integer,
        unavailable_days text[],
        notes_for_admin text,
        role text,
        created_at timestamptz,
        updated_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
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
          p.is_active,
          p.performance_score,
          au.email,
          p.custom_start_time,
          p.custom_end_time,
          p.preferred_location,
          p.max_daily_hours,
          p.unavailable_days,
          p.notes_for_admin,
          p.role,
          p.created_at,
          p.updated_at
        FROM public.profiles p
        JOIN auth.users au ON p.id = au.id;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_complete_profiles_with_emails() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_complete_profiles_with_emails() TO authenticated';
  END IF;

  -- get_pending_users()
  IF to_regprocedure('public.get_pending_users()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_pending_users()
      RETURNS TABLE (
        id uuid,
        email text,
        first_name text,
        last_name text,
        account_status text,
        shift_preference text,
        preferred_location text,
        created_at timestamptz,
        updated_at timestamptz
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          p.id,
          u.email::text,
          p.first_name,
          p.last_name,
          p.account_status,
          p.shift_preference,
          p.preferred_location,
          p.created_at,
          p.updated_at
        FROM public.profiles p
        JOIN auth.users u ON p.id = u.id
        WHERE p.account_status = 'pending_approval'
        ORDER BY p.created_at DESC;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_pending_users() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_pending_users() TO authenticated';
  END IF;

  -- get_user_auth_details(uuid)
  IF to_regprocedure('public.get_user_auth_details(uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_user_auth_details(user_id uuid)
      RETURNS TABLE (
        user_id uuid,
        email text,
        created_at timestamptz,
        last_sign_in_at timestamptz,
        days_since_last_login integer,
        days_since_registration integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          u.id AS user_id,
          u.email::text,
          u.created_at,
          u.last_sign_in_at,
          CASE WHEN u.last_sign_in_at IS NOT NULL
            THEN EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer
            ELSE NULL
          END as days_since_last_login,
          EXTRACT(DAY FROM now() - u.created_at)::integer as days_since_registration
        FROM auth.users u
        WHERE u.id = get_user_auth_details.user_id;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_user_auth_details(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_auth_details(uuid) TO authenticated';
  END IF;

  -- get_all_users_login_stats()
  IF to_regprocedure('public.get_all_users_login_stats()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_all_users_login_stats()
      RETURNS TABLE (
        user_id uuid,
        email text,
        first_name text,
        last_name text,
        created_at timestamptz,
        last_sign_in_at timestamptz,
        days_since_last_login integer,
        days_since_registration integer,
        login_count integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          p.id AS user_id,
          u.email::text,
          p.first_name,
          p.last_name,
          u.created_at,
          u.last_sign_in_at,
          CASE WHEN u.last_sign_in_at IS NOT NULL
            THEN EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer
            ELSE NULL
          END AS days_since_last_login,
          EXTRACT(DAY FROM now() - u.created_at)::integer AS days_since_registration,
          CASE
            WHEN u.last_sign_in_at IS NULL THEN 0
            ELSE 1
          END AS login_count
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        ORDER BY u.last_sign_in_at DESC NULLS LAST;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_all_users_login_stats() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_all_users_login_stats() TO authenticated';
  END IF;

  -- get_login_time_stats()
  IF to_regprocedure('public.get_login_time_stats()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_login_time_stats()
      RETURNS TABLE (
        hour_of_day integer,
        day_of_week integer,
        login_count integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        WITH login_times AS (
          SELECT
            EXTRACT(HOUR FROM last_sign_in_at AT TIME ZONE 'UTC')::integer AS hour_of_day,
            EXTRACT(DOW FROM last_sign_in_at AT TIME ZONE 'UTC')::integer AS day_of_week
          FROM auth.users
          WHERE last_sign_in_at IS NOT NULL
        )
        SELECT
          lt.hour_of_day,
          lt.day_of_week,
          COUNT(*)::integer AS login_count
        FROM login_times lt
        GROUP BY lt.hour_of_day, lt.day_of_week
        ORDER BY lt.day_of_week, lt.hour_of_day;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_login_time_stats() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_login_time_stats() TO authenticated';
  END IF;

  -- get_monthly_user_stats()
  IF to_regprocedure('public.get_monthly_user_stats()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_monthly_user_stats()
      RETURNS TABLE (
        month text,
        new_registrations integer,
        active_users integer,
        retention_rate numeric
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', current_date - interval '12 months'),
            date_trunc('month', current_date),
            interval '1 month'
          ) AS month_start
        ),
        registrations AS (
          SELECT
            date_trunc('month', created_at) AS month,
            COUNT(*)::integer AS count
          FROM auth.users
          WHERE created_at >= current_date - interval '12 months'
          GROUP BY 1
        ),
        active AS (
          SELECT
            date_trunc('month', last_sign_in_at) AS month,
            COUNT(DISTINCT id)::integer AS count
          FROM auth.users
          WHERE last_sign_in_at >= current_date - interval '12 months'
          GROUP BY 1
        ),
        total_users AS (
          SELECT
            m.month_start,
            COUNT(u.id)::integer AS total
          FROM months m
          LEFT JOIN auth.users u ON u.created_at < m.month_start + interval '1 month'
          GROUP BY m.month_start
        )
        SELECT
          to_char(m.month_start, 'YYYY-MM') AS month,
          COALESCE(r.count, 0) AS new_registrations,
          COALESCE(a.count, 0) AS active_users,
          CASE
            WHEN t.total = 0 THEN 0
            ELSE round((COALESCE(a.count, 0)::numeric / t.total) * 100, 1)
          END AS retention_rate
        FROM months m
        LEFT JOIN registrations r ON m.month_start = r.month
        LEFT JOIN active a ON m.month_start = a.month
        LEFT JOIN total_users t ON m.month_start = t.month_start
        ORDER BY m.month_start;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_monthly_user_stats() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_monthly_user_stats() TO authenticated';
  END IF;

  -- get_inactive_users_stats()
  IF to_regprocedure('public.get_inactive_users_stats()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_inactive_users_stats()
      RETURNS TABLE (
        inactive_range text,
        count integer,
        percentage numeric
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        WITH user_counts AS (
          SELECT COUNT(*)::integer AS total FROM auth.users
        ),
        inactive_groups AS (
          SELECT
            CASE
              WHEN last_sign_in_at IS NULL THEN 'Never logged in'
              WHEN last_sign_in_at >= current_date - interval '7 days' THEN 'Active (last 7 days)'
              WHEN last_sign_in_at >= current_date - interval '30 days' THEN 'Inactive 7-30 days'
              WHEN last_sign_in_at >= current_date - interval '90 days' THEN 'Inactive 30-90 days'
              ELSE 'Inactive >90 days'
            END AS inactive_range,
            COUNT(*)::integer AS count
          FROM auth.users
          GROUP BY 1
        )
        SELECT
          i.inactive_range,
          i.count,
          round((i.count::numeric / c.total) * 100, 1) AS percentage
        FROM inactive_groups i, user_counts c
        ORDER BY
          CASE i.inactive_range
            WHEN 'Active (last 7 days)' THEN 1
            WHEN 'Inactive 7-30 days' THEN 2
            WHEN 'Inactive 30-90 days' THEN 3
            WHEN 'Inactive >90 days' THEN 4
            WHEN 'Never logged in' THEN 5
          END;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_inactive_users_stats() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_inactive_users_stats() TO authenticated';
  END IF;

  -- get_detailed_login_history(integer)
  IF to_regprocedure('public.get_detailed_login_history(integer)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_detailed_login_history(days_back integer DEFAULT 30)
      RETURNS TABLE (
        user_id uuid,
        email text,
        first_name text,
        last_name text,
        login_time timestamptz,
        ip_address text,
        days_ago integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          u.id as user_id,
          u.email::text,
          p.first_name,
          p.last_name,
          u.last_sign_in_at as login_time,
          u.last_sign_in_at::text as ip_address,
          EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer as days_ago
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        WHERE u.last_sign_in_at IS NOT NULL
          AND u.last_sign_in_at >= now() - (days_back || ' days')::interval
        ORDER BY u.last_sign_in_at DESC;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_detailed_login_history(integer) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_detailed_login_history(integer) TO authenticated';
  END IF;

  -- get_profiles_with_emails()
  IF to_regprocedure('public.get_profiles_with_emails()') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_profiles_with_emails()
      RETURNS TABLE (
        id uuid,
        first_name text,
        last_name text,
        avatar_url text,
        shift_preference text,
        is_active boolean,
        performance_score integer,
        email character varying
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
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
          p.is_active,
          p.performance_score,
          au.email
        FROM public.profiles p
        JOIN auth.users au ON p.id = au.id;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_profiles_with_emails() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_profiles_with_emails() TO authenticated';
  END IF;

  -- get_user_activity_logs(uuid, integer)
  IF to_regprocedure('public.get_user_activity_logs(uuid, integer)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_user_activity_logs(
        target_user_id uuid,
        limit_count integer DEFAULT 100
      )
      RETURNS TABLE (
        visit_id uuid,
        page_path text,
        page_title text,
        visited_at timestamptz,
        session_id text,
        time_ago text
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN QUERY
        SELECT
          pv.id as visit_id,
          pv.page_path,
          pv.page_title,
          pv.visited_at,
          pv.session_id,
          CASE
            WHEN pv.visited_at > now() - interval '1 hour' THEN
              EXTRACT(MINUTE FROM now() - pv.visited_at)::text || ' minutes ago'
            WHEN pv.visited_at > now() - interval '24 hours' THEN
              EXTRACT(HOUR FROM now() - pv.visited_at)::text || ' hours ago'
            ELSE
              EXTRACT(DAY FROM now() - pv.visited_at)::text || ' days ago'
          END as time_ago
        FROM public.page_visits pv
        WHERE pv.user_id = target_user_id
        ORDER BY pv.visited_at DESC
        LIMIT limit_count;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_user_activity_logs(uuid, integer) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_activity_logs(uuid, integer) TO authenticated';
  END IF;

  -- get_user_last_login(uuid)
  IF to_regprocedure('public.get_user_last_login(uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_user_last_login(uid uuid)
      RETURNS timestamptz
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF NOT public.is_admin()
           AND auth.uid() IS DISTINCT FROM uid THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        RETURN (
          SELECT last_sign_in_at FROM auth.users WHERE id = uid
        );
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_user_last_login(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_last_login(uuid) TO authenticated';
  END IF;

  -- update_user_profile — only self (or admin) may update safe fields
  IF to_regprocedure('public.update_user_profile(uuid, text, text, text, text)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.update_user_profile(
        user_id uuid,
        first_name text,
        last_name text,
        shift_preference text,
        avatar_url text DEFAULT NULL
      )
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF auth.uid() IS NULL THEN
          RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
        END IF;

        IF auth.uid() IS DISTINCT FROM user_id AND NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
        END IF;

        UPDATE public.profiles
        SET
          first_name = update_user_profile.first_name,
          last_name = update_user_profile.last_name,
          shift_preference = update_user_profile.shift_preference,
          profile_completed = TRUE,
          updated_at = NOW()
        WHERE id = user_id;

        IF avatar_url IS NOT NULL THEN
          UPDATE public.profiles
          SET avatar_url = update_user_profile.avatar_url
          WHERE id = user_id;
        END IF;

        RETURN TRUE;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_user_profile(uuid, text, text, text, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.update_user_profile(uuid, text, text, text, text) TO authenticated';
  END IF;

  -- create_pending_user — admin only, force safe role defaults
  IF to_regprocedure('public.create_pending_user(text, text, text, text)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.create_pending_user(
        first_name text,
        last_name text,
        shift_preference text DEFAULT 'day',
        user_role text DEFAULT 'user'
      )
      RETURNS uuid
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      DECLARE
        new_id uuid;
        safe_role text;
      BEGIN
        IF NOT public.is_admin() THEN
          RAISE EXCEPTION 'Access denied: admin only' USING ERRCODE = '42501';
        END IF;

        safe_role := COALESCE(user_role, 'user');
        IF safe_role NOT IN ('user', 'admin', 'transport_manager', 'vmu') THEN
          RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
        END IF;

        SELECT gen_random_uuid() INTO new_id;

        INSERT INTO public.profiles (
          id,
          first_name,
          last_name,
          shift_preference,
          role,
          status,
          is_active,
          profile_completed,
          performance_score
        ) VALUES (
          new_id,
          first_name,
          last_name,
          shift_preference,
          safe_role,
          'pending',
          true,
          false,
          50
        );

        RETURN new_id;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_pending_user(text, text, text, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_pending_user(text, text, text, text) TO authenticated';
  END IF;
END;
$harden$;

-- -------------------------------------------------------------
-- C) claim_shift — authenticated approved user, auth.uid() only
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_shift(
  shift_id uuid,
  user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_shift record;
  conflict_check record;
  user_profile record;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  END IF;

  IF claim_shift.user_id IS DISTINCT FROM caller THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You can only claim a shift for yourself'
    );
  END IF;

  SELECT * INTO user_profile
  FROM profiles
  WHERE id = caller
    AND account_status = 'approved'
    AND COALESCE(is_active, true)
    AND deleted_at IS NULL;

  IF user_profile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Account not approved'
    );
  END IF;

  SELECT * INTO target_shift
  FROM scheduled_rota
  WHERE id = claim_shift.shift_id
    AND status = 'available'
    AND scheduled_rota.user_id IS NULL;

  IF target_shift IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Shift not found or not available for claiming'
    );
  END IF;

  SELECT sr.id INTO conflict_check
  FROM scheduled_rota sr
  WHERE sr.user_id = caller
    AND sr.date = target_shift.date
    AND (
      (target_shift.start_time >= sr.start_time AND target_shift.start_time < sr.end_time)
      OR (target_shift.end_time > sr.start_time AND target_shift.end_time <= sr.end_time)
      OR (target_shift.start_time <= sr.start_time AND target_shift.end_time >= sr.end_time)
    )
  LIMIT 1;

  IF conflict_check IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You already have a shift scheduled that conflicts with this time'
    );
  END IF;

  UPDATE scheduled_rota
  SET
    user_id = caller,
    status = NULL
  WHERE id = claim_shift.shift_id;

  INSERT INTO public.system_activity_log (user_id, entity_type, action_type, entity_id, payload)
  VALUES (
    caller,
    'rota',
    'shift_claimed',
    claim_shift.shift_id,
    jsonb_build_object(
      'shift_id', claim_shift.shift_id,
      'date', target_shift.date,
      'location', target_shift.location,
      'shift_type', target_shift.shift_type,
      'start_time', target_shift.start_time,
      'end_time', target_shift.end_time
    )
  );

  INSERT INTO notifications (type, recipient_id, title, message, metadata, created_at)
  SELECT
    'shift_claimed',
    p.id,
    'Shift Claimed',
    format('%s %s claimed a shift for %s',
           user_profile.first_name,
           user_profile.last_name,
           to_char(target_shift.date, 'DD Mon YYYY')),
    jsonb_build_object(
      'shift_id', target_shift.id,
      'date', target_shift.date,
      'location', target_shift.location,
      'shift_type', target_shift.shift_type,
      'start_time', target_shift.start_time,
      'end_time', target_shift.end_time,
      'user_id', caller,
      'user_name', user_profile.first_name || ' ' || user_profile.last_name
    ),
    now()
  FROM profiles p
  WHERE p.role = 'admin';

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Shift claimed successfully'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_shift(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_shift(uuid, uuid) TO authenticated;

-- Single-arg overload (prod only): claim for auth.uid() when approved
DO $claim1$
BEGIN
  IF to_regprocedure('public.claim_shift(uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.claim_shift(p_primary_slot_id uuid)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $body$
      DECLARE
        v_slot   scheduled_rota%rowtype;
        v_row    scheduled_rota%rowtype;
        v_free   int;
        v_cap    int;
        caller   uuid := auth.uid();
      BEGIN
        IF caller IS NULL THEN
          RAISE EXCEPTION 'Not authenticated';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM profiles
          WHERE id = caller
            AND account_status = 'approved'
            AND COALESCE(is_active, true)
            AND deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'Account not approved';
        END IF;

        SELECT * INTO v_slot
          FROM scheduled_rota
         WHERE id = p_primary_slot_id
         LIMIT 1;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Slot not found';
        END IF;

        SELECT * INTO v_row
          FROM scheduled_rota
         WHERE date = v_slot.date
           AND location = v_slot.location
           AND start_time = v_slot.start_time
           AND end_time   = v_slot.end_time
           AND user_id is null
           AND status = 'available'
         LIMIT 1
         FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Shift already full';
        END IF;

        UPDATE scheduled_rota
           SET user_id = caller,
               status  = null
         WHERE id = v_row.id;

        SELECT count(*) INTO v_free
          FROM scheduled_rota
         WHERE date = v_slot.date
           AND location = v_slot.location
           AND start_time = v_slot.start_time
           AND end_time   = v_slot.end_time
           AND user_id is null
           AND status = 'available';

        SELECT count(*) INTO v_cap
          FROM scheduled_rota
         WHERE date = v_slot.date
           AND location = v_slot.location
           AND start_time = v_slot.start_time
           AND end_time   = v_slot.end_time;

        IF v_free = 0 THEN
          UPDATE scheduled_rota
             SET status = null
           WHERE date = v_slot.date
             AND location = v_slot.location
             AND start_time = v_slot.start_time
             AND end_time   = v_slot.end_time
             AND status = 'available';
        END IF;

        RETURN true;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.claim_shift(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.claim_shift(uuid) TO authenticated';
  END IF;
END;
$claim1$;

-- -------------------------------------------------------------
-- D) Precheck resolve chain
-- -------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION public.mark_precheck_damage_resolved(damage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_admin() OR public.is_vmu()) THEN
    RAISE EXCEPTION 'Only admin or VMU can mark defects resolved'
      USING ERRCODE = '42501';
  END IF;

  SELECT repair_status INTO old_status
  FROM precheck_damages
  WHERE id = damage_id;

  IF old_status IS NULL OR old_status = 'resolved' THEN
    RETURN;
  END IF;

  -- Acknowledged defects: only admin/vmu (already checked) may resolve
  PERFORM private.resolve_precheck_damage(damage_id, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.mark_precheck_damage_resolved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_precheck_damage_resolved(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_precheck_damage_fixed_confirmation(
  damage_id uuid,
  submission_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required int;
  v_count bigint;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- VMU or admin: resolve immediately via private helper (never mark_)
  IF is_vmu() OR is_admin() THEN
    PERFORM private.resolve_precheck_damage(damage_id, auth.uid());
    RETURN;
  END IF;

  -- Shunters: only approved, active, non-deleted accounts may confirm/resolve
  IF NOT EXISTS (
    SELECT 1
      FROM profiles
     WHERE id = auth.uid()
       AND account_status = 'approved'
       AND COALESCE(is_active, true)
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Account not approved'
      USING ERRCODE = '42501';
  END IF;

  -- Only record if damage exists, is not resolved and not acknowledged by VMU
  SELECT repair_status INTO v_status
  FROM precheck_damages
  WHERE id = damage_id;

  IF v_status IS NULL OR v_status IN ('resolved', 'acknowledged') THEN
    RETURN;
  END IF;

  INSERT INTO precheck_damage_fixed_confirmations (damage_id, user_id, submission_id)
  VALUES (damage_id, auth.uid(), submission_id);

  SELECT COALESCE(
    (SELECT (value::int) FROM settings WHERE key = 'defect_resolve_confirmations_required' LIMIT 1),
    1
  ) INTO v_required;

  IF v_required < 1 THEN
    v_required := 1;
  END IF;

  SELECT count(*) INTO v_count
  FROM precheck_damage_fixed_confirmations
  WHERE precheck_damage_fixed_confirmations.damage_id = record_precheck_damage_fixed_confirmation.damage_id;

  IF v_count >= v_required THEN
    -- Shunter auth.uid() — must NOT call mark_ (admin/vmu only)
    PERFORM private.resolve_precheck_damage(damage_id, auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_precheck_damage_fixed_confirmation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_precheck_damage_fixed_confirmation(uuid, uuid) TO authenticated;
