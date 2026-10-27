-- Add extended profile fields for better Rota Planner slot assignment
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS custom_start_time time,
ADD COLUMN IF NOT EXISTS custom_end_time time,
ADD COLUMN IF NOT EXISTS preferred_location text,
ADD COLUMN IF NOT EXISTS max_daily_hours integer,
ADD COLUMN IF NOT EXISTS unavailable_days text[],
ADD COLUMN IF NOT EXISTS notes_for_admin text;

-- Update policies to include new fields
DO $$
BEGIN
    -- Refresh the view policy
    DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
    CREATE POLICY "Users can view their own profile" 
    ON public.profiles 
    FOR SELECT 
    USING (auth.uid() = id);
    
    -- Refresh the update policy
    DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
    CREATE POLICY "Users can update their own profile" 
    ON public.profiles 
    FOR UPDATE 
    USING (auth.uid() = id);
END $$; 