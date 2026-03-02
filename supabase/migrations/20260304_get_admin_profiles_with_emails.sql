-- RPC for admin: profiles with last_activity_at (page_visits + precheck_submissions + defect_activity_log) and agency name. No email.
-- Must DROP first when changing return type (PostgreSQL does not allow REPLACE to change signature).
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
    preferred_location text,
    agency_id uuid,
    agency_name text,
    last_activity_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.get_admin_profiles_with_emails() TO authenticated;
