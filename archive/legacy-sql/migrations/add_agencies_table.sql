-- Create agencies table for storing worker recruitment agencies
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    email TEXT,
    contact_person TEXT,
    phone_number TEXT,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add Row Level Security (RLS) to agencies table
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

-- Create policy to allow only admins to modify agencies
CREATE POLICY "Allow admins to manage agencies"
ON agencies
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Create policy to allow all authenticated users to read agencies
CREATE POLICY "Allow authenticated users to read agencies"
ON agencies
FOR SELECT
TO authenticated
USING (true);

-- Add agency_id column to profiles table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 
                  FROM information_schema.columns 
                  WHERE table_name='profiles' AND column_name='agency_id') 
    THEN
        -- Add agency_id column with foreign key reference
        ALTER TABLE profiles
        ADD COLUMN agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_agencies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at for agencies
CREATE TRIGGER update_agencies_updated_at
BEFORE UPDATE ON agencies
FOR EACH ROW
EXECUTE FUNCTION update_agencies_updated_at();

-- Update the get_complete_profiles_with_emails function to include agency information
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
    -- Function logic with added agency join
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