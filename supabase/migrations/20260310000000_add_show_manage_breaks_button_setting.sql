-- Add global setting: show "Manage my breaks" button on home (calendar) page.
-- Default true = button visible (current behaviour).
INSERT INTO public.settings (key, value, description)
VALUES (
  'show_manage_breaks_button',
  'true',
  'Show the Manage my breaks button on the home (calendar) page'
)
ON CONFLICT (key) DO NOTHING;
