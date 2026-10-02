-- Answers already stored on preferred_start_time should show on the profile page.
UPDATE public.profiles
SET custom_start_time = preferred_start_time
WHERE preferred_start_time IS NOT NULL
  AND custom_start_time IS DISTINCT FROM preferred_start_time;
