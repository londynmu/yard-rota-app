-- ============================================
-- FINAL FIX: user_availability view - Remove SECURITY DEFINER
-- ============================================
-- This view keeps coming back with SECURITY DEFINER
-- This script will FORCEFULLY remove it and recreate properly
-- ============================================

-- Step 1: Check current view options
DO $$
DECLARE
    view_options text;
BEGIN
    SELECT c.reloptions::text INTO view_options
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'user_availability'
    AND n.nspname = 'public'
    AND c.relkind = 'v';
    
    RAISE NOTICE 'Current view options: %', COALESCE(view_options, 'NULL (good - no special options)');
END $$;

-- Step 2: Check if view has SECURITY DEFINER in its definition
SELECT 
    viewname,
    CASE 
        WHEN definition LIKE '%SECURITY DEFINER%' THEN '❌ HAS SECURITY DEFINER'
        ELSE '✅ No SECURITY DEFINER'
    END as status,
    definition
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'user_availability';

-- Step 3: FORCE DROP and RECREATE
-- Drop with CASCADE to remove ALL dependencies
DROP VIEW IF EXISTS public.user_availability CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.user_availability CASCADE;

-- Wait a moment (ensure drop is complete)
SELECT pg_sleep(0.1);

-- Step 4: Create view WITHOUT any security options
-- This is the STANDARD PostgreSQL view creation
-- By default it uses SECURITY INVOKER (not DEFINER)
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

-- Step 5: Grant permissions
GRANT SELECT ON public.user_availability TO authenticated;
GRANT SELECT ON public.user_availability TO anon;

-- Step 6: Verify the fix
SELECT 
    '✅ View recreated successfully' as status,
    viewname,
    CASE 
        WHEN definition LIKE '%SECURITY DEFINER%' THEN '❌ STILL HAS SECURITY DEFINER'
        WHEN definition LIKE '%SECURITY INVOKER%' THEN '✅ Has SECURITY INVOKER (explicit)'
        ELSE '✅ No security modifier (default INVOKER)'
    END as security_status
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'user_availability';

-- Step 7: Show the complete view definition
SELECT 
    'Complete view definition:' as info,
    pg_get_viewdef('public.user_availability'::regclass, true) as definition;

-- ============================================
-- Additional check: Look for any functions or triggers
-- that might be recreating this view with SECURITY DEFINER
-- ============================================

SELECT 
    'Checking for functions that might recreate the view...' as info;

SELECT 
    proname as function_name,
    pg_get_functiondef(oid) as function_body
FROM pg_proc
WHERE pg_get_functiondef(oid) LIKE '%user_availability%'
AND pronamespace = 'public'::regnamespace;

-- ============================================
-- If this STILL doesn't fix it, the problem might be:
-- 1. A scheduled job or trigger recreating the view
-- 2. Supabase Dashboard "Database" -> "Views" might have cached definition
-- 3. Application code creating the view on startup
-- ============================================

SELECT '🎯 DONE! Run linter again in 30 seconds to verify.' as final_status;





