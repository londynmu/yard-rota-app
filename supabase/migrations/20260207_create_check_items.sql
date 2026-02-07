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
  ('tyres',                  'Tyres',              'Good tread, correct pressure, no cuts or bulges',                'outside', 1),
  ('mud_flaps',              'Mud Flaps',           'Secure, not torn or missing',                                   'outside', 2),
  ('head_lights',            'Head Lights',         'All headlights working, lenses not cracked',                    'outside', 3),
  ('signal_lights',          'Signal Lights',       'Indicators and hazards flash correctly',                        'outside', 4),
  ('brake_lights',           'Brake Lights',        'All brake lights come on when pedal is pressed',                'outside', 5),
  ('strobe_lights',          'Beacon Lights',       'Beacon/strobe lights flash when turned on',                     'outside', 6),
  ('mirrors',                'Mirrors',             'Clean, secure, properly adjusted',                              'outside', 7),
  ('doors',                  'Doors',               'Open, close and latch properly',                                'outside', 8),
  ('windows',                'Windows',             'Clean, no cracks or chips',                                     'outside', 9),
  ('step_handles_platforms', 'Steps/Platforms',      'Secure, clean, no damage',                                     'outside', 10),
  ('fifth_wheel_operation',  '5th Wheel Operation', 'Locks and releases correctly',                                  'outside', 11),
  ('trailer_air_lines',      'Electric / Air Lines','Connections secure, no visible damage',                         'outside', 12),
  ('fluid_leaks',            'Fluid Leaks',         'No oil, coolant or fuel drips underneath',                      'outside', 13),
  ('air_leaks',              'Air Leaks',           'No hissing from brakes, lines or connections',                  'outside', 14),
  ('wipers',                 'Wipers',              'Blades clear the windscreen without streaks',                   'outside', 15)
ON CONFLICT (item_key) DO NOTHING;

-- INSIDE items (sort_order 1-11)
INSERT INTO precheck_check_items (item_key, label, tooltip, category, sort_order) VALUES
  ('seat',              'Seat',            'Adjusts and locks in position',                     'inside', 1),
  ('seat_belt',         'Seat Belt',       'Clicks in, holds firm, retracts smoothly',          'inside', 2),
  ('heater',            'Heater',          'Heater and demister blow warm air',                 'inside', 3),
  ('steering',          'Steering',        'No excessive play, turns smoothly',                 'inside', 4),
  ('throttle',          'Throttle',        'Responds smoothly, no sticking',                    'inside', 5),
  ('starter',           'Starter',         'Engine starts and runs normally',                   'inside', 6),
  ('service_brakes',    'Service Brakes',  'Brakes hold and stop the vehicle properly',        'inside', 7),
  ('park_brake',        'Park Brake',      'Holds the vehicle on an incline',                  'inside', 8),
  ('cab_lights',        'Cab Lights',      'Interior lights working',                          'inside', 9),
  ('stickers',          'Stickers',        'All required stickers and labels present',         'inside', 10),
  ('king_pin_warning',  'King Pin Light',  'Warning light operates correctly',                 'inside', 11)
ON CONFLICT (item_key) DO NOTHING;
