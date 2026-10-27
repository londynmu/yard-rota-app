-- Add PreCheck remarks visibility setting
INSERT INTO settings (key, value, description)
VALUES (
  'precheck_remarks_enabled',
  'true',
  'Show remarks/description blocks in precheck forms'
)
ON CONFLICT (key) DO NOTHING;
