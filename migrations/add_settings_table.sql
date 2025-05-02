-- Create settings table for system-wide configuration
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add Row Level Security (RLS) to settings table
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow only admins to modify settings
CREATE POLICY "Allow admins to manage settings"
ON settings
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Create policy to allow all authenticated users to read settings
CREATE POLICY "Allow authenticated users to read settings"
ON settings
FOR SELECT
TO authenticated
USING (true);

-- Insert default values for settings
INSERT INTO settings (key, value, description)
VALUES 
    ('min_break_between_slots', '60', 'Minimum break time between slots in minutes'),
    ('default_shift_length', '8', 'Default shift length in hours'),
    ('default_theme', 'dark', 'Default UI theme'),
    ('working_hours_start', '08:00', 'Default working hours start time'),
    ('working_hours_end', '20:00', 'Default working hours end time')
ON CONFLICT (key) DO NOTHING;

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION update_settings_updated_at(); 