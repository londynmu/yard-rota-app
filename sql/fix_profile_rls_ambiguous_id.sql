-- Fix for RLS policies and ambiguous column reference in RPC function
-- Run this in the Supabase SQL Editor

-- First, ensure admin RLS policies exist (same as before)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles') THEN
        CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can update all profiles') THEN
        CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can insert all profiles') THEN
        CREATE POLICY "Admins can insert all profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can delete all profiles') THEN
        CREATE POLICY "Admins can delete all profiles" ON public.profiles FOR DELETE USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
    END IF;
END $$;

-- Update the get_complete_profiles_with_emails function to fix ambiguity
DROP FUNCTION IF EXISTS get_complete_profiles_with_emails();

-- Create the final improved function with explicit qualification
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
    role VARCHAR,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) SECURITY DEFINER
AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Explicitly qualify 'id' and 'role' with the table name 'profiles'
    SELECT EXISTS (
        SELECT 1 FROM public.profiles pf -- Use alias pf
        WHERE pf.id = auth.uid() AND pf.role = 'admin'
    ) INTO is_admin;

    -- If admin, return all profiles (Join conditions are already qualified)
    IF is_admin THEN
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
            public.profiles p -- Added schema qualifier
        JOIN 
            auth.users au ON p.id = au.id;
    ELSE
        -- If not admin, only return the user's own profile (WHERE condition qualified)
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
            public.profiles p -- Added schema qualifier
        JOIN 
            auth.users au ON p.id = au.id
        WHERE 
            p.id = auth.uid();
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_complete_profiles_with_emails() TO authenticated; 