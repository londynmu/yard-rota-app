-- Fix for the ambiguous column reference in the get_profiles_with_emails function
-- This function needs to be run in the Supabase SQL Editor

-- First, drop the existing function
DROP FUNCTION IF EXISTS get_profiles_with_emails();

-- Create the updated function with explicitly qualified column references
CREATE OR REPLACE FUNCTION get_profiles_with_emails()
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    shift_preference TEXT,
    is_active BOOLEAN,
    performance_score INTEGER,
    email VARCHAR
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
        au.email
    FROM 
        profiles p
    JOIN 
        -- Use table aliases in the JOIN to avoid ambiguity
        auth.users au ON p.id = au.id;
END;
$$ LANGUAGE plpgsql; 