-- ============================================
-- Shunter Performance Tracking System Migration
-- ============================================
-- This migration adds support for tracking daily shunter performance
-- based on yard system reports
--
-- Execute this entire file in Supabase SQL Editor
-- ============================================

-- 1. Add yard_system_id to profiles table
-- ============================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS yard_system_id TEXT UNIQUE;

COMMENT ON COLUMN public.profiles.yard_system_id IS 'Unique ID from yard system (e.g., AG10, AK2024) - used for matching with daily performance reports';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_yard_system_id ON public.profiles(yard_system_id);

-- 2. Create shunter_performance table
-- ============================================
CREATE TABLE IF NOT EXISTS public.shunter_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    number_of_moves INTEGER NOT NULL DEFAULT 0,
    avg_time_to_collect TEXT NOT NULL DEFAULT '0:00',
    avg_time_to_travel TEXT NOT NULL DEFAULT '0:00',
    number_of_full_locations INTEGER DEFAULT 0,
    full_name_from_report TEXT,
    yard_system_id_from_report TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_report_date UNIQUE (user_id, report_date)
);

COMMENT ON TABLE public.shunter_performance IS 'Daily performance metrics for shunters imported from yard system reports';
COMMENT ON COLUMN public.shunter_performance.report_date IS 'Date of the performance report';
COMMENT ON COLUMN public.shunter_performance.number_of_moves IS 'Total number of moves (aggregated from all shifts that day)';
COMMENT ON COLUMN public.shunter_performance.avg_time_to_collect IS 'Weighted average time to collect (format: M:SS)';
COMMENT ON COLUMN public.shunter_performance.avg_time_to_travel IS 'Weighted average time to travel (format: M:SS)';
COMMENT ON COLUMN public.shunter_performance.number_of_full_locations IS 'Number of full location exceptions';
COMMENT ON COLUMN public.shunter_performance.full_name_from_report IS 'Name as it appears in CSV report (for audit trail)';
COMMENT ON COLUMN public.shunter_performance.yard_system_id_from_report IS 'Yard system ID from CSV report (for audit trail)';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shunter_performance_user_id ON public.shunter_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_shunter_performance_report_date ON public.shunter_performance(report_date);
CREATE INDEX IF NOT EXISTS idx_shunter_performance_date_range ON public.shunter_performance(report_date, user_id);

-- 3. Enable Row Level Security (RLS)
-- ============================================
ALTER TABLE public.shunter_performance ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view all performance data
CREATE POLICY "Anyone can view performance data"
    ON public.shunter_performance
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only admins can insert performance data
CREATE POLICY "Admins can insert performance data"
    ON public.shunter_performance
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy: Only admins can update performance data
CREATE POLICY "Admins can update performance data"
    ON public.shunter_performance
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy: Only admins can delete performance data
CREATE POLICY "Admins can delete performance data"
    ON public.shunter_performance
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 4. Create function for automatic timestamp updates
-- ============================================
CREATE OR REPLACE FUNCTION update_shunter_performance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS set_timestamp_shunter_performance ON public.shunter_performance;
CREATE TRIGGER set_timestamp_shunter_performance
    BEFORE UPDATE ON public.shunter_performance
    FOR EACH ROW
    EXECUTE FUNCTION update_shunter_performance_timestamp();

-- 5. Grant permissions
-- ============================================
GRANT SELECT ON public.shunter_performance TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- ============================================
-- Migration complete!
-- ============================================
-- Next steps:
-- 1. Add Yard System IDs to user profiles via Admin Panel
-- 2. Import first CSV report via Admin → Performance tab
-- 3. View leaderboard at /performance page
-- ============================================

