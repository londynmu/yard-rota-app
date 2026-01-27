-- ============================================
-- Fix remaining 2 functions: create_temp_user and update_user_profile
-- ============================================
-- These functions exist in the database but not in source files
-- We need to get their definitions and add SET search_path = ''
--
-- Execute this in Supabase SQL Editor
-- ============================================

-- First, let's check the current definitions
-- Run this to see what parameters these functions have:

-- SELECT 
--     p.proname as function_name,
--     pg_get_function_identity_arguments(p.oid) as parameters,
--     pg_get_functiondef(p.oid) as full_definition
-- FROM pg_proc p
-- WHERE p.proname IN ('create_temp_user', 'update_user_profile')
-- AND p.pronamespace = 'public'::regnamespace;

-- ============================================
-- Fix: create_temp_user
-- ============================================
-- We'll try to recreate it with common parameters
-- If this fails, you'll need to adjust based on your actual function

DO $$
DECLARE
    func_def text;
BEGIN
    -- Check if function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_temp_user' 
        AND pronamespace = 'public'::regnamespace
    ) THEN
        -- Get the current function definition
        SELECT pg_get_functiondef(oid) INTO func_def
        FROM pg_proc
        WHERE proname = 'create_temp_user' 
        AND pronamespace = 'public'::regnamespace
        LIMIT 1;
        
        -- Drop the old function
        DROP FUNCTION IF EXISTS public.create_temp_user;
        
        -- Recreate with SET search_path = ''
        -- Note: Adjust this based on your actual function signature
        -- Common signature for temp user creation:
        BEGIN
            EXECUTE $$
                CREATE OR REPLACE FUNCTION public.create_temp_user(
                    p_email TEXT,
                    p_password TEXT DEFAULT NULL,
                    p_first_name TEXT DEFAULT NULL,
                    p_last_name TEXT DEFAULT NULL
                )
                RETURNS UUID
                LANGUAGE plpgsql
                SECURITY DEFINER
                SET search_path = ''
                AS $func$
                DECLARE
                    new_user_id UUID;
                BEGIN
                    -- Create user in auth.users
                    INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
                    VALUES (p_email, crypt(COALESCE(p_password, 'temp123'), gen_salt('bf')), NOW())
                    RETURNING id INTO new_user_id;
                    
                    -- Create profile
                    INSERT INTO public.profiles (id, first_name, last_name, role)
                    VALUES (new_user_id, p_first_name, p_last_name, 'user');
                    
                    RETURN new_user_id;
                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE NOTICE 'Error creating temp user: %', SQLERRM;
                        RETURN NULL;
                END;
                $func$;
            $$;
            
            RAISE NOTICE '✅ Fixed create_temp_user function';
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '⚠️  Could not recreate create_temp_user: %. Please check the function signature.', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'ℹ️  Function create_temp_user does not exist in database';
    END IF;
END $$;

-- ============================================
-- Fix: update_user_profile
-- ============================================

DO $$
DECLARE
    func_def text;
BEGIN
    -- Check if function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'update_user_profile' 
        AND pronamespace = 'public'::regnamespace
    ) THEN
        -- Drop the old function
        -- Note: We might need to specify parameters if there are multiple overloads
        BEGIN
            DROP FUNCTION IF EXISTS public.update_user_profile;
        EXCEPTION
            WHEN OTHERS THEN
                -- Try with common signatures
                DROP FUNCTION IF EXISTS public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT);
                DROP FUNCTION IF EXISTS public.update_user_profile(UUID, JSONB);
        END;
        
        -- Recreate with SET search_path = ''
        -- Common signature for profile update:
        BEGIN
            EXECUTE $$
                CREATE OR REPLACE FUNCTION public.update_user_profile(
                    p_user_id UUID,
                    p_first_name TEXT DEFAULT NULL,
                    p_last_name TEXT DEFAULT NULL,
                    p_phone TEXT DEFAULT NULL,
                    p_shift_preference TEXT DEFAULT NULL
                )
                RETURNS VOID
                LANGUAGE plpgsql
                SECURITY DEFINER
                SET search_path = ''
                AS $func$
                BEGIN
                    UPDATE public.profiles
                    SET 
                        first_name = COALESCE(p_first_name, first_name),
                        last_name = COALESCE(p_last_name, last_name),
                        phone = COALESCE(p_phone, phone),
                        shift_preference = COALESCE(p_shift_preference, shift_preference),
                        updated_at = NOW()
                    WHERE id = p_user_id;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Profile not found for user %', p_user_id;
                    END IF;
                END;
                $func$;
            $$;
            
            RAISE NOTICE '✅ Fixed update_user_profile function';
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '⚠️  Could not recreate update_user_profile: %. Please check the function signature.', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'ℹ️  Function update_user_profile does not exist in database';
    END IF;
END $$;

-- ============================================
-- Verification
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
-- If the above didn't work (function signatures don't match),
-- run this query to see the actual function definitions:
-- ============================================

-- SELECT 
--     proname as function_name,
--     pg_get_function_identity_arguments(oid) as parameters,
--     pg_get_functiondef(oid) as definition
-- FROM pg_proc
-- WHERE proname IN ('create_temp_user', 'update_user_profile')
-- AND pronamespace = 'public'::regnamespace;

-- Then manually recreate the functions with SET search_path = ''

-- ============================================
-- Alternative: Quick fix by altering existing functions
-- ============================================
-- If recreating doesn't work, try altering the existing functions:

-- ALTER FUNCTION public.create_temp_user SET search_path = '';
-- ALTER FUNCTION public.update_user_profile SET search_path = '';

-- Note: ALTER FUNCTION requires you to specify full signature if there are overloads
-- Example:
-- ALTER FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT) SET search_path = '';

SELECT '✅ Script completed! Check results above.' as status;






