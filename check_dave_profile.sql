-- Check if there are actual duplicate profiles for Dave Glover
SELECT id, first_name, last_name, email, is_active, created_at
FROM profiles 
WHERE first_name = 'Dave' AND last_name = 'Glover'
ORDER BY created_at;
