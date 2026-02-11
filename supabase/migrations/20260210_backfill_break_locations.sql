-- Backfill location on scheduled_breaks from scheduled_rota
-- For existing breaks that don't have location set, derive it from the user's shift
UPDATE scheduled_breaks sb
SET location = sr.location
FROM scheduled_rota sr
WHERE sb.user_id = sr.user_id
  AND sb.date = sr.date
  AND sb.shift_type = sr.shift_type
  AND sb.location IS NULL
  AND sr.location IS NOT NULL;
