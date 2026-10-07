-- Check for duplicate profiles
SELECT first_name, last_name, COUNT(*) as count
FROM profiles 
GROUP BY first_name, last_name 
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Check specifically for Dave Glover
SELECT id, first_name, last_name, email, is_active, created_at
FROM profiles 
WHERE first_name = 'Dave' AND last_name = 'Glover'
ORDER BY created_at;

-- Check for duplicate scheduled_rota entries
SELECT user_id, date, start_time, end_time, COUNT(*) as count
FROM scheduled_rota 
GROUP BY user_id, date, start_time, end_time 
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Check for any Dave Glover entries in scheduled_rota
SELECT sr.*, p.first_name, p.last_name
FROM scheduled_rota sr
JOIN profiles p ON sr.user_id = p.id
WHERE p.first_name = 'Dave' AND p.last_name = 'Glover'
ORDER BY sr.date, sr.start_time; 