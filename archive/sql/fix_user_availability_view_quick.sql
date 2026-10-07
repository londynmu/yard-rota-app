-- ============================================
-- QUICK FIX: Remove SECURITY DEFINER from user_availability view
-- ============================================
-- Execute this in Supabase SQL Editor
-- ============================================

-- Step 1: Drop the view (with CASCADE to handle dependencies)
DROP VIEW IF EXISTS public.user_availability CASCADE;

-- Step 2: Recreate WITHOUT SECURITY DEFINER
-- (By default, views use SECURITY INVOKER which is what we want)
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

-- Step 3: Grant permissions
GRANT SELECT ON public.user_availability TO authenticated;

-- ============================================
-- Verification
-- ============================================
-- Run this to verify the view definition:
-- SELECT pg_get_viewdef('public.user_availability'::regclass, true);
--
-- You should see the SELECT statement without any SECURITY DEFINER
-- ============================================

SELECT 'View user_availability fixed successfully!' as status;






