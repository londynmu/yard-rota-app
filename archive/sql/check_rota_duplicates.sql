-- Check for duplicate scheduled_rota entries
SELECT user_id, date, start_time, end_time, COUNT(*) as count
FROM scheduled_rota 
GROUP BY user_id, date, start_time, end_time 
HAVING COUNT(*) > 1
ORDER BY count DESC;
