-- Allow multiple active defects per (tug_id, item_key) for "Different problem" flow
-- UI distinguishes: Still exists -> confirmation only; Different problem -> new damage

-- Try constraint first (ALTER TABLE drops both constraint and backing index)
ALTER TABLE public.precheck_damages DROP CONSTRAINT IF EXISTS idx_unique_active_defect_per_item;

-- Then standalone unique index (if it was CREATE UNIQUE INDEX, not ADD CONSTRAINT)
DROP INDEX IF EXISTS public.idx_unique_active_defect_per_item;
