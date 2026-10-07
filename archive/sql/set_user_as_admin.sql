-- Set user as admin
-- This script sets the role to 'admin' for user with UUID or email

-- Option 1: Update by UUID (most precise)
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'b076fcee-31d7-45c5-bae7-21fa5f365964';

-- Option 2: Update by email (if UUID doesn't match, this will work)
-- This joins with auth.users to find the user by email
UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
    SELECT id FROM auth.users WHERE email = 'paddy180@hotmail.co.uk'
);

-- Verify the update
SELECT 
    p.id,
    p.first_name,
    p.last_name,
    p.role,
    u.email
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.id = 'b076fcee-31d7-45c5-bae7-21fa5f365964'
   OR u.email = 'paddy180@hotmail.co.uk';

