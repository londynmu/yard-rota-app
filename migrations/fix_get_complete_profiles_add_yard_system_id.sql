-- ============================================
-- Fix get_complete_profiles_with_emails to include yard_system_id
-- ============================================
-- This migration adds yard_system_id to the RPC function
-- Execute this in Supabase SQL Editor
-- ============================================

DROP FUNCTION IF EXISTS get_complete_profiles_with_emails();

CREATE OR REPLACE FUNCTION get_complete_profiles_with_emails()
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    shift_preference TEXT,
    is_active BOOLEAN,
    performance_score INTEGER,
    yard_system_id TEXT,  -- Added for performance tracking
    email VARCHAR,
    custom_start_time TIME,
    custom_end_time TIME,
    preferred_location TEXT,
    max_daily_hours INTEGER,
    unavailable_days TEXT[],
    notes_for_admin TEXT,
    role VARCHAR,
    agency_id UUID,
    agency_name TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) SECURITY DEFINER
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
        p.yard_system_id,  -- Added field
        au.email,
        p.custom_start_time,
        p.custom_end_time,
        p.preferred_location,
        p.max_daily_hours,
        p.unavailable_days,
        p.notes_for_admin,
        p.role,
        p.agency_id,
        a.name as agency_name,
        p.created_at,
        p.updated_at
    FROM 
        public.profiles p
    JOIN 
        auth.users au ON p.id = au.id
    LEFT JOIN
        public.agencies a ON p.agency_id = a.id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_complete_profiles_with_emails() TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully updated get_complete_profiles_with_emails() to include yard_system_id';
END $$;










