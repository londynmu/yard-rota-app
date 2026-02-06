-- Add display_name column to tugs table
-- Used for the short label shown on tug cards (e.g. "069", "TUG-A", etc.)
ALTER TABLE tugs ADD COLUMN IF NOT EXISTS display_name text;
