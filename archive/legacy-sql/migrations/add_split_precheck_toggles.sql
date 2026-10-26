-- Split PreCheck form options into separate toggles
INSERT INTO settings (key, value, description)
VALUES
  ('pre_shift_remarks_enabled', 'true', 'Show remarks block in pre-shift precheck form'),
  ('during_shift_damage_report_enabled', 'true', 'Enable during-shift damage reporting flow')
ON CONFLICT (key) DO NOTHING;
