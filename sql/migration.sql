-- Migration script to add performance_score and is_active columns to profiles table

-- Check if the columns already exist before adding them
DO $$ 
BEGIN
    -- Check for is_active column
    IF NOT EXISTS (SELECT 1 
                  FROM information_schema.columns 
                  WHERE table_name='profiles' AND column_name='is_active') 
    THEN
        -- Add is_active column with default value of true
        ALTER TABLE profiles
        ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        -- Update any existing records
        UPDATE profiles SET is_active = true WHERE is_active IS NULL;
    END IF;
    
    -- Check for performance_score column
    IF NOT EXISTS (SELECT 1 
                  FROM information_schema.columns 
                  WHERE table_name='profiles' AND column_name='performance_score') 
    THEN
        -- Add performance_score column with default value of 50
        ALTER TABLE profiles
        ADD COLUMN performance_score INTEGER DEFAULT 50;
        
        -- Update any existing records
        UPDATE profiles SET performance_score = 50 WHERE performance_score IS NULL;
    END IF;
    
    -- Add comments to help identify purpose of columns
    COMMENT ON COLUMN profiles.is_active IS 'Indicates whether the user account is active or inactive';
    COMMENT ON COLUMN profiles.performance_score IS 'Performance rating from 1 (poor) to 99 (excellent)';
END $$;

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_profiles_with_emails();

-- Create RPC function to properly get profiles with user data including the new fields
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
        auth.users au ON p.id = au.id;
END;
$$ LANGUAGE plpgsql; 