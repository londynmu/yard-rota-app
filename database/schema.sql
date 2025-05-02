-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    shift_preference TEXT CHECK (shift_preference IN ('day', 'afternoon', 'night')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- If profiles table exists but is missing columns, add them
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'profiles' 
                   AND column_name = 'shift_preference') THEN
        ALTER TABLE public.profiles ADD COLUMN shift_preference TEXT CHECK (shift_preference IN ('day', 'afternoon', 'night'));
    END IF;
END $$;

-- Ensure profiles table has RLS enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create profile policies if they don't exist
DO $$
BEGIN
    -- Check if the select policy exists
    IF NOT EXISTS (SELECT 1 FROM pg_policies 
                   WHERE tablename = 'profiles' 
                   AND policyname = 'Users can view their own profile') THEN
        CREATE POLICY "Users can view their own profile" 
        ON public.profiles 
        FOR SELECT 
        USING (auth.uid() = id);
    END IF;
    
    -- Check if the update policy exists
    IF NOT EXISTS (SELECT 1 FROM pg_policies 
                   WHERE tablename = 'profiles' 
                   AND policyname = 'Users can update their own profile') THEN
        CREATE POLICY "Users can update their own profile" 
        ON public.profiles 
        FOR UPDATE 
        USING (auth.uid() = id);
    END IF;
    
    -- Check if the insert policy exists
    IF NOT EXISTS (SELECT 1 FROM pg_policies 
                   WHERE tablename = 'profiles' 
                   AND policyname = 'Users can insert their own profile') THEN
        CREATE POLICY "Users can insert their own profile" 
        ON public.profiles 
        FOR INSERT 
        WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- Create a function for updating timestamps
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if trigger exists for profiles, if not create it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger 
                  WHERE tgname = 'set_timestamp_profiles') THEN
        CREATE TRIGGER set_timestamp_profiles
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column();
    END IF;
END $$;

-- Handle storage for avatars
DO $$
BEGIN
    -- Try to create avatars bucket if it doesn't exist
    BEGIN
        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('avatars', 'avatars', true);
    EXCEPTION WHEN unique_violation THEN
        -- Bucket already exists, ignore
    END;
    
    -- Create policies for avatar access if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_policies 
                   WHERE tablename = 'objects' 
                   AND schemaname = 'storage'
                   AND policyname = 'Allow authenticated users to select their own objects') THEN
        CREATE POLICY "Allow authenticated users to select their own objects" 
        ON storage.objects FOR SELECT
        USING (auth.uid() = owner);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies 
                   WHERE tablename = 'objects' 
                   AND schemaname = 'storage'
                   AND policyname = 'Allow authenticated users to upload avatar objects') THEN
        CREATE POLICY "Allow authenticated users to upload avatar objects" 
        ON storage.objects FOR INSERT
        WITH CHECK (
          auth.uid() = owner AND
          bucket_id = 'avatars' AND
          (storage.foldername(name))[1] = 'avatars'
        );
    END IF;
END $$;

-- Grant permissions to authenticated users
GRANT ALL ON public.profiles TO authenticated;

-- Create availability table
CREATE TABLE IF NOT EXISTS public.availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'unavailable', 'holiday')),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by user and date
CREATE INDEX IF NOT EXISTS idx_availability_user_date ON public.availability(user_id, date);

-- Add RLS (Row Level Security) policies for availability table
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to select only their own availability records
CREATE POLICY "Users can view their own availability" 
ON public.availability 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy to allow users to insert their own availability records
CREATE POLICY "Users can insert their own availability" 
ON public.availability 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to update their own availability records
CREATE POLICY "Users can update their own availability" 
ON public.availability 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Policy to allow users to delete their own availability records
CREATE POLICY "Users can delete their own availability" 
ON public.availability 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for availability table
CREATE TRIGGER set_timestamp_availability
BEFORE UPDATE ON public.availability
FOR EACH ROW
EXECUTE FUNCTION update_modified_column(); 