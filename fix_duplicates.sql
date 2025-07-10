-- Step 1: Check for duplicate profiles
SELECT first_name, last_name, COUNT(*) as count, 
       STRING_AGG(id::text, ', ') as ids,
       STRING_AGG(email, ', ') as emails
FROM profiles 
GROUP BY first_name, last_name 
HAVING COUNT(*) > 1
ORDER BY count DESC;
