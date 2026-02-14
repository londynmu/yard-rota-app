-- =====================================================
-- VMU (Vehicle Maintenance Unit) fields for precheck_damages
-- =====================================================

-- 1. Add VMU tracking columns
ALTER TABLE precheck_damages
  ADD COLUMN IF NOT EXISTS defect_number text,
  ADD COLUMN IF NOT EXISTS reported_to_terberg_at timestamptz,
  ADD COLUMN IF NOT EXISTS terberg_reference text,
  ADD COLUMN IF NOT EXISTS vmu_notes text;

-- 2. Expand repair_status CHECK constraint
ALTER TABLE precheck_damages
  DROP CONSTRAINT IF EXISTS precheck_damages_repair_status_check;

ALTER TABLE precheck_damages
  ADD CONSTRAINT precheck_damages_repair_status_check
  CHECK (repair_status IN ('open', 'reported', 'awaiting_parts', 'in_progress', 'resolved'));

-- 3. Create VMU helper functions
CREATE OR REPLACE FUNCTION is_vmu()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'vmu'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_manager_or_vmu()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'manager', 'vmu')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. Update RLS policy on precheck_damages to allow VMU updates
DROP POLICY IF EXISTS "precheck_damages_update" ON precheck_damages;

CREATE POLICY "precheck_damages_update" ON precheck_damages
FOR UPDATE TO authenticated
USING (is_admin_manager_or_vmu())
WITH CHECK (is_admin_manager_or_vmu());
