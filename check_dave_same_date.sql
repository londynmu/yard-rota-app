-- Check if Dave Glover has multiple entries for the same date
SELECT date, COUNT(*) as entries_count, 
       STRING_AGG(start_time || '-' || end_time, ', ') as time_slots
FROM scheduled_rota sr
JOIN profiles p ON sr.user_id = p.id
WHERE p.first_name = 'Dave' AND p.last_name = 'Glover'
GROUP BY date
HAVING COUNT(*) > 1
ORDER BY date;
