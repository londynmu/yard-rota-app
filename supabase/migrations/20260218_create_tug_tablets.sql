-- Create tug_tablets table: one tablet per tug
-- Run in Supabase SQL Editor or via migration

CREATE TABLE IF NOT EXISTS tug_tablets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tug_id uuid NOT NULL REFERENCES tugs(id) ON DELETE CASCADE,
  serial_number text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tug_id)
);

ALTER TABLE tug_tablets ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "tug_tablets_select_all" ON tug_tablets
FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "tug_tablets_insert_admin" ON tug_tablets
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "tug_tablets_update_admin" ON tug_tablets
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "tug_tablets_delete_admin" ON tug_tablets
FOR DELETE TO authenticated USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_tug_tablets_tug_id ON tug_tablets(tug_id);
