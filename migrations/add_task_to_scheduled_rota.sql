-- Add task column to scheduled_rota table
ALTER TABLE scheduled_rota
ADD COLUMN IF NOT EXISTS task TEXT;

-- Create a function to store previously used tasks for autocomplete
CREATE OR REPLACE FUNCTION get_all_unique_tasks()
RETURNS TABLE (task TEXT) 
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT sr.task 
  FROM scheduled_rota sr 
  WHERE sr.task IS NOT NULL AND sr.task != '' 
  ORDER BY sr.task;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_unique_tasks() TO authenticated; 