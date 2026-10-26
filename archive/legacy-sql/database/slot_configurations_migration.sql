-- Create slot_configurations table
CREATE TABLE IF NOT EXISTS public.slot_configurations (
    id TEXT PRIMARY KEY,
    shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'afternoon', 'night')),
    break_type TEXT NOT NULL,
    start_time TEXT NOT NULL,
    duration INTEGER NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by shift type
CREATE INDEX IF NOT EXISTS idx_slot_config_shift ON public.slot_configurations(shift_type);

-- Create function to automatically update the updated_at timestamp if not already created
-- Skip if the function already exists
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_modified_column') THEN
        CREATE FUNCTION update_modified_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END
$do$;

-- Create trigger for slot_configurations table
CREATE TRIGGER set_timestamp_slot_configurations
BEFORE UPDATE ON public.slot_configurations
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Add RLS (Row Level Security) policies for slot_configurations table
ALTER TABLE public.slot_configurations ENABLE ROW LEVEL SECURITY;

-- Policy to allow all authenticated users to select slot configurations
CREATE POLICY "All users can view slot configurations" 
ON public.slot_configurations 
FOR SELECT 
TO authenticated;

-- Policy to allow admins to insert/update/delete slot configurations
-- This is a placeholder. You should replace 'admin_role' with your actual admin role
CREATE POLICY "Admins can manage slot configurations" 
ON public.slot_configurations 
USING (auth.uid() IN (
    SELECT id FROM public.profiles WHERE role = 'admin'
));

-- Grant permissions to authenticated users
GRANT SELECT ON public.slot_configurations TO authenticated; 