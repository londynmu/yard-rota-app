-- ============================================================
-- PreCheck Check Items - Dynamic checklist with tooltips
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS precheck_check_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key text NOT NULL UNIQUE,
  label text NOT NULL,
  tooltip text,
  category text NOT NULL CHECK (category IN ('outside', 'inside')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_check_items_category ON precheck_check_items(category);
CREATE INDEX IF NOT EXISTS idx_check_items_active ON precheck_check_items(is_active);

-- 3. Updated_at trigger
CREATE OR REPLACE FUNCTION update_check_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_items_updated_at
  BEFORE UPDATE ON precheck_check_items
  FOR EACH ROW EXECUTE FUNCTION update_check_items_updated_at();

-- 4. Enable RLS
ALTER TABLE precheck_check_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for the form)
CREATE POLICY check_items_select_all ON precheck_check_items
  FOR SELECT TO authenticated USING (true);

-- Only admins/managers can modify
CREATE POLICY check_items_insert_admin ON precheck_check_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY check_items_update_admin ON precheck_check_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY check_items_delete_admin ON precheck_check_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- 5. Seed with existing hardcoded items
-- OUTSIDE items (sort_order 1-15)
INSERT INTO precheck_check_items (item_key, label, tooltip, category, sort_order) VALUES
  ('tyres',                  'Tyres',              'Check tread depth, pressure and damage on all tyres', 'outside', 1),
  ('mud_flaps',              'Mud Flaps',           'Check mud flaps are secure and not torn',             'outside', 2),
  ('head_lights',            'Head Lights',         'Check all headlights are working',                   'outside', 3),
  ('signal_lights',          'Signal Lights',       'Check indicators and hazard lights',                 'outside', 4),
  ('brake_lights',           'Brake Lights',        'Check all brake lights illuminate when pressed',     'outside', 5),
  ('strobe_lights',          'Beacon Lights',       'Check beacon/strobe lights are working',             'outside', 6),
  ('mirrors',                'Mirrors',             'Check mirrors are clean, secure and adjusted',       'outside', 7),
  ('doors',                  'Doors',               'Check doors open, close and latch properly',         'outside', 8),
  ('windows',                'Windows',             'Check windows are clean and not cracked',            'outside', 9),
  ('step_handles_platforms', 'Steps/Platforms',      'Check steps and platforms are secure and clean',     'outside', 10),
  ('fifth_wheel_operation',  '5th Wheel Operation', 'Check 5th wheel locks and releases correctly',      'outside', 11),
  ('trailer_air_lines',      'Electric / Air Lines','Check airline connections and electrical cables',    'outside', 12),
  ('fluid_leaks',            'Fluid Leaks',         'Check underneath for oil, coolant or fuel leaks',   'outside', 13),
  ('air_leaks',              'Air Leaks',           'Listen for air leaks around brakes and lines',      'outside', 14),
  ('wipers',                 'Wipers',              'Check wipers clear the windscreen properly',        'outside', 15)
ON CONFLICT (item_key) DO NOTHING;

-- INSIDE items (sort_order 1-11)
INSERT INTO precheck_check_items (item_key, label, tooltip, category, sort_order) VALUES
  ('seat',              'Seat',            'Check seat adjusts and locks in position',          'inside', 1),
  ('seat_belt',         'Seat Belt',       'Check seat belt clicks, holds and retracts',        'inside', 2),
  ('heater',            'Heater',          'Check heater and demister are working',             'inside', 3),
  ('steering',          'Steering',        'Check steering wheel for excessive play',           'inside', 4),
  ('throttle',          'Throttle',        'Check throttle responds smoothly',                  'inside', 5),
  ('starter',           'Starter',         'Check engine starts and runs normally',             'inside', 6),
  ('service_brakes',    'Service Brakes',  'Test service brakes hold and stop the vehicle',    'inside', 7),
  ('park_brake',        'Park Brake',      'Test park brake holds on an incline',              'inside', 8),
  ('cab_lights',        'Cab Lights',      'Check interior cab lights are working',            'inside', 9),
  ('stickers',          'Stickers',        'Check all required stickers and labels are present','inside', 10),
  ('king_pin_warning',  'King Pin Light',  'Check king pin warning light operates correctly',  'inside', 11)
ON CONFLICT (item_key) DO NOTHING;
