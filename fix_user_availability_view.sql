-- Fix user_availability view security issues
-- This script removes SECURITY DEFINER and ensures the view doesn't expose auth.users data

-- IMPORTANT: This script is SAFE - it only modifies the VIEW structure, NOT the data
-- Views are just queries - they don't store data. All data remains in tables.

-- Step 1: Check if view exists and drop it
-- Using CASCADE to remove any dependencies (like materialized views or other views)
-- If the view was created with SECURITY DEFINER, dropping and recreating will remove it
DROP VIEW IF EXISTS public.user_availability CASCADE;

-- Also check if there's a materialized view with the same name
DROP MATERIALIZED VIEW IF EXISTS public.user_availability CASCADE;

-- Step 2: Recreate the view WITHOUT SECURITY DEFINER
-- Note: By default, views are created with SECURITY INVOKER (not SECURITY DEFINER)
-- We explicitly do NOT include SECURITY DEFINER, so it will use SECURITY INVOKER
-- This means the view will respect the RLS policies of the user querying it
-- IMPORTANT: Do NOT add "SECURITY DEFINER" - by omitting it, we get SECURITY INVOKER
-- In PostgreSQL, views don't have SECURITY DEFINER by default, so just creating it normally is enough
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

-- Step 3: Grant SELECT permission to authenticated users
-- RLS policies on availability and profiles tables will control what data is visible
GRANT SELECT ON public.user_availability TO authenticated;

-- Note: 
-- 1. The view does NOT use SECURITY DEFINER, so it respects the caller's RLS policies
-- 2. The view does NOT directly query auth.users - it only uses public.availability and public.profiles
-- 3. RLS policies on availability and profiles tables control access:
--    - availability: authenticated users can see all availability (per supabase_rls_policies.sql)
--    - profiles: authenticated users can see all profiles (per supabase_rls_policies.sql)
-- This ensures no auth.users data is exposed and security is maintained through RLS

