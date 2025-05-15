-- Create table for user day notes
CREATE TABLE user_day_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    -- Composite unique constraint to ensure a user can only have one note per day
    UNIQUE (user_id, date)
);

-- Add RLS policies for the user_day_notes table
ALTER TABLE user_day_notes ENABLE ROW LEVEL SECURITY;

-- Users can view their own notes and admins can view all notes
CREATE POLICY "Users can view their own notes and admins can view all notes" ON user_day_notes
    FOR SELECT
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Users can insert their own notes
CREATE POLICY "Users can insert their own notes" ON user_day_notes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own notes
CREATE POLICY "Users can update their own notes" ON user_day_notes
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own notes
CREATE POLICY "Users can delete their own notes" ON user_day_notes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create function for updating 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_user_day_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating 'updated_at' timestamp
CREATE TRIGGER update_user_day_notes_updated_at
BEFORE UPDATE ON user_day_notes
FOR EACH ROW
EXECUTE FUNCTION update_user_day_notes_updated_at(); 