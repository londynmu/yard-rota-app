-- ============================================
-- Fix Security Issues from Supabase Linter
-- ============================================
-- This script fixes three security issues:
-- 1. Removes SECURITY DEFINER from user_availability view
-- 2. Enables RLS on monthly_shunter_awards table
-- 3. Enables RLS on imported_reports table (if exists)
--
-- Execute this entire file in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. FIX: View user_availability with SECURITY DEFINER
-- ============================================
-- Drop and recreate the view WITHOUT SECURITY DEFINER
-- By default, views use SECURITY INVOKER which respects RLS policies

DROP VIEW IF EXISTS public.user_availability CASCADE;

-- Recreate the view without SECURITY DEFINER
CREATE VIEW public.user_availability AS
SELECT 
    a.id,
    a.user_id,
    a.date,
    a.status,
    a.comment,
    a.created_at,
    a.updated_at,
    p.first_name,
    p.last_name,
    p.shift_preference,
    p.avatar_url
FROM 
    public.availability a
LEFT JOIN 
    public.profiles p ON a.user_id = p.id;

-- Grant SELECT permission to authenticated users
GRANT SELECT ON public.user_availability TO authenticated;

-- ============================================
-- 2. FIX: Enable RLS on monthly_shunter_awards table
-- ============================================

-- Enable Row Level Security
ALTER TABLE public.monthly_shunter_awards ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view all awards (public leaderboard)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'monthly_shunter_awards' 
        AND policyname = 'Anyone can view monthly awards'
    ) THEN
        CREATE POLICY "Anyone can view monthly awards"
            ON public.monthly_shunter_awards
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

-- Policy: Only admins can insert awards
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'monthly_shunter_awards' 
        AND policyname = 'Admins can insert monthly awards'
    ) THEN
        CREATE POLICY "Admins can insert monthly awards"
            ON public.monthly_shunter_awards
            FOR INSERT
            TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role = 'admin'
                )
            );
    END IF;
END $$;

-- Policy: Only admins can update awards
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'monthly_shunter_awards' 
        AND policyname = 'Admins can update monthly awards'
    ) THEN
        CREATE POLICY "Admins can update monthly awards"
            ON public.monthly_shunter_awards
            FOR UPDATE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role = 'admin'
                )
            );
    END IF;
END $$;

-- Policy: Only admins can delete awards
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'monthly_shunter_awards' 
        AND policyname = 'Admins can delete monthly awards'
    ) THEN
        CREATE POLICY "Admins can delete monthly awards"
            ON public.monthly_shunter_awards
            FOR DELETE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role = 'admin'
                )
            );
    END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.monthly_shunter_awards TO authenticated;

-- ============================================
-- 3. FIX: Enable RLS on imported_reports table (if exists)
-- ============================================
-- Note: This table might not exist in the codebase, but Supabase linter detected it
-- If it doesn't exist, these commands will be skipped

DO $$
BEGIN
    -- Check if table exists
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'imported_reports'
    ) THEN
        -- Enable RLS
        ALTER TABLE public.imported_reports ENABLE ROW LEVEL SECURITY;
        
        -- Create policies only if they don't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'imported_reports' 
            AND policyname = 'Admins can view import reports'
        ) THEN
            CREATE POLICY "Admins can view import reports"
                ON public.imported_reports
                FOR SELECT
                TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.profiles
                        WHERE profiles.id = auth.uid()
                        AND profiles.role = 'admin'
                    )
                );
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'imported_reports' 
            AND policyname = 'Admins can insert import reports'
        ) THEN
            CREATE POLICY "Admins can insert import reports"
                ON public.imported_reports
                FOR INSERT
                TO authenticated
                WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM public.profiles
                        WHERE profiles.id = auth.uid()
                        AND profiles.role = 'admin'
                    )
                );
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'imported_reports' 
            AND policyname = 'Admins can update import reports'
        ) THEN
            CREATE POLICY "Admins can update import reports"
                ON public.imported_reports
                FOR UPDATE
                TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.profiles
                        WHERE profiles.id = auth.uid()
                        AND profiles.role = 'admin'
                    )
                );
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'imported_reports' 
            AND policyname = 'Admins can delete import reports'
        ) THEN
            CREATE POLICY "Admins can delete import reports"
                ON public.imported_reports
                FOR DELETE
                TO authenticated
                USING (
                    EXISTS (
                        SELECT 1 FROM public.profiles
                        WHERE profiles.id = auth.uid()
                        AND profiles.role = 'admin'
                    )
                );
        END IF;
        
        -- Grant permissions
        GRANT SELECT ON public.imported_reports TO authenticated;
        
        RAISE NOTICE 'RLS policies created for imported_reports table';
    ELSE
        RAISE NOTICE 'Table imported_reports does not exist - skipping';
    END IF;
END $$;

-- ============================================
-- Verification Queries
-- ============================================
-- Run these to verify the fixes:

-- Check that user_availability is no longer SECURITY DEFINER:
-- SELECT 
--     viewname, 
--     definition 
-- FROM pg_views 
-- WHERE schemaname = 'public' 
-- AND viewname = 'user_availability';

-- Check RLS is enabled on monthly_shunter_awards:
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename = 'monthly_shunter_awards';

-- Check policies on monthly_shunter_awards:
-- SELECT * FROM pg_policies 
-- WHERE schemaname = 'public' 
-- AND tablename = 'monthly_shunter_awards';

-- Check RLS is enabled on imported_reports (if exists):
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename = 'imported_reports';

-- Check policies on imported_reports (if exists):
-- SELECT * FROM pg_policies 
-- WHERE schemaname = 'public' 
-- AND tablename = 'imported_reports';

-- ============================================
-- Migration Complete!
-- ============================================
-- Summary of changes:
-- ✅ Removed SECURITY DEFINER from user_availability view
-- ✅ Enabled RLS on monthly_shunter_awards table
-- ✅ Created 4 policies for monthly_shunter_awards (SELECT/INSERT/UPDATE/DELETE)
-- ✅ Enabled RLS on imported_reports table (if exists)
-- ✅ Created 4 policies for imported_reports (SELECT/INSERT/UPDATE/DELETE)
--
-- All authenticated users can view awards and performance data
-- Only admins can insert/update/delete awards and import reports
-- ============================================





