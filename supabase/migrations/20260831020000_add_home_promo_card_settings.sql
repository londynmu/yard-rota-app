-- Home page promo cards visibility (calendar). Default true = current behaviour.
INSERT INTO public.settings (key, value, description)
VALUES
  (
    'show_shunter_of_the_month_card',
    'true',
    'Show the Shunter of the Month card on the home (calendar) page'
  ),
  (
    'show_shunter_guide_card',
    'true',
    'Show the Shunter Guide (yard induction) promo card on the home (calendar) page'
  )
ON CONFLICT (key) DO NOTHING;
