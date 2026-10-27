-- =====================================================
-- Defect Activity Log - audit trail for VMU defect changes
-- =====================================================

-- 1. Create activity log table
CREATE TABLE IF NOT EXISTS defect_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  damage_id uuid NOT NULL REFERENCES precheck_damages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL,     -- 'status_change', 'field_update'
  field_name text,               -- 'repair_status', 'defect_number', 'reported_to_terberg_at', 'terberg_reference', 'vmu_notes'
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index for fast lookups by damage + chronological order
CREATE INDEX IF NOT EXISTS idx_defect_activity_damage_date
  ON defect_activity_log(damage_id, created_at DESC);

-- 3. Enable RLS
ALTER TABLE defect_activity_log ENABLE ROW LEVEL SECURITY;

-- 4. All authenticated users can read activity logs
CREATE POLICY "defect_activity_log_select" ON defect_activity_log
  FOR SELECT TO authenticated USING (true);

-- 5. Only admin/manager/vmu can insert log entries (reuses existing function)
CREATE POLICY "defect_activity_log_insert" ON defect_activity_log
  FOR INSERT TO authenticated WITH CHECK (is_admin_manager_or_vmu());
