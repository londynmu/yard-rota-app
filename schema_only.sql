


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."claim_state" AS ENUM (
    'assigned',
    'released'
);


ALTER TYPE "public"."claim_state" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_damage_last_reported_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE precheck_damages
  SET last_reported_at = GREATEST(COALESCE(last_reported_at, created_at, now()), NEW.created_at)
  WHERE id = NEW.damage_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bump_damage_last_reported_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_released_shift"("p_slot_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_slot   scheduled_rota%rowtype;
  v_taken  int;
  v_cap    int;
  v_claim  shift_claims%rowtype;
begin
  -- pobierz slot
  select *
    into v_slot
    from scheduled_rota
   where id = p_slot_id
   limit 1;

  if not found then
    raise exception 'Slot not found';
  end if;

  -- 1) spróbuj przejąć najstarszą zwolnioną zmianę
  select *
    into v_claim
    from shift_claims
   where slot_id = v_slot.id
     and state   = 'released'
   order by created_at asc
   limit 1
   for update skip locked;

  if found then
    update shift_claims
       set state      = 'assigned',
           user_id    = auth.uid(),
           created_at = now()
     where id = v_claim.id;

    return true;
  end if;

  -- 2) jeśli nie ma released → sprawdź pojemność
  select count(*) into v_taken
    from shift_claims
   where slot_id = v_slot.id
     and state   = 'assigned';

  v_cap := v_slot.capacity;

  if v_taken >= v_cap then
    raise exception 'Shift full';
  end if;

  -- 3) wciąż są miejsca → dodaj nowy wpis assigned
  insert into shift_claims(slot_id, user_id, state)
  values (v_slot.id, auth.uid(), 'assigned');

  return true;
end;
$$;


ALTER FUNCTION "public"."claim_released_shift"("p_slot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_shift"("p_primary_slot_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_slot   scheduled_rota%rowtype;
  v_row    scheduled_rota%rowtype;
  v_free   int;
  v_cap    int;
begin
  -- 1) locate primary slot row
  select * into v_slot
    from scheduled_rota
   where id = p_primary_slot_id
   limit 1;

  if not found then
    raise exception 'Slot not found';
  end if;

  -- 2) find free row in the same logical slot
  select * into v_row
    from scheduled_rota
   where date = v_slot.date
     and location = v_slot.location
     and start_time = v_slot.start_time
     and end_time   = v_slot.end_time
     and user_id is null
     and status = 'available'
   limit 1
   for update;

  if not found then
    raise exception 'Shift already full';
  end if;

  -- 3) assign to current user
  update scheduled_rota
     set user_id = auth.uid(),
         status  = null
   where id = v_row.id;

  -- 4) check remaining free rows
  select count(*) into v_free
    from scheduled_rota
   where date = v_slot.date
     and location = v_slot.location
     and start_time = v_slot.start_time
     and end_time   = v_slot.end_time
     and user_id is null
     and status = 'available';

  -- capacity (all rows)
  select count(*) into v_cap
    from scheduled_rota
   where date = v_slot.date
     and location = v_slot.location
     and start_time = v_slot.start_time
     and end_time   = v_slot.end_time;

  -- when no free rows, clear status in all slot rows
  if v_free = 0 then
    update scheduled_rota
       set status = null
     where date = v_slot.date
       and location = v_slot.location
       and start_time = v_slot.start_time
       and end_time   = v_slot.end_time
       and status = 'available';
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."claim_shift"("p_primary_slot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_shift"("shift_id" "uuid", "user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_shift record;
  conflict_check record;
  user_profile record;
BEGIN
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

  SELECT * INTO user_profile
  FROM profiles
  WHERE id = claim_shift.user_id;

  IF user_profile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  SELECT sr.id INTO conflict_check
  FROM scheduled_rota sr
  WHERE sr.user_id = claim_shift.user_id
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
    user_id = claim_shift.user_id,
    status = NULL
  WHERE id = claim_shift.shift_id;

  INSERT INTO public.system_activity_log (user_id, entity_type, action_type, entity_id, payload)
  VALUES (
    claim_shift.user_id,
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
      'user_id', claim_shift.user_id,
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


ALTER FUNCTION "public"."claim_shift"("shift_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_page_views"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM public.page_views
    WHERE visited_at < NOW() - INTERVAL '7 days';
    
    -- Log the cleanup operation
    RAISE NOTICE 'Cleaned up page_views older than 7 days at %', NOW();
END;
$$;


ALTER FUNCTION "public"."cleanup_old_page_views"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_old_page_views"() IS 'Deletes page view records older than 7 days';



CREATE OR REPLACE FUNCTION "public"."create_pending_user"("first_name" "text", "last_name" "text", "shift_preference" "text" DEFAULT 'day'::"text", "user_role" "text" DEFAULT 'user'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_id UUID;
BEGIN
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
    user_role,
    'pending',
    true,
    false,
    50
  );
  
  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."create_pending_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_temp_user"("first_name" "text", "last_name" "text", "shift_preference" "text" DEFAULT 'day'::"text", "user_role" "text" DEFAULT 'user'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  temp_data JSONB;
BEGIN
  -- Zamiast tworzyć wpis w profiles, utwórz tymczasowy wpis w innej tabeli
  INSERT INTO temp_users (
    first_name,
    last_name,
    shift_preference,
    role,
    status,
    created_at
  ) VALUES (
    first_name,
    last_name,
    shift_preference,
    user_role,
    'pending',
    now()
  )
  RETURNING to_jsonb(temp_users.*) INTO temp_data;
  
  RETURN temp_data;
END;
$$;


ALTER FUNCTION "public"."create_temp_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_temp_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") IS 'Creates a temporary user record';



CREATE OR REPLACE FUNCTION "public"."get_active_users_by_timerange"() RETURNS TABLE("time_range" "text", "user_count" bigint, "percentage" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH total AS (
    SELECT COUNT(*)::bigint as total_users FROM auth.users
  ),
  ranges AS (
    SELECT
      CASE
        WHEN last_sign_in_at >= now() - interval '1 hour' THEN 'Last Hour'
        WHEN last_sign_in_at >= now() - interval '24 hours' THEN 'Last 24 Hours'
        WHEN last_sign_in_at >= now() - interval '7 days' THEN 'Last 7 Days'
        WHEN last_sign_in_at >= now() - interval '30 days' THEN 'Last 30 Days'
        WHEN last_sign_in_at >= now() - interval '90 days' THEN 'Last 90 Days'
        WHEN last_sign_in_at IS NOT NULL THEN 'Over 90 Days'
        ELSE 'Never'
      END as time_range
    FROM auth.users
  )
  SELECT 
    r.time_range,
    COUNT(*)::bigint as user_count,
    ROUND((COUNT(*)::numeric / t.total_users) * 100, 1) as percentage
  FROM ranges r, total t
  GROUP BY r.time_range, t.total_users
  ORDER BY
    CASE r.time_range
      WHEN 'Last Hour' THEN 1
      WHEN 'Last 24 Hours' THEN 2
      WHEN 'Last 7 Days' THEN 3
      WHEN 'Last 30 Days' THEN 4
      WHEN 'Last 90 Days' THEN 5
      WHEN 'Over 90 Days' THEN 6
      WHEN 'Never' THEN 7
    END;
$$;


ALTER FUNCTION "public"."get_active_users_by_timerange"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_profiles_with_emails"() RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "avatar_url" "text", "shift_preference" "text", "is_active" boolean, "performance_score" integer, "yard_system_id" "text", "custom_start_time" time without time zone, "preferred_location" "text", "agency_id" "uuid", "agency_name" "text", "last_activity_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
        p.preferred_location,
        p.agency_id,
        a.name AS agency_name,
        (SELECT MAX(ts) FROM (
            SELECT pv.visited_at AS ts FROM page_visits pv WHERE pv.user_id = p.id
            UNION ALL
            SELECT ps.created_at AS ts FROM precheck_submissions ps WHERE ps.user_id = p.id
            UNION ALL
            SELECT dal.created_at AS ts FROM defect_activity_log dal WHERE dal.user_id = p.id
        ) x) AS last_activity_at,
        p.created_at,
        p.updated_at
    FROM public.profiles p
    LEFT JOIN public.agencies a ON a.id = p.agency_id;
END;
$$;


ALTER FUNCTION "public"."get_admin_profiles_with_emails"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_unique_tasks"() RETURNS TABLE("task" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT sr.task 
  FROM public.scheduled_rota sr 
  WHERE sr.task IS NOT NULL AND sr.task != '' 
  ORDER BY sr.task;
END;
$$;


ALTER FUNCTION "public"."get_all_unique_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_users_login_stats"() RETURNS TABLE("user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "days_since_last_login" integer, "days_since_registration" integer, "login_count" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    p.id AS user_id,
    u.email,
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
  FROM 
    auth.users u
  LEFT JOIN
    public.profiles p ON u.id = p.id
  ORDER BY 
    u.last_sign_in_at DESC NULLS LAST;
$$;


ALTER FUNCTION "public"."get_all_users_login_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_complete_profiles_with_emails"() RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "avatar_url" "text", "shift_preference" "text", "is_active" boolean, "performance_score" integer, "email" character varying, "custom_start_time" time without time zone, "custom_end_time" time without time zone, "preferred_location" "text", "max_daily_hours" integer, "unavailable_days" "text"[], "notes_for_admin" "text", "role" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
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
    FROM 
        public.profiles p
    JOIN 
        auth.users au ON p.id = au.id;
END;
$$;


ALTER FUNCTION "public"."get_complete_profiles_with_emails"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_detailed_login_history"("days_back" integer DEFAULT 30) RETURNS TABLE("user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "login_time" timestamp with time zone, "ip_address" "text", "days_ago" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE login_events AS (
    SELECT 
      u.id as user_id,
      u.email,
      p.first_name,
      p.last_name,
      u.last_sign_in_at as login_time,
      u.last_sign_in_at::text as ip_address,
      EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer as days_ago
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE u.last_sign_in_at IS NOT NULL
      AND u.last_sign_in_at >= now() - (days_back || ' days')::interval
  )
  SELECT * FROM login_events
  ORDER BY login_time DESC;
END;
$$;


ALTER FUNCTION "public"."get_detailed_login_history"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_full_activity_logs"("days_back" integer DEFAULT 7, "limit_count" integer DEFAULT 500) RETURNS TABLE("visit_id" "uuid", "user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "page_path" "text", "page_title" "text", "visited_at" timestamp with time zone, "session_id" "text", "time_ago" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    pv.id as visit_id,
    pv.user_id,
    u.email,
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
$$;


ALTER FUNCTION "public"."get_full_activity_logs"("days_back" integer, "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inactive_users_stats"() RETURNS TABLE("inactive_range" "text", "count" integer, "percentage" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."get_inactive_users_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_login_time_stats"() RETURNS TABLE("hour_of_day" integer, "day_of_week" integer, "login_count" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH login_times AS (
    SELECT 
      EXTRACT(HOUR FROM last_sign_in_at AT TIME ZONE 'UTC')::integer AS hour_of_day,
      EXTRACT(DOW FROM last_sign_in_at AT TIME ZONE 'UTC')::integer AS day_of_week
    FROM auth.users
    WHERE last_sign_in_at IS NOT NULL
  )
  SELECT 
    hour_of_day,
    day_of_week,
    COUNT(*)::integer AS login_count
  FROM login_times
  GROUP BY hour_of_day, day_of_week
  ORDER BY day_of_week, hour_of_day;
$$;


ALTER FUNCTION "public"."get_login_time_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_user_stats"() RETURNS TABLE("month" "text", "new_registrations" integer, "active_users" integer, "retention_rate" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."get_monthly_user_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_most_active_users"("days_back" integer DEFAULT 7, "limit_count" integer DEFAULT 10) RETURNS TABLE("user_email" "text", "first_name" "text", "last_name" "text", "page_view_count" bigint, "last_activity" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pv.user_email,
        pv.first_name,
        pv.last_name,
        COUNT(*)::BIGINT as page_view_count,
        MAX(pv.visited_at) as last_activity
    FROM public.page_views pv
    WHERE pv.visited_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY pv.user_email, pv.first_name, pv.last_name
    ORDER BY page_view_count DESC
    LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_most_active_users"("days_back" integer, "limit_count" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_most_active_users"("days_back" integer, "limit_count" integer) IS 'Returns the most active users by page view count';



CREATE OR REPLACE FUNCTION "public"."get_most_visited_pages"("days_back" integer DEFAULT 30) RETURNS TABLE("page_path" "text", "page_title" "text", "visit_count" bigint, "unique_visitors" bigint, "last_visit" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    pv.page_path,
    MAX(pv.page_title) as page_title,
    COUNT(*)::bigint as visit_count,
    COUNT(DISTINCT pv.user_id)::bigint as unique_visitors,
    MAX(pv.visited_at) as last_visit
  FROM public.page_visits pv
  WHERE pv.visited_at >= now() - (days_back || ' days')::interval
  GROUP BY pv.page_path
  ORDER BY visit_count DESC
  LIMIT 50;
$$;


ALTER FUNCTION "public"."get_most_visited_pages"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_page_view_stats"("days_back" integer DEFAULT 7) RETURNS TABLE("page_path" "text", "view_count" bigint, "unique_users" bigint, "last_visited" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pv.page_path,
        COUNT(*)::BIGINT as view_count,
        COUNT(DISTINCT pv.user_id)::BIGINT as unique_users,
        MAX(pv.visited_at) as last_visited
    FROM public.page_views pv
    WHERE pv.visited_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY pv.page_path
    ORDER BY view_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_page_view_stats"("days_back" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_page_view_stats"("days_back" integer) IS 'Returns aggregated page view statistics';



CREATE OR REPLACE FUNCTION "public"."get_page_visits_by_day"("days_back" integer DEFAULT 30) RETURNS TABLE("visit_date" "date", "visit_count" bigint, "unique_visitors" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    DATE(visited_at AT TIME ZONE 'UTC') as visit_date,
    COUNT(*)::bigint as visit_count,
    COUNT(DISTINCT user_id)::bigint as unique_visitors
  FROM public.page_visits
  WHERE visited_at >= now() - (days_back || ' days')::interval
  GROUP BY visit_date
  ORDER BY visit_date DESC;
$$;


ALTER FUNCTION "public"."get_page_visits_by_day"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_page_visits_by_hour"("days_back" integer DEFAULT 7) RETURNS TABLE("hour_of_day" integer, "visit_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    EXTRACT(HOUR FROM visited_at AT TIME ZONE 'UTC')::integer as hour_of_day,
    COUNT(*)::bigint as visit_count
  FROM public.page_visits
  WHERE visited_at >= now() - (days_back || ' days')::interval
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
$$;


ALTER FUNCTION "public"."get_page_visits_by_hour"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pending_users"() RETURNS TABLE("id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "account_status" "text", "shift_preference" "text", "preferred_location" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    u.email,
    p.first_name,
    p.last_name,
    p.account_status,
    p.shift_preference,
    p.preferred_location,
    p.created_at,
    p.updated_at
  FROM
    public.profiles p
  JOIN
    auth.users u ON p.id = u.id
  WHERE
    p.account_status = 'pending_approval'
  ORDER BY
    p.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_pending_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profiles_with_emails"() RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "avatar_url" "text", "shift_preference" "text", "is_active" boolean, "performance_score" integer, "email" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
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
    FROM 
        public.profiles p
    JOIN 
        auth.users au ON p.id = au.id;
END;
$$;


ALTER FUNCTION "public"."get_profiles_with_emails"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_activity_log"("days_back" integer DEFAULT 7, "limit_count" integer DEFAULT 500, "entity_type_filter" "text" DEFAULT NULL::"text", "user_id_filter" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "user_id" "uuid", "first_name" "text", "last_name" "text", "entity_type" "text", "action_type" "text", "entity_id" "uuid", "payload" "jsonb", "created_at" timestamp with time zone, "time_ago" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can read system activity log';
  END IF;

  RETURN QUERY
  SELECT
    sal.id,
    sal.user_id,
    p.first_name,
    p.last_name,
    sal.entity_type,
    sal.action_type,
    sal.entity_id,
    sal.payload,
    sal.created_at,
    CASE
      WHEN sal.created_at > now() - interval '1 hour' THEN
        EXTRACT(MINUTE FROM now() - sal.created_at)::integer::text || ' min ago'
      WHEN sal.created_at > now() - interval '24 hours' THEN
        EXTRACT(HOUR FROM now() - sal.created_at)::integer::text || ' h ago'
      ELSE
        EXTRACT(DAY FROM now() - sal.created_at)::integer::text || ' days ago'
    END
  FROM public.system_activity_log sal
  LEFT JOIN public.profiles p ON p.id = sal.user_id
  WHERE sal.created_at >= now() - (days_back || ' days')::interval
    AND (entity_type_filter IS NULL OR sal.entity_type = entity_type_filter)
    AND (user_id_filter IS NULL OR sal.user_id = user_id_filter)
  ORDER BY sal.created_at DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_system_activity_log"("days_back" integer, "limit_count" integer, "entity_type_filter" "text", "user_id_filter" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tug_assignments_for_date"("target_date" "date") RETURNS TABLE("user_id" "uuid", "tug_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT ON (ps.user_id)
    ps.user_id,
    COALESCE(t.display_name, t.tug_number) AS tug_name
  FROM precheck_submissions ps
  JOIN tugs t ON t.id = ps.tug_id
  WHERE ps.check_date = target_date
     OR (ps.check_date = target_date + 1 AND ps.check_time::time < '06:00:00')
  ORDER BY ps.user_id, ps.check_time DESC;
$$;


ALTER FUNCTION "public"."get_tug_assignments_for_date"("target_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_activity_logs"("target_user_id" "uuid", "limit_count" integer DEFAULT 100) RETURNS TABLE("visit_id" "uuid", "page_path" "text", "page_title" "text", "visited_at" timestamp with time zone, "session_id" "text", "time_ago" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."get_user_activity_logs"("target_user_id" "uuid", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_activity_summary"("days_back" integer DEFAULT 7) RETURNS TABLE("user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "total_page_views" bigint, "unique_pages_visited" bigint, "last_activity" timestamp with time zone, "most_visited_page" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    u.email,
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
$$;


ALTER FUNCTION "public"."get_user_activity_summary"("days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_auth_details"("user_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "days_since_last_login" integer, "days_since_registration" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    u.id AS user_id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    CASE WHEN u.last_sign_in_at IS NOT NULL
      THEN EXTRACT(DAY FROM now() - u.last_sign_in_at)::integer
      ELSE NULL
    END as days_since_last_login,
    EXTRACT(DAY FROM now() - u.created_at)::integer as days_since_registration
  FROM auth.users u
  WHERE u.id = user_id;
$$;


ALTER FUNCTION "public"."get_user_auth_details"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_last_login"("uid" "uuid") RETURNS timestamp with time zone
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT last_sign_in_at FROM auth.users WHERE id = uid;
$$;


ALTER FUNCTION "public"."get_user_last_login"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_page_visits"("target_user_id" "uuid", "limit_count" integer DEFAULT 100) RETURNS TABLE("page_path" "text", "page_title" "text", "visited_at" timestamp with time zone, "session_id" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    pv.page_path,
    pv.page_title,
    pv.visited_at,
    pv.session_id
  FROM public.page_visits pv
  WHERE pv.user_id = target_user_id
  ORDER BY pv.visited_at DESC
  LIMIT limit_count;
$$;


ALTER FUNCTION "public"."get_user_page_visits"("target_user_id" "uuid", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_role TEXT;
  is_admin BOOLEAN := FALSE;
BEGIN
  SELECT role INTO user_role FROM auth.users WHERE id = user_id;
  
  IF user_role = 'service_role' OR EXISTS (
    SELECT 1 FROM auth.users WHERE id = user_id AND email = 'tideend@gmail.com'
  ) THEN
    is_admin := TRUE;
  END IF;
  
  RETURN jsonb_build_object('is_admin', is_admin);
END;
$$;


ALTER FUNCTION "public"."get_user_role"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
    AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_manager_or_vmu"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager', 'vmu')
  );
$$;


ALTER FUNCTION "public"."is_admin_manager_or_vmu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
    AND role IN ('admin', 'manager')
  );
$$;


ALTER FUNCTION "public"."is_admin_or_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_vmu"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'vmu')
  );
$$;


ALTER FUNCTION "public"."is_admin_or_vmu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_transport_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'transport_manager'
  );
$$;


ALTER FUNCTION "public"."is_transport_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_vmu"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'vmu'
  );
$$;


ALTER FUNCTION "public"."is_vmu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_precheck_damage_resolved"("damage_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  old_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT repair_status INTO old_status
  FROM precheck_damages
  WHERE id = damage_id;

  IF old_status IS NULL OR old_status = 'resolved' THEN
    RETURN;
  END IF;

  UPDATE precheck_damages
  SET repair_status = 'resolved',
      resolved_at = now(),
      resolved_by = auth.uid()
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
      auth.uid(),
      'status_change',
      'repair_status',
      old_status,
      'resolved'
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."mark_precheck_damage_resolved"("damage_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_defects"("source_damage_id" "uuid", "target_damage_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  src record;
  tgt record;
  merge_note text;
BEGIN
  IF NOT is_admin_manager_or_vmu() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF source_damage_id IS NULL OR target_damage_id IS NULL THEN
    RAISE EXCEPTION 'Missing defect id(s)';
  END IF;

  IF source_damage_id = target_damage_id THEN
    RETURN;
  END IF;

  SELECT id, tug_id, repair_status INTO src
  FROM precheck_damages
  WHERE id = source_damage_id;

  SELECT id, tug_id, repair_status INTO tgt
  FROM precheck_damages
  WHERE id = target_damage_id;

  IF src.id IS NULL OR tgt.id IS NULL THEN
    RAISE EXCEPTION 'Defect not found';
  END IF;

  IF src.tug_id IS DISTINCT FROM tgt.tug_id THEN
    RAISE EXCEPTION 'Defects must belong to the same tug';
  END IF;

  IF tgt.repair_status = 'resolved' THEN
    RAISE EXCEPTION 'Target defect is resolved';
  END IF;

  -- Move reports
  UPDATE defect_reports
  SET damage_id = tgt.id
  WHERE damage_id = src.id;

  -- Resolve source
  merge_note := 'Merged into ' || tgt.id::text;
  UPDATE precheck_damages
  SET
    repair_status = 'resolved',
    resolved_at = now(),
    resolved_by = auth.uid(),
    vmu_notes = CASE
      WHEN vmu_notes IS NULL OR vmu_notes = '' THEN merge_note
      ELSE vmu_notes || E'\n' || merge_note
    END
  WHERE id = src.id;

  -- Bump target freshness
  UPDATE precheck_damages
  SET last_reported_at = GREATEST(COALESCE(last_reported_at, created_at, now()), now())
  WHERE id = tgt.id;

  -- Optional: write activity log if table exists
  IF to_regclass('public.defect_activity_log') IS NOT NULL THEN
    INSERT INTO defect_activity_log (damage_id, user_id, action_type, field_name, old_value, new_value)
    VALUES
      (src.id, auth.uid(), 'status_change', 'repair_status', COALESCE(src.repair_status, ''), 'resolved'),
      (src.id, auth.uid(), 'field_update', 'merge', NULL, merge_note),
      (tgt.id, auth.uid(), 'field_update', 'merge', NULL, 'Received merge from ' || src.id::text);
  END IF;
END;
$$;


ALTER FUNCTION "public"."merge_defects"("source_damage_id" "uuid", "target_damage_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_precheck_damage_fixed_confirmation"("damage_id" "uuid", "submission_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_required int;
  v_count bigint;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- VMU or admin: resolve immediately (no confirmation row)
  IF is_vmu() OR is_admin() THEN
    PERFORM mark_precheck_damage_resolved(damage_id);
    RETURN;
  END IF;

  -- Only record if damage exists and is not already resolved
  SELECT repair_status INTO v_status
  FROM precheck_damages
  WHERE id = damage_id;

  IF v_status IS NULL OR v_status = 'resolved' THEN
    RETURN;
  END IF;

  INSERT INTO precheck_damage_fixed_confirmations (damage_id, user_id, submission_id)
  VALUES (damage_id, auth.uid(), submission_id);

  -- Read setting (default 1)
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
    PERFORM mark_precheck_damage_resolved(damage_id);
  END IF;
END;
$$;


ALTER FUNCTION "public"."record_precheck_damage_fixed_confirmation"("damage_id" "uuid", "submission_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_shift"("p_slot_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_claim shift_claims%rowtype;
begin
  select * into v_claim
    from shift_claims
   where slot_id = p_slot_id
     and state = 'assigned'
     and user_id = auth.uid()
   limit 1
   for update;

  if not found then
    raise exception 'No assigned shift found for user';
  end if;

  update shift_claims
     set state = 'released', user_id = null, created_at = now()
   where id = v_claim.id;

  return true;
end;
$$;


ALTER FUNCTION "public"."release_shift"("p_slot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scheduled_rota_enforce_consecutive_work_days"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  enforce_text text;
  max_days_text text;
  max_days int := 6;
  streak_before int := 0;
  streak_after int := 0;
  d date;
  total_streak int;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.value INTO enforce_text
  FROM public.settings AS s
  WHERE s.key = 'enforce_max_consecutive_work_days'
  LIMIT 1;

  IF enforce_text IS NULL OR lower(trim(enforce_text)) <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT s.value INTO max_days_text
  FROM public.settings AS s
  WHERE s.key = 'max_consecutive_work_days'
  LIMIT 1;

  IF max_days_text IS NOT NULL AND btrim(max_days_text) <> '' THEN
    BEGIN
      max_days := btrim(max_days_text)::int;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        max_days := 6;
    END;
  END IF;

  IF max_days < 1 OR max_days > 13 THEN
    max_days := 6;
  END IF;

  d := NEW.date - 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.scheduled_rota AS sr
      WHERE sr.user_id = NEW.user_id
        AND sr.date = d
        AND sr.id IS DISTINCT FROM NEW.id
    );
    streak_before := streak_before + 1;
    d := d - 1;
  END LOOP;

  d := NEW.date + 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.scheduled_rota AS sr
      WHERE sr.user_id = NEW.user_id
        AND sr.date = d
        AND sr.id IS DISTINCT FROM NEW.id
    );
    streak_after := streak_after + 1;
    d := d + 1;
  END LOOP;

  total_streak := streak_before + 1 + streak_after;

  IF total_streak > max_days THEN
    RAISE EXCEPTION 'Cannot assign: this would exceed the maximum of % consecutive calendar days with a shift for this user.', max_days
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."scheduled_rota_enforce_consecutive_work_days"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."scheduled_rota_enforce_consecutive_work_days"() IS 'Blocks INSERT/UPDATE when enforce_max_consecutive_work_days is true and streak would exceed max_consecutive_work_days.';



CREATE OR REPLACE FUNCTION "public"."set_precheck_damage_grouping_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_tug_id uuid;
  v_item_key text;
BEGIN
  -- tug_id derived from submission
  SELECT tug_id INTO v_tug_id
  FROM precheck_submissions
  WHERE id = NEW.submission_id;

  -- item_key derived from item (for check_item damages)
  IF NEW.item_id IS NOT NULL THEN
    SELECT item_name INTO v_item_key
    FROM precheck_items
    WHERE id = NEW.item_id;
  ELSE
    v_item_key := NULL;
  END IF;

  NEW.tug_id := COALESCE(NEW.tug_id, v_tug_id);
  NEW.item_key := COALESCE(NEW.item_key, v_item_key);
  NEW.last_reported_at := COALESCE(NEW.last_reported_at, NEW.created_at, now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_precheck_damage_grouping_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_cleanup_page_views"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    -- Only run cleanup occasionally (1 in 100 inserts) to avoid performance impact
    IF random() < 0.01 THEN
        DELETE FROM public.page_views
        WHERE visited_at < NOW() - INTERVAL '7 days';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_cleanup_page_views"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_agencies_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_agencies_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_check_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_check_items_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rota_week_baselines_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_rota_week_baselines_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_shunter_induction_sections_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_shunter_induction_sections_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_shunter_performance_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_shunter_performance_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tugs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_tugs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_day_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_day_notes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_profile"("user_id" "uuid", "first_name" "text", "last_name" "text", "shift_preference" "text", "avatar_url" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Aktualizuj profil
  UPDATE public.profiles
  SET 
    first_name = update_user_profile.first_name,
    last_name = update_user_profile.last_name,
    shift_preference = update_user_profile.shift_preference,
    profile_completed = TRUE,
    updated_at = NOW()
  WHERE id = user_id;
  
  -- Jeśli podano avatar_url, zaktualizuj go również
  IF avatar_url IS NOT NULL THEN
    UPDATE public.profiles
    SET avatar_url = update_user_profile.avatar_url
    WHERE id = user_id;
  END IF;
  
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."update_user_profile"("user_id" "uuid", "first_name" "text", "last_name" "text", "shift_preference" "text", "avatar_url" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "contact_person" "text",
    "phone_number" "text",
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scheduled_rota_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "recorded_by" "uuid" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['no_show'::"text", 'sick'::"text", 'late'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "status" "text" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "availability_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'unavailable'::"text", 'holiday'::"text"])))
);


ALTER TABLE "public"."availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."break_slot_capacities" (
    "id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "shift_type" "text" NOT NULL,
    "location" "text" NOT NULL,
    "std_slot_id" "text" NOT NULL,
    "capacity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "break_slot_capacities_capacity_check" CHECK (("capacity" > 0)),
    CONSTRAINT "break_slot_capacities_location_check" CHECK (("location" = ANY (ARRAY['Main Hub'::"text", 'NRC'::"text"]))),
    CONSTRAINT "break_slot_capacities_shift_type_check" CHECK (("shift_type" = ANY (ARRAY['day'::"text", 'night'::"text", 'afternoon'::"text"])))
);


ALTER TABLE "public"."break_slot_capacities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_break_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "shift_type" "text" NOT NULL,
    "location" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "duration_minutes" integer NOT NULL,
    "capacity" integer DEFAULT 2 NOT NULL,
    "break_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "custom_break_slots_capacity_check" CHECK (("capacity" > 0)),
    CONSTRAINT "custom_break_slots_duration_minutes_check" CHECK (("duration_minutes" > 0)),
    CONSTRAINT "custom_break_slots_location_check" CHECK (("location" = ANY (ARRAY['Main Hub'::"text", 'NRC'::"text"]))),
    CONSTRAINT "custom_break_slots_shift_type_check" CHECK (("shift_type" = ANY (ARRAY['day'::"text", 'night'::"text", 'afternoon'::"text"])))
);


ALTER TABLE "public"."custom_break_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debug_logs" (
    "id" integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "message" "text",
    "data" "jsonb",
    "session_id" "text"
);


ALTER TABLE "public"."debug_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."debug_logs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."debug_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."debug_logs_id_seq" OWNED BY "public"."debug_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."defect_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "damage_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "field_name" "text",
    "old_value" "text",
    "new_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."defect_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."defect_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "damage_id" "uuid" NOT NULL,
    "submission_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "image_urls" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."defect_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_shunter_awards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "award_month" "date" NOT NULL,
    "period" "text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 50 NOT NULL,
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "awarded_by" "uuid",
    CONSTRAINT "monthly_shunter_awards_period_check" CHECK (("period" = ANY (ARRAY['day'::"text", 'night'::"text"])))
);


ALTER TABLE "public"."monthly_shunter_awards" OWNER TO "postgres";


COMMENT ON TABLE "public"."monthly_shunter_awards" IS 'Monthly Shunter of the Month awards – one Day and one Night winner per month for the whole company.';



COMMENT ON COLUMN "public"."monthly_shunter_awards"."user_id" IS 'Profile ID of the user who received the award.';



COMMENT ON COLUMN "public"."monthly_shunter_awards"."award_month" IS 'Month (stored as first day of the month) for which the award applies, e.g. 2025-11-01.';



COMMENT ON COLUMN "public"."monthly_shunter_awards"."period" IS 'Award period: day or night.';



COMMENT ON COLUMN "public"."monthly_shunter_awards"."amount" IS 'Award amount in GBP (default 50).';



COMMENT ON COLUMN "public"."monthly_shunter_awards"."awarded_at" IS 'Timestamp when this award record was created.';



COMMENT ON COLUMN "public"."monthly_shunter_awards"."awarded_by" IS 'Admin user (auth.users.id) who granted the award. Used only for logs, never exposed in UI.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "recipient_id" "uuid",
    "title" "text",
    "message" "text",
    "metadata" "jsonb",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'Stores notifications for users, especially admins.';



COMMENT ON COLUMN "public"."notifications"."type" IS 'Type of notification (e.g., shift_claimed, new_user_request).';



COMMENT ON COLUMN "public"."notifications"."recipient_id" IS 'ID of the user who should receive the notification (usually an admin).';



COMMENT ON COLUMN "public"."notifications"."metadata" IS 'JSONB field to store extra data related to the notification.';



CREATE TABLE IF NOT EXISTS "public"."page_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "page_path" "text" NOT NULL,
    "page_title" "text",
    "visited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_views" OWNER TO "postgres";


COMMENT ON TABLE "public"."page_views" IS 'Stores user page view activity with 7-day retention policy';



COMMENT ON COLUMN "public"."page_views"."user_id" IS 'Reference to the authenticated user';



COMMENT ON COLUMN "public"."page_views"."page_path" IS 'URL path that was visited (e.g., /admin/logs)';



COMMENT ON COLUMN "public"."page_views"."visited_at" IS 'Timestamp when the page was visited';



COMMENT ON COLUMN "public"."page_views"."session_id" IS 'Optional session identifier for grouping page views';



CREATE TABLE IF NOT EXISTS "public"."page_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "page_path" "text" NOT NULL,
    "page_title" "text",
    "visited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_id" "text",
    "user_agent" "text",
    "ip_address" "inet"
);


ALTER TABLE "public"."page_visits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precheck_check_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "tooltip" "text",
    "category" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "allow_na" boolean DEFAULT false NOT NULL,
    CONSTRAINT "precheck_check_items_category_check" CHECK (("category" = ANY (ARRAY['outside'::"text", 'inside'::"text"])))
);


ALTER TABLE "public"."precheck_check_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precheck_damage_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "damage_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "submission_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."precheck_damage_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precheck_damage_fixed_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "damage_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "submission_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."precheck_damage_fixed_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precheck_damages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "description" "text" NOT NULL,
    "location_on_tug" "text",
    "image_urls" "text"[] DEFAULT '{}'::"text"[],
    "severity" "text" DEFAULT 'minor'::"text" NOT NULL,
    "repair_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'check_item'::"text",
    "defect_number" "text",
    "reported_to_terberg_at" timestamp with time zone,
    "terberg_reference" "text",
    "vmu_notes" "text",
    "tug_id" "uuid",
    "item_key" "text",
    "last_reported_at" timestamp with time zone,
    CONSTRAINT "precheck_damages_location_on_tug_check" CHECK (("location_on_tug" = ANY (ARRAY['front'::"text", 'rear'::"text", 'left'::"text", 'right'::"text", 'top'::"text", 'interior'::"text"]))),
    CONSTRAINT "precheck_damages_repair_status_check" CHECK (("repair_status" = ANY (ARRAY['open'::"text", 'reported'::"text", 'awaiting_parts'::"text", 'in_progress'::"text", 'resolved'::"text"]))),
    CONSTRAINT "precheck_damages_severity_check" CHECK (("severity" = ANY (ARRAY['minor'::"text", 'major'::"text", 'critical'::"text"]))),
    CONSTRAINT "precheck_damages_source_check" CHECK (("source" = ANY (ARRAY['check_item'::"text", 'remarks'::"text", 'during_shift'::"text"])))
);


ALTER TABLE "public"."precheck_damages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precheck_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "item_category" "text" NOT NULL,
    "item_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "precheck_items_item_category_check" CHECK (("item_category" = ANY (ARRAY['perform'::"text", 'check'::"text"]))),
    CONSTRAINT "precheck_items_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'repair_needed'::"text", 'completed'::"text", 'na'::"text"])))
);


ALTER TABLE "public"."precheck_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precheck_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tug_id" "uuid" NOT NULL,
    "check_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "check_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "check_type" "text" DEFAULT 'pre_shift'::"text" NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "form_session_id" "text",
    CONSTRAINT "precheck_submissions_check_type_check" CHECK (("check_type" = ANY (ARRAY['pre_shift'::"text", 'during_shift'::"text"])))
);


ALTER TABLE "public"."precheck_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "shift_preference" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "profile_completed" boolean DEFAULT false,
    "role" character varying DEFAULT 'user'::character varying NOT NULL,
    "is_active" boolean DEFAULT true,
    "performance_score" integer DEFAULT 50,
    "custom_start_time" time without time zone,
    "custom_end_time" time without time zone,
    "preferred_location" "text",
    "max_daily_hours" integer,
    "unavailable_days" "text"[],
    "notes_for_admin" "text",
    "status" "text" DEFAULT 'active'::"text",
    "email" "text",
    "agency_id" "uuid",
    "account_status" "text" DEFAULT 'approved'::"text",
    "location" "text" DEFAULT 'Main Hub'::"text",
    "has_break_15" boolean DEFAULT false,
    "has_break_30" boolean DEFAULT false,
    "has_break_45" boolean DEFAULT false,
    "has_break_60" boolean DEFAULT false,
    "total_break_minutes" integer DEFAULT 0,
    "yard_system_id" "text",
    CONSTRAINT "profiles_location_check" CHECK (("location" = ANY (ARRAY['Main Hub'::"text", 'NRC'::"text"]))),
    CONSTRAINT "profiles_shift_preference_check" CHECK (("shift_preference" = ANY (ARRAY['day'::"text", 'afternoon'::"text", 'night'::"text"]))),
    CONSTRAINT "valid_account_status" CHECK (("account_status" = ANY (ARRAY['pending_approval'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_active" IS 'Indicates whether the user account is active or inactive';



COMMENT ON COLUMN "public"."profiles"."performance_score" IS 'Performance rating from 1 (poor) to 99 (excellent)';



COMMENT ON COLUMN "public"."profiles"."account_status" IS 'Tracks the approval status of a user account (pending_approval, approved, rejected)';



COMMENT ON COLUMN "public"."profiles"."yard_system_id" IS 'Unique ID from yard system (e.g., AG10, AK2024)';



CREATE TABLE IF NOT EXISTS "public"."rota_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slots" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."rota_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rota_week_baseline_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "baseline_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "location" "text" NOT NULL,
    "shift_type" "text" NOT NULL
);


ALTER TABLE "public"."rota_week_baseline_slots" OWNER TO "postgres";


COMMENT ON TABLE "public"."rota_week_baseline_slots" IS 'Assigned shifts captured in the week baseline; extra current slots are additional bookings.';



CREATE TABLE IF NOT EXISTS "public"."rota_week_baselines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_start" "date" NOT NULL,
    "source" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rota_week_baselines_source_check" CHECK (("source" = ANY (ARRAY['download'::"text", 'send'::"text", 'manual'::"text", 'late_send'::"text"])))
);


ALTER TABLE "public"."rota_week_baselines" OWNER TO "postgres";


COMMENT ON TABLE "public"."rota_week_baselines" IS 'One baseline per Saturday-start week: first download, send, or manual mark.';



CREATE TABLE IF NOT EXISTS "public"."scheduled_breaks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "date" "date" NOT NULL,
    "shift_type" "text" NOT NULL,
    "break_start_time" time without time zone NOT NULL,
    "break_duration_minutes" integer NOT NULL,
    "break_type" "text" DEFAULT 'standard'::"text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid",
    "capacity" integer DEFAULT 2,
    "std_slot_id" "text",
    "location" "text",
    CONSTRAINT "scheduled_breaks_break_type_check" CHECK (("break_type" = ANY (ARRAY['standard'::"text", 'break1'::"text", 'break2'::"text", 'night'::"text", 'afternoon'::"text", 'custom'::"text"]))),
    CONSTRAINT "scheduled_breaks_shift_type_check" CHECK (("shift_type" = ANY (ARRAY['day'::"text", 'afternoon'::"text", 'night'::"text"])))
);


ALTER TABLE "public"."scheduled_breaks" OWNER TO "postgres";


COMMENT ON TABLE "public"."scheduled_breaks" IS 'Stores break slot definitions and staff break assignments';



COMMENT ON COLUMN "public"."scheduled_breaks"."capacity" IS 'Maximum number of staff that can be assigned to this break slot';



COMMENT ON COLUMN "public"."scheduled_breaks"."std_slot_id" IS 'Identifier for standard slots (NULL for custom slots)';



CREATE TABLE IF NOT EXISTS "public"."scheduled_rota" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "date" "date" NOT NULL,
    "shift_type" "text" NOT NULL,
    "location" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "capacity" integer DEFAULT 1 NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_temp_user" boolean DEFAULT false,
    "temp_user_id" bigint,
    "task" "text",
    "status" "text",
    CONSTRAINT "scheduled_rota_capacity_check" CHECK (("capacity" > 0)),
    CONSTRAINT "scheduled_rota_shift_type_check" CHECK (("shift_type" = ANY (ARRAY['day'::"text", 'afternoon'::"text", 'night'::"text"])))
);


ALTER TABLE "public"."scheduled_rota" OWNER TO "postgres";


COMMENT ON COLUMN "public"."scheduled_rota"."status" IS 'Status of the shift. Values: "available" (for employee self-service), NULL (normal admin-assigned shift)';



CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slot_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "state" "public"."claim_state" DEFAULT 'assigned'::"public"."claim_state" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shift_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shunter_induction_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "title" "text" NOT NULL,
    "body_markdown" "text" DEFAULT ''::"text" NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shunter_induction_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shunter_performance" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "report_date" "date" NOT NULL,
    "number_of_moves" integer DEFAULT 0 NOT NULL,
    "avg_time_to_collect" "text" DEFAULT '0:00'::"text" NOT NULL,
    "avg_time_to_travel" "text" DEFAULT '0:00'::"text" NOT NULL,
    "number_of_full_locations" integer DEFAULT 0,
    "full_name_from_report" "text",
    "yard_system_id_from_report" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shunter_performance" OWNER TO "postgres";


COMMENT ON TABLE "public"."shunter_performance" IS 'Daily performance metrics for shunters';



COMMENT ON COLUMN "public"."shunter_performance"."report_date" IS 'Date of the performance report';



COMMENT ON COLUMN "public"."shunter_performance"."number_of_moves" IS 'Total moves (aggregated from all shifts)';



COMMENT ON COLUMN "public"."shunter_performance"."avg_time_to_collect" IS 'Weighted avg time to collect (M:SS format)';



COMMENT ON COLUMN "public"."shunter_performance"."avg_time_to_travel" IS 'Weighted avg time to travel (M:SS format)';



CREATE TABLE IF NOT EXISTS "public"."shunter_violations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shunter_violations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slot_configurations" (
    "id" "text" NOT NULL,
    "shift_type" "text" NOT NULL,
    "break_type" "text" NOT NULL,
    "start_time" "text" NOT NULL,
    "duration" integer NOT NULL,
    "capacity" integer DEFAULT 2 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "slot_configurations_shift_type_check" CHECK (("shift_type" = ANY (ARRAY['day'::"text", 'afternoon'::"text", 'night'::"text"])))
);


ALTER TABLE "public"."slot_configurations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "entity_type" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "entity_id" "uuid",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_activity_log_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['rota'::"text", 'breaks'::"text"])))
);


ALTER TABLE "public"."system_activity_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."system_activity_log" IS 'Append-only audit log for Rota Planner and Breaks changes. No UPDATE/DELETE policies.';



CREATE TABLE IF NOT EXISTS "public"."tug_tablets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tug_id" "uuid" NOT NULL,
    "serial_number" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tug_tablets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tugs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tug_number" "text" NOT NULL,
    "qr_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(12), 'hex'::"text") NOT NULL,
    "location_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "display_name" "text",
    "tug_tablets" "text",
    CONSTRAINT "tugs_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'maintenance'::"text"])))
);


ALTER TABLE "public"."tugs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_availability" WITH ("security_invoker"='true') AS
 SELECT "a"."id",
    "a"."user_id",
    "a"."date",
    "a"."status",
    "a"."comment",
    "a"."created_at",
    "a"."updated_at",
    "p"."first_name",
    "p"."last_name",
    "p"."shift_preference",
    "p"."avatar_url"
   FROM ("public"."availability" "a"
     LEFT JOIN "public"."profiles" "p" ON (("a"."user_id" = "p"."id")));


ALTER VIEW "public"."user_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_day_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_day_notes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."debug_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."debug_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_scheduled_rota_id_key" UNIQUE ("scheduled_rota_id");



ALTER TABLE ONLY "public"."availability"
    ADD CONSTRAINT "availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."break_slot_capacities"
    ADD CONSTRAINT "break_slot_capacities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_break_slots"
    ADD CONSTRAINT "custom_break_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debug_logs"
    ADD CONSTRAINT "debug_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defect_activity_log"
    ADD CONSTRAINT "defect_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defect_reports"
    ADD CONSTRAINT "defect_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_shunter_awards"
    ADD CONSTRAINT "monthly_shunter_awards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_views"
    ADD CONSTRAINT "page_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_visits"
    ADD CONSTRAINT "page_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precheck_check_items"
    ADD CONSTRAINT "precheck_check_items_item_key_key" UNIQUE ("item_key");



ALTER TABLE ONLY "public"."precheck_check_items"
    ADD CONSTRAINT "precheck_check_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precheck_damage_confirmations"
    ADD CONSTRAINT "precheck_damage_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precheck_damage_fixed_confirmations"
    ADD CONSTRAINT "precheck_damage_fixed_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precheck_damages"
    ADD CONSTRAINT "precheck_damages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precheck_items"
    ADD CONSTRAINT "precheck_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precheck_submissions"
    ADD CONSTRAINT "precheck_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_yard_system_id_key" UNIQUE ("yard_system_id");



ALTER TABLE ONLY "public"."rota_templates"
    ADD CONSTRAINT "rota_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rota_week_baseline_slots"
    ADD CONSTRAINT "rota_week_baseline_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rota_week_baseline_slots"
    ADD CONSTRAINT "rota_week_baseline_slots_unique_assignment" UNIQUE ("baseline_id", "user_id", "date", "start_time", "end_time", "location");



ALTER TABLE ONLY "public"."rota_week_baselines"
    ADD CONSTRAINT "rota_week_baselines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rota_week_baselines"
    ADD CONSTRAINT "rota_week_baselines_week_start_key" UNIQUE ("week_start");



ALTER TABLE ONLY "public"."scheduled_breaks"
    ADD CONSTRAINT "scheduled_breaks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_rota"
    ADD CONSTRAINT "scheduled_rota_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_claims"
    ADD CONSTRAINT "shift_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shunter_induction_sections"
    ADD CONSTRAINT "shunter_induction_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shunter_performance"
    ADD CONSTRAINT "shunter_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shunter_violations"
    ADD CONSTRAINT "shunter_violations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slot_configurations"
    ADD CONSTRAINT "slot_configurations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_activity_log"
    ADD CONSTRAINT "system_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tug_tablets"
    ADD CONSTRAINT "tug_tablets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tug_tablets"
    ADD CONSTRAINT "tug_tablets_tug_id_key" UNIQUE ("tug_id");



ALTER TABLE ONLY "public"."tugs"
    ADD CONSTRAINT "tugs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tugs"
    ADD CONSTRAINT "tugs_qr_token_key" UNIQUE ("qr_token");



ALTER TABLE ONLY "public"."tugs"
    ADD CONSTRAINT "tugs_tug_number_key" UNIQUE ("tug_number");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "unique_agency_email" UNIQUE ("email");



ALTER TABLE ONLY "public"."shunter_performance"
    ADD CONSTRAINT "unique_user_report_date" UNIQUE ("user_id", "report_date");



ALTER TABLE ONLY "public"."user_day_notes"
    ADD CONSTRAINT "user_day_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_day_notes"
    ADD CONSTRAINT "user_day_notes_user_id_date_key" UNIQUE ("user_id", "date");



CREATE INDEX "idx_attendance_recorded_at" ON "public"."attendance" USING "btree" ("recorded_at");



CREATE INDEX "idx_attendance_scheduled_rota_id" ON "public"."attendance" USING "btree" ("scheduled_rota_id");



CREATE INDEX "idx_availability_user_date" ON "public"."availability" USING "btree" ("user_id", "date");



CREATE INDEX "idx_check_items_active" ON "public"."precheck_check_items" USING "btree" ("is_active");



CREATE INDEX "idx_check_items_category" ON "public"."precheck_check_items" USING "btree" ("category");



CREATE INDEX "idx_defect_activity_damage_date" ON "public"."defect_activity_log" USING "btree" ("damage_id", "created_at" DESC);



CREATE INDEX "idx_defect_reports_damage_date" ON "public"."defect_reports" USING "btree" ("damage_id", "created_at" DESC);



CREATE INDEX "idx_monthly_shunter_awards_awarded_by" ON "public"."monthly_shunter_awards" USING "btree" ("awarded_by");



CREATE INDEX "idx_monthly_shunter_awards_user_id" ON "public"."monthly_shunter_awards" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_recipient_id" ON "public"."notifications" USING "btree" ("recipient_id");



CREATE INDEX "idx_page_views_user_id" ON "public"."page_views" USING "btree" ("user_id");



CREATE INDEX "idx_page_visits_user_id" ON "public"."page_visits" USING "btree" ("user_id");



CREATE INDEX "idx_precheck_damage_confirmations_damage_id" ON "public"."precheck_damage_confirmations" USING "btree" ("damage_id");



CREATE INDEX "idx_precheck_damage_fixed_confirmations_damage_id" ON "public"."precheck_damage_fixed_confirmations" USING "btree" ("damage_id");



CREATE INDEX "idx_precheck_damages_last_reported_at" ON "public"."precheck_damages" USING "btree" ("last_reported_at" DESC);



CREATE INDEX "idx_precheck_damages_repair_status" ON "public"."precheck_damages" USING "btree" ("repair_status");



CREATE INDEX "idx_precheck_damages_submission" ON "public"."precheck_damages" USING "btree" ("submission_id");



CREATE INDEX "idx_precheck_damages_tug_item" ON "public"."precheck_damages" USING "btree" ("tug_id", "item_key");



CREATE INDEX "idx_precheck_items_submission" ON "public"."precheck_items" USING "btree" ("submission_id");



CREATE INDEX "idx_precheck_submissions_check_date" ON "public"."precheck_submissions" USING "btree" ("check_date");



CREATE UNIQUE INDEX "idx_precheck_submissions_form_session_id" ON "public"."precheck_submissions" USING "btree" ("form_session_id") WHERE ("form_session_id" IS NOT NULL);



CREATE INDEX "idx_precheck_submissions_tug_date" ON "public"."precheck_submissions" USING "btree" ("tug_id", "check_date");



CREATE INDEX "idx_precheck_submissions_user_date" ON "public"."precheck_submissions" USING "btree" ("user_id", "check_date");



CREATE INDEX "idx_profiles_agency_id" ON "public"."profiles" USING "btree" ("agency_id");



CREATE INDEX "idx_rota_week_baseline_slots_baseline_id" ON "public"."rota_week_baseline_slots" USING "btree" ("baseline_id");



CREATE INDEX "idx_rota_week_baseline_slots_user_date" ON "public"."rota_week_baseline_slots" USING "btree" ("user_id", "date");



CREATE INDEX "idx_scheduled_breaks_assigned_by" ON "public"."scheduled_breaks" USING "btree" ("assigned_by");



CREATE INDEX "idx_scheduled_breaks_date_shift" ON "public"."scheduled_breaks" USING "btree" ("date", "shift_type");



CREATE INDEX "idx_scheduled_breaks_date_shift_location" ON "public"."scheduled_breaks" USING "btree" ("date", "shift_type", "location");



CREATE INDEX "idx_scheduled_breaks_user_date" ON "public"."scheduled_breaks" USING "btree" ("user_id", "date");



CREATE INDEX "idx_scheduled_rota_user_id_date" ON "public"."scheduled_rota" USING "btree" ("user_id", "date") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_shift_claims_slot_id" ON "public"."shift_claims" USING "btree" ("slot_id");



CREATE INDEX "idx_shift_claims_user_id" ON "public"."shift_claims" USING "btree" ("user_id");



CREATE INDEX "idx_shunter_induction_sections_sort" ON "public"."shunter_induction_sections" USING "btree" ("sort_order", "id");



CREATE INDEX "idx_shunter_performance_report_date" ON "public"."shunter_performance" USING "btree" ("report_date");



CREATE INDEX "idx_shunter_violations_created_at" ON "public"."shunter_violations" USING "btree" ("created_at");



CREATE INDEX "idx_shunter_violations_user_id" ON "public"."shunter_violations" USING "btree" ("user_id");



CREATE INDEX "idx_system_activity_entity_created" ON "public"."system_activity_log" USING "btree" ("entity_type", "created_at" DESC);



CREATE INDEX "idx_system_activity_user_created" ON "public"."system_activity_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_tug_tablets_tug_id" ON "public"."tug_tablets" USING "btree" ("tug_id");



CREATE INDEX "idx_tugs_location_id" ON "public"."tugs" USING "btree" ("location_id");



CREATE INDEX "idx_tugs_qr_token" ON "public"."tugs" USING "btree" ("qr_token");



CREATE INDEX "idx_tugs_status" ON "public"."tugs" USING "btree" ("status");



CREATE UNIQUE INDEX "monthly_shunter_awards_unique_month_period" ON "public"."monthly_shunter_awards" USING "btree" ("award_month", "period");



CREATE INDEX "scheduled_rota_date_idx" ON "public"."scheduled_rota" USING "btree" ("date");



CREATE INDEX "scheduled_rota_user_id_idx" ON "public"."scheduled_rota" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "auto_cleanup_page_views" AFTER INSERT ON "public"."page_views" FOR EACH STATEMENT EXECUTE FUNCTION "public"."trigger_cleanup_page_views"();



CREATE OR REPLACE TRIGGER "check_items_updated_at" BEFORE UPDATE ON "public"."precheck_check_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_check_items_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_availability" BEFORE UPDATE ON "public"."availability" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "set_timestamp_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "set_timestamp_shunter_performance" BEFORE UPDATE ON "public"."shunter_performance" FOR EACH ROW EXECUTE FUNCTION "public"."update_shunter_performance_timestamp"();



CREATE OR REPLACE TRIGGER "trg_defect_reports_bump_last_reported_at" AFTER INSERT ON "public"."defect_reports" FOR EACH ROW EXECUTE FUNCTION "public"."bump_damage_last_reported_at"();



CREATE OR REPLACE TRIGGER "trg_precheck_damages_grouping_fields" BEFORE INSERT OR UPDATE OF "submission_id", "item_id", "tug_id", "item_key", "last_reported_at" ON "public"."precheck_damages" FOR EACH ROW EXECUTE FUNCTION "public"."set_precheck_damage_grouping_fields"();



CREATE OR REPLACE TRIGGER "trg_rota_week_baselines_updated_at" BEFORE UPDATE ON "public"."rota_week_baselines" FOR EACH ROW EXECUTE FUNCTION "public"."update_rota_week_baselines_updated_at"();



CREATE OR REPLACE TRIGGER "trg_scheduled_rota_consecutive_work_days" BEFORE INSERT OR UPDATE OF "user_id", "date" ON "public"."scheduled_rota" FOR EACH ROW EXECUTE FUNCTION "public"."scheduled_rota_enforce_consecutive_work_days"();



CREATE OR REPLACE TRIGGER "trg_shunter_induction_sections_updated_at" BEFORE UPDATE ON "public"."shunter_induction_sections" FOR EACH ROW EXECUTE FUNCTION "public"."update_shunter_induction_sections_updated_at"();



CREATE OR REPLACE TRIGGER "tugs_updated_at" BEFORE UPDATE ON "public"."tugs" FOR EACH ROW EXECUTE FUNCTION "public"."update_tugs_updated_at"();



CREATE OR REPLACE TRIGGER "update_agencies_updated_at" BEFORE UPDATE ON "public"."agencies" FOR EACH ROW EXECUTE FUNCTION "public"."update_agencies_updated_at"();



CREATE OR REPLACE TRIGGER "update_settings_updated_at" BEFORE UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_settings_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_day_notes_updated_at" BEFORE UPDATE ON "public"."user_day_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_day_notes_updated_at"();



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_scheduled_rota_id_fkey" FOREIGN KEY ("scheduled_rota_id") REFERENCES "public"."scheduled_rota"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability"
    ADD CONSTRAINT "availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defect_activity_log"
    ADD CONSTRAINT "defect_activity_log_damage_id_fkey" FOREIGN KEY ("damage_id") REFERENCES "public"."precheck_damages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defect_activity_log"
    ADD CONSTRAINT "defect_activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."defect_reports"
    ADD CONSTRAINT "defect_reports_damage_id_fkey" FOREIGN KEY ("damage_id") REFERENCES "public"."precheck_damages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defect_reports"
    ADD CONSTRAINT "defect_reports_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."precheck_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."defect_reports"
    ADD CONSTRAINT "defect_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_shunter_awards"
    ADD CONSTRAINT "monthly_shunter_awards_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_shunter_awards"
    ADD CONSTRAINT "monthly_shunter_awards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."page_views"
    ADD CONSTRAINT "page_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_visits"
    ADD CONSTRAINT "page_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_damage_confirmations"
    ADD CONSTRAINT "precheck_damage_confirmations_damage_id_fkey" FOREIGN KEY ("damage_id") REFERENCES "public"."precheck_damages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_damage_confirmations"
    ADD CONSTRAINT "precheck_damage_confirmations_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."precheck_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precheck_damage_confirmations"
    ADD CONSTRAINT "precheck_damage_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_damage_fixed_confirmations"
    ADD CONSTRAINT "precheck_damage_fixed_confirmations_damage_id_fkey" FOREIGN KEY ("damage_id") REFERENCES "public"."precheck_damages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_damage_fixed_confirmations"
    ADD CONSTRAINT "precheck_damage_fixed_confirmations_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."precheck_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precheck_damage_fixed_confirmations"
    ADD CONSTRAINT "precheck_damage_fixed_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_damages"
    ADD CONSTRAINT "precheck_damages_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."precheck_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precheck_damages"
    ADD CONSTRAINT "precheck_damages_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precheck_damages"
    ADD CONSTRAINT "precheck_damages_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."precheck_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_damages"
    ADD CONSTRAINT "precheck_damages_tug_id_fkey" FOREIGN KEY ("tug_id") REFERENCES "public"."tugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_items"
    ADD CONSTRAINT "precheck_items_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."precheck_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_submissions"
    ADD CONSTRAINT "precheck_submissions_tug_id_fkey" FOREIGN KEY ("tug_id") REFERENCES "public"."tugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precheck_submissions"
    ADD CONSTRAINT "precheck_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rota_week_baseline_slots"
    ADD CONSTRAINT "rota_week_baseline_slots_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "public"."rota_week_baselines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rota_week_baseline_slots"
    ADD CONSTRAINT "rota_week_baseline_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rota_week_baselines"
    ADD CONSTRAINT "rota_week_baselines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_breaks"
    ADD CONSTRAINT "scheduled_breaks_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_breaks"
    ADD CONSTRAINT "scheduled_breaks_location_fkey" FOREIGN KEY ("location") REFERENCES "public"."locations"("name") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."scheduled_breaks"
    ADD CONSTRAINT "scheduled_breaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_rota"
    ADD CONSTRAINT "scheduled_rota_location_fkey" FOREIGN KEY ("location") REFERENCES "public"."locations"("name") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."scheduled_rota"
    ADD CONSTRAINT "scheduled_rota_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shift_claims"
    ADD CONSTRAINT "shift_claims_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."scheduled_rota"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_claims"
    ADD CONSTRAINT "shift_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."shunter_performance"
    ADD CONSTRAINT "shunter_performance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shunter_violations"
    ADD CONSTRAINT "shunter_violations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shunter_violations"
    ADD CONSTRAINT "shunter_violations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_activity_log"
    ADD CONSTRAINT "system_activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tug_tablets"
    ADD CONSTRAINT "tug_tablets_tug_id_fkey" FOREIGN KEY ("tug_id") REFERENCES "public"."tugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tugs"
    ADD CONSTRAINT "tugs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_day_notes"
    ADD CONSTRAINT "user_day_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Only admins can access debug_logs" ON "public"."debug_logs" TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



ALTER TABLE "public"."agencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agencies_delete" ON "public"."agencies" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "agencies_insert" ON "public"."agencies" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "agencies_select" ON "public"."agencies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "agencies_update" ON "public"."agencies" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_delete_admin" ON "public"."attendance" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "attendance_insert_admin" ON "public"."attendance" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "attendance_select_authenticated" ON "public"."attendance" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "attendance_update_admin" ON "public"."attendance" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "availability_delete" ON "public"."availability" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "availability_insert" ON "public"."availability" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



CREATE POLICY "availability_select" ON "public"."availability" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "availability_update" ON "public"."availability" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"())) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



ALTER TABLE "public"."break_slot_capacities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "break_slot_capacities_delete" ON "public"."break_slot_capacities" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_manager"());



CREATE POLICY "break_slot_capacities_insert" ON "public"."break_slot_capacities" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_manager"());



CREATE POLICY "break_slot_capacities_select" ON "public"."break_slot_capacities" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "break_slot_capacities_update" ON "public"."break_slot_capacities" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_manager"()) WITH CHECK ("public"."is_admin_or_manager"());



CREATE POLICY "check_items_delete" ON "public"."precheck_check_items" FOR DELETE TO "authenticated" USING ("public"."is_admin_manager_or_vmu"());



CREATE POLICY "check_items_insert" ON "public"."precheck_check_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_manager_or_vmu"());



CREATE POLICY "check_items_select_all" ON "public"."precheck_check_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "check_items_update" ON "public"."precheck_check_items" FOR UPDATE TO "authenticated" USING ("public"."is_admin_manager_or_vmu"()) WITH CHECK ("public"."is_admin_manager_or_vmu"());



ALTER TABLE "public"."custom_break_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "custom_break_slots_delete" ON "public"."custom_break_slots" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_manager"());



CREATE POLICY "custom_break_slots_insert" ON "public"."custom_break_slots" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_manager"());



CREATE POLICY "custom_break_slots_select" ON "public"."custom_break_slots" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "custom_break_slots_update" ON "public"."custom_break_slots" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_manager"()) WITH CHECK ("public"."is_admin_or_manager"());



ALTER TABLE "public"."debug_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."defect_activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "defect_activity_log_insert" ON "public"."defect_activity_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_manager_or_vmu"());



CREATE POLICY "defect_activity_log_select" ON "public"."defect_activity_log" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."defect_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "defect_reports_insert" ON "public"."defect_reports" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin_manager_or_vmu"() AND ("user_id" = "auth"."uid"())) OR (("user_id" = "auth"."uid"()) AND ("submission_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."precheck_submissions" "s"
  WHERE (("s"."id" = "defect_reports"."submission_id") AND ("s"."user_id" = "auth"."uid"())))))));



CREATE POLICY "defect_reports_select" ON "public"."defect_reports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "defect_reports_update_vmu" ON "public"."defect_reports" FOR UPDATE TO "authenticated" USING ("public"."is_admin_manager_or_vmu"()) WITH CHECK ("public"."is_admin_manager_or_vmu"());



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_delete" ON "public"."locations" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "locations_insert" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "locations_select" ON "public"."locations" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "public"."is_admin"()));



CREATE POLICY "locations_select_all" ON "public"."locations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "locations_update" ON "public"."locations" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."monthly_shunter_awards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "monthly_shunter_awards_delete" ON "public"."monthly_shunter_awards" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "monthly_shunter_awards_insert" ON "public"."monthly_shunter_awards" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "monthly_shunter_awards_select" ON "public"."monthly_shunter_awards" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "monthly_shunter_awards_update" ON "public"."monthly_shunter_awards" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "recipient_id"));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "recipient_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "recipient_id"));



ALTER TABLE "public"."page_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_views_insert" ON "public"."page_views" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "page_views_select" ON "public"."page_views" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."page_visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_visits_insert" ON "public"."page_visits" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "page_visits_select" ON "public"."page_visits" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."precheck_check_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."precheck_damage_confirmations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precheck_damage_confirmations_insert" ON "public"."precheck_damage_confirmations" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "precheck_damage_confirmations_select" ON "public"."precheck_damage_confirmations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."precheck_damage_fixed_confirmations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precheck_damage_fixed_confirmations_select" ON "public"."precheck_damage_fixed_confirmations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."precheck_damages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precheck_damages_insert" ON "public"."precheck_damages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."precheck_submissions"
  WHERE (("precheck_submissions"."id" = "precheck_damages"."submission_id") AND ("precheck_submissions"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "precheck_damages_select" ON "public"."precheck_damages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "precheck_damages_update" ON "public"."precheck_damages" FOR UPDATE TO "authenticated" USING ("public"."is_admin_manager_or_vmu"()) WITH CHECK ("public"."is_admin_manager_or_vmu"());



ALTER TABLE "public"."precheck_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precheck_items_insert" ON "public"."precheck_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."precheck_submissions"
  WHERE (("precheck_submissions"."id" = "precheck_items"."submission_id") AND ("precheck_submissions"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "precheck_items_select" ON "public"."precheck_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."precheck_submissions" "ps"
  WHERE ("ps"."id" = "precheck_items"."submission_id"))));



ALTER TABLE "public"."precheck_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precheck_submissions_insert" ON "public"."precheck_submissions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "precheck_submissions_select" ON "public"."precheck_submissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "precheck_submissions_select_all_authenticated" ON "public"."precheck_submissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "id") OR "public"."is_admin"())) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") OR "public"."is_admin"()));



ALTER TABLE "public"."rota_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rota_templates_admin" ON "public"."rota_templates" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."rota_week_baseline_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rota_week_baseline_slots_delete" ON "public"."rota_week_baseline_slots" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "rota_week_baseline_slots_insert" ON "public"."rota_week_baseline_slots" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "rota_week_baseline_slots_select" ON "public"."rota_week_baseline_slots" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "rota_week_baseline_slots_update" ON "public"."rota_week_baseline_slots" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."rota_week_baselines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rota_week_baselines_delete" ON "public"."rota_week_baselines" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "rota_week_baselines_insert" ON "public"."rota_week_baselines" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "rota_week_baselines_select" ON "public"."rota_week_baselines" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "rota_week_baselines_update" ON "public"."rota_week_baselines" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."scheduled_breaks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scheduled_breaks_delete" ON "public"."scheduled_breaks" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



CREATE POLICY "scheduled_breaks_insert" ON "public"."scheduled_breaks" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



CREATE POLICY "scheduled_breaks_select" ON "public"."scheduled_breaks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "scheduled_breaks_update" ON "public"."scheduled_breaks" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"())) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "public"."is_admin"()));



ALTER TABLE "public"."scheduled_rota" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scheduled_rota_delete" ON "public"."scheduled_rota" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "scheduled_rota_insert" ON "public"."scheduled_rota" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "scheduled_rota_select" ON "public"."scheduled_rota" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "scheduled_rota_update" ON "public"."scheduled_rota" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settings_delete" ON "public"."settings" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "settings_insert" ON "public"."settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "settings_select" ON "public"."settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "settings_update" ON "public"."settings" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."shift_claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shift_claims_delete" ON "public"."shift_claims" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "shift_claims_insert" ON "public"."shift_claims" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



CREATE POLICY "shift_claims_select" ON "public"."shift_claims" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "shift_claims_update" ON "public"."shift_claims" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"())) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



ALTER TABLE "public"."shunter_induction_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shunter_induction_sections_delete" ON "public"."shunter_induction_sections" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "shunter_induction_sections_insert" ON "public"."shunter_induction_sections" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "shunter_induction_sections_select" ON "public"."shunter_induction_sections" FOR SELECT TO "authenticated" USING ((("is_published" = true) OR "public"."is_admin"()));



CREATE POLICY "shunter_induction_sections_update" ON "public"."shunter_induction_sections" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."shunter_performance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shunter_performance_delete" ON "public"."shunter_performance" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "shunter_performance_insert" ON "public"."shunter_performance" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "shunter_performance_select" ON "public"."shunter_performance" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "shunter_performance_update" ON "public"."shunter_performance" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."shunter_violations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shunter_violations_delete_admin" ON "public"."shunter_violations" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "shunter_violations_insert_admin" ON "public"."shunter_violations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "shunter_violations_select" ON "public"."shunter_violations" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."is_transport_manager"() OR ("user_id" = "auth"."uid"())));



CREATE POLICY "shunter_violations_update_admin" ON "public"."shunter_violations" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."slot_configurations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slot_configurations_delete" ON "public"."slot_configurations" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "slot_configurations_insert" ON "public"."slot_configurations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "slot_configurations_select" ON "public"."slot_configurations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "slot_configurations_update" ON "public"."slot_configurations" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."system_activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_activity_log_insert" ON "public"."system_activity_log" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "system_activity_log_select" ON "public"."system_activity_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."tug_tablets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tug_tablets_delete_admin" ON "public"."tug_tablets" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "tug_tablets_insert_admin" ON "public"."tug_tablets" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "tug_tablets_select_all" ON "public"."tug_tablets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tug_tablets_update_admin" ON "public"."tug_tablets" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."tugs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tugs_delete_admin_vmu" ON "public"."tugs" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_vmu"());



CREATE POLICY "tugs_insert_admin_vmu" ON "public"."tugs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_vmu"());



CREATE POLICY "tugs_select_all" ON "public"."tugs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tugs_update_admin_vmu" ON "public"."tugs" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_vmu"()) WITH CHECK ("public"."is_admin_or_vmu"());



ALTER TABLE "public"."user_day_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_day_notes_delete" ON "public"."user_day_notes" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_day_notes_insert" ON "public"."user_day_notes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_day_notes_select" ON "public"."user_day_notes" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



CREATE POLICY "user_day_notes_update" ON "public"."user_day_notes" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





















































































































































































































GRANT ALL ON FUNCTION "public"."bump_damage_last_reported_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_damage_last_reported_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_damage_last_reported_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_released_shift"("p_slot_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_released_shift"("p_slot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_released_shift"("p_slot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_released_shift"("p_slot_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_shift"("p_primary_slot_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_shift"("p_primary_slot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_shift"("p_primary_slot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_shift"("p_primary_slot_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_shift"("shift_id" "uuid", "user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_shift"("shift_id" "uuid", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_shift"("shift_id" "uuid", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_page_views"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_page_views"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_page_views"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_pending_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_pending_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_pending_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_temp_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_temp_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_temp_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_temp_user"("first_name" "text", "last_name" "text", "shift_preference" "text", "user_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_users_by_timerange"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_users_by_timerange"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_users_by_timerange"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_profiles_with_emails"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_profiles_with_emails"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_profiles_with_emails"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_unique_tasks"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_unique_tasks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_unique_tasks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users_login_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users_login_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users_login_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_complete_profiles_with_emails"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_complete_profiles_with_emails"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_complete_profiles_with_emails"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_detailed_login_history"("days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_detailed_login_history"("days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_detailed_login_history"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_full_activity_logs"("days_back" integer, "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_full_activity_logs"("days_back" integer, "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_full_activity_logs"("days_back" integer, "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inactive_users_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_inactive_users_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inactive_users_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_login_time_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_login_time_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_login_time_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_user_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_user_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_user_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_active_users"("days_back" integer, "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_active_users"("days_back" integer, "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_active_users"("days_back" integer, "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_visited_pages"("days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_visited_pages"("days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_visited_pages"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_page_view_stats"("days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_page_view_stats"("days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_page_view_stats"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_page_visits_by_day"("days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_page_visits_by_day"("days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_page_visits_by_day"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_page_visits_by_hour"("days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_page_visits_by_hour"("days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_page_visits_by_hour"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pending_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_profiles_with_emails"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_profiles_with_emails"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profiles_with_emails"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_activity_log"("days_back" integer, "limit_count" integer, "entity_type_filter" "text", "user_id_filter" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_activity_log"("days_back" integer, "limit_count" integer, "entity_type_filter" "text", "user_id_filter" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_activity_log"("days_back" integer, "limit_count" integer, "entity_type_filter" "text", "user_id_filter" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tug_assignments_for_date"("target_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tug_assignments_for_date"("target_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tug_assignments_for_date"("target_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_activity_logs"("target_user_id" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_activity_logs"("target_user_id" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_activity_logs"("target_user_id" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_activity_summary"("days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_activity_summary"("days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_activity_summary"("days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_auth_details"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_auth_details"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_auth_details"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_last_login"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_last_login"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_last_login"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_page_visits"("target_user_id" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_page_visits"("target_user_id" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_page_visits"("target_user_id" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_manager_or_vmu"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_manager_or_vmu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_manager_or_vmu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_or_vmu"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_vmu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_vmu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_transport_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_transport_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_transport_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_vmu"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_vmu"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_vmu"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_precheck_damage_resolved"("damage_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_precheck_damage_resolved"("damage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_precheck_damage_resolved"("damage_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_defects"("source_damage_id" "uuid", "target_damage_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_defects"("source_damage_id" "uuid", "target_damage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_defects"("source_damage_id" "uuid", "target_damage_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_precheck_damage_fixed_confirmation"("damage_id" "uuid", "submission_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_precheck_damage_fixed_confirmation"("damage_id" "uuid", "submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_precheck_damage_fixed_confirmation"("damage_id" "uuid", "submission_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_shift"("p_slot_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_shift"("p_slot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_shift"("p_slot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_shift"("p_slot_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."scheduled_rota_enforce_consecutive_work_days"() TO "anon";
GRANT ALL ON FUNCTION "public"."scheduled_rota_enforce_consecutive_work_days"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."scheduled_rota_enforce_consecutive_work_days"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_precheck_damage_grouping_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_precheck_damage_grouping_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_precheck_damage_grouping_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_cleanup_page_views"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_page_views"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_page_views"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_agencies_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_agencies_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_agencies_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_check_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_check_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_check_items_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rota_week_baselines_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rota_week_baselines_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rota_week_baselines_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_shunter_induction_sections_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_shunter_induction_sections_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_shunter_induction_sections_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_shunter_performance_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_shunter_performance_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_shunter_performance_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tugs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tugs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tugs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_day_notes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_day_notes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_day_notes_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_user_profile"("user_id" "uuid", "first_name" "text", "last_name" "text", "shift_preference" "text", "avatar_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_user_profile"("user_id" "uuid", "first_name" "text", "last_name" "text", "shift_preference" "text", "avatar_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_profile"("user_id" "uuid", "first_name" "text", "last_name" "text", "shift_preference" "text", "avatar_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_profile"("user_id" "uuid", "first_name" "text", "last_name" "text", "shift_preference" "text", "avatar_url" "text") TO "service_role";



























GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agencies" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agencies" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."agencies" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_config" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_config" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_config" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."attendance" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."attendance" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."attendance" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."availability" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."availability" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."availability" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."break_slot_capacities" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."break_slot_capacities" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."break_slot_capacities" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."custom_break_slots" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."custom_break_slots" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."custom_break_slots" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."debug_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."debug_logs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."debug_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."debug_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."debug_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."debug_logs_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."defect_activity_log" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."defect_activity_log" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."defect_activity_log" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."defect_reports" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."defect_reports" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."defect_reports" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."locations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."locations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."locations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."monthly_shunter_awards" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."monthly_shunter_awards" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."monthly_shunter_awards" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notifications" TO "service_role";
GRANT INSERT ON TABLE "public"."notifications" TO "supabase_admin";



GRANT UPDATE("is_read") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("read_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."page_views" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."page_views" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."page_views" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."page_visits" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."page_visits" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."page_visits" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_check_items" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_check_items" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_check_items" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damage_confirmations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damage_confirmations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damage_confirmations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damage_fixed_confirmations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damage_fixed_confirmations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damage_fixed_confirmations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damages" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damages" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_damages" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_items" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_items" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_items" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_submissions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_submissions" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."precheck_submissions" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_templates" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_templates" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_templates" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_week_baseline_slots" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_week_baseline_slots" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_week_baseline_slots" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_week_baselines" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_week_baselines" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."rota_week_baselines" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scheduled_breaks" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scheduled_breaks" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scheduled_breaks" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scheduled_rota" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scheduled_rota" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scheduled_rota" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."settings" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."settings" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."settings" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shift_claims" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shift_claims" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shift_claims" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_induction_sections" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_induction_sections" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_induction_sections" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_performance" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_performance" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_performance" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_violations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_violations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."shunter_violations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."slot_configurations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."slot_configurations" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."slot_configurations" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_activity_log" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_activity_log" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."system_activity_log" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tug_tablets" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tug_tablets" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tug_tablets" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tugs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tugs" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tugs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_availability" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_availability" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_availability" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_day_notes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_day_notes" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_day_notes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO "service_role";































