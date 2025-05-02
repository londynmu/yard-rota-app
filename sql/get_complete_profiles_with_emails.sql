-- Updated RPC function to include all profile fields including Rota Planner preferences
-- This function needs to be run in the Supabase SQL Editor

-- First, drop the existing function if it exists
DROP FUNCTION IF EXISTS get_complete_profiles_with_emails();

-- Create the complete function that returns all profile fields
CREATE OR REPLACE FUNCTION get_complete_profiles_with_emails()
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    shift_preference TEXT,
    is_active BOOLEAN,
    performance_score INTEGER,
    email VARCHAR,
    custom_start_time TIME,
    custom_end_time TIME,
    preferred_location TEXT,
    max_daily_hours INTEGER,
    unavailable_days TEXT[],
    notes_for_admin TEXT,
    role TEXT,
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
        profiles p
    JOIN 
        auth.users au ON p.id = au.id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_complete_profiles_with_emails() TO authenticated; 