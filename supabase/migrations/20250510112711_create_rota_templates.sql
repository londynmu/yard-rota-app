-- Create a new table for rota templates
CREATE TABLE rota_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slots JSONB NOT NULL, -- Array of slot objects
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add RLS policies for the templates table
ALTER TABLE rota_templates ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view templates
CREATE POLICY "View templates for authenticated users" ON rota_templates
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Only authenticated users with admin role can insert templates
CREATE POLICY "Insert templates only for admin users" ON rota_templates
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- Only authenticated users with admin role can update templates
CREATE POLICY "Update templates only for admin users" ON rota_templates
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- Only authenticated users with admin role can delete templates
CREATE POLICY "Delete templates only for admin users" ON rota_templates
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- Add function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update the updated_at timestamp
CREATE TRIGGER update_rota_templates_updated_at
BEFORE UPDATE ON rota_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column(); 