-- Show Stats (Performance) in main app navigation. Default true = current behaviour.
INSERT INTO public.settings (key, value, description)
VALUES (
  'show_stats_nav',
  'true',
  'Show the Stats (Performance) tab in top and bottom navigation'
)
ON CONFLICT (key) DO NOTHING;
