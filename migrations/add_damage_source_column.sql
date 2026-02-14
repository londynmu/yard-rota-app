-- Add source column to precheck_damages to distinguish remarks from real damages
-- Values: 'check_item' (defect from checklist), 'remarks' (pre-shift remarks), 'during_shift' (during-shift damage report)

ALTER TABLE precheck_damages
ADD COLUMN IF NOT EXISTS source text
DEFAULT 'check_item'
CHECK (source IN ('check_item', 'remarks', 'during_shift'));

-- Backfill: during_shift (item_id IS NULL + submission check_type = 'during_shift')
UPDATE precheck_damages d SET source = 'during_shift'
FROM precheck_submissions s
WHERE d.submission_id = s.id
  AND s.check_type = 'during_shift'
  AND d.item_id IS NULL;

-- Backfill: remarks (item_id IS NULL + submission check_type = 'pre_shift')
UPDATE precheck_damages d SET source = 'remarks'
FROM precheck_submissions s
WHERE d.submission_id = s.id
  AND s.check_type = 'pre_shift'
  AND d.item_id IS NULL;
