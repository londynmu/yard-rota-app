-- RLS Policies for scheduled_breaks table
-- This ensures users can only manage their own breaks while allowing everyone to view all breaks

-- Enable RLS for scheduled_breaks table
ALTER TABLE scheduled_breaks ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can view all breaks (for visibility on homepage and breaks page)
CREATE POLICY "Everyone can view all breaks" ON scheduled_breaks
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Policy 2: Users can only insert their own breaks
CREATE POLICY "Users can insert their own breaks" ON scheduled_breaks
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy 3: Users can only update their own breaks, admins can update all
CREATE POLICY "Users can update their own breaks" ON scheduled_breaks
    FOR UPDATE
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy 4: Users can only delete their own breaks, admins can delete all
CREATE POLICY "Users can delete their own breaks" ON scheduled_breaks
    FOR DELETE
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy 5: Allow admins to insert/update/delete break slot definitions (where user_id is null)
-- This is for custom slots and standard slot capacity modifications
CREATE POLICY "Admins can manage break slot definitions" ON scheduled_breaks
    FOR ALL
    USING (
        user_id IS NULL AND
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        user_id IS NULL AND
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Grant basic permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_breaks TO authenticated; 