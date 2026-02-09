-- Add allow_na column to precheck_check_items
ALTER TABLE precheck_check_items ADD COLUMN IF NOT EXISTS allow_na boolean NOT NULL DEFAULT false;

-- Update precheck_items status constraint to allow 'na'
ALTER TABLE precheck_items DROP CONSTRAINT IF EXISTS precheck_items_status_check;
ALTER TABLE precheck_items ADD CONSTRAINT precheck_items_status_check 
  CHECK (status IN ('ok', 'repair_needed', 'completed', 'na'));
