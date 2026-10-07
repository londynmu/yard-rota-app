-- ============================================
-- SIMPLE FIX: Add search_path to remaining 2 functions
-- ============================================
-- This is the EASIEST way - just alter existing functions
-- No need to know their full definitions!
-- ============================================

-- First, let's see what parameter signatures they have
SELECT 
    proname as function_name,
    pg_get_function_identity_arguments(oid) as parameters
FROM pg_proc
WHERE proname IN ('create_temp_user', 'update_user_profile')
AND pronamespace = 'public'::regnamespace;

-- ============================================
-- Method 1: Try ALTER without specifying parameters
-- (works if there's only one overload of each function)
-- ============================================

DO $$
BEGIN
    -- Fix create_temp_user
    BEGIN
        EXECUTE 'ALTER FUNCTION public.create_temp_user SET search_path = ''''';
        RAISE NOTICE '✅ Fixed create_temp_user';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '⚠️  Could not alter create_temp_user: %. Try Method 2 below.', SQLERRM;
    END;
    
    -- Fix update_user_profile
    BEGIN
        EXECUTE 'ALTER FUNCTION public.update_user_profile SET search_path = ''''';
        RAISE NOTICE '✅ Fixed update_user_profile';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '⚠️  Could not alter update_user_profile: %. Try Method 2 below.', SQLERRM;
    END;
END $$;

-- ============================================
-- Verification - Check if search_path is now set
-- ============================================
SELECT 
    proname as function_name,
    CASE 
        WHEN proconfig IS NULL THEN '❌ Not set'
        WHEN array_to_string(proconfig, ',') LIKE '%search_path%' THEN '✅ Set'
        ELSE '❌ Not set'
    END as search_path_status,
    proconfig as settings
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname IN ('create_temp_user', 'update_user_profile')
ORDER BY proname;

-- ============================================
-- Method 2: If Method 1 failed (multiple overloads)
-- Run the query below to see exact signatures, then uncomment and adjust:
-- ============================================

/*
-- First, see the signatures:
SELECT 
    proname,
    pg_get_function_identity_arguments(oid) as full_signature
FROM pg_proc
WHERE proname IN ('create_temp_user', 'update_user_profile')
AND pronamespace = 'public'::regnamespace;

-- Then use the exact signature from above:
-- Example (adjust based on actual signature):
-- ALTER FUNCTION public.create_temp_user(text, text, text, text) SET search_path = '';
-- ALTER FUNCTION public.update_user_profile(uuid, text, text, text, text) SET search_path = '';
*/

SELECT '✅ Done! Check verification results above.' as status;






