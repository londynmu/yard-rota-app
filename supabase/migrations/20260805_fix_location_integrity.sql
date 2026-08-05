-- Location integrity for breaks and rota.
--
-- Background: scheduled_breaks.location used to be guarded by a CHECK list of
-- ('Main Hub', 'NRC') that predates the current hubs, and every location column
-- still defaults to the retired 'Main Hub' name. Hub names also drifted between
-- tables ('nuneaton' vs 'Nuneaton'), which hid most of the Nuneaton rota because
-- every lookup compares the name verbatim.

BEGIN;

-- 1. Canonical hub spelling. Rota first, so the value already exists in
--    locations while both tables are briefly out of sync.
UPDATE public.scheduled_rota SET location = 'Nuneaton' WHERE location = 'nuneaton';
UPDATE public.locations      SET name     = 'Nuneaton' WHERE name     = 'nuneaton';

-- 2. Re-derive breaks that a blanket 'Main Hub' -> 'Rugby' rewrite mislabelled.
--    Only rows contradicted by the shift they belong to are touched.
UPDATE public.scheduled_breaks sb
SET location = sr.location
FROM public.scheduled_rota sr
WHERE sb.user_id = sr.user_id
  AND sb.date = sr.date
  AND sb.shift_type = sr.shift_type
  AND sb.location = 'Rugby'
  AND sr.location <> 'Rugby';

-- 3. Drop the retired default. A row defaulting to 'Main Hub' matches no hub and
--    is therefore invisible in every location filter.
ALTER TABLE public.scheduled_breaks      ALTER COLUMN location DROP DEFAULT;
ALTER TABLE public.custom_break_slots    ALTER COLUMN location DROP DEFAULT;
ALTER TABLE public.break_slot_capacities ALTER COLUMN location DROP DEFAULT;

-- 4. Validate against the locations table instead of a hardcoded list, so adding
--    a hub can no longer break saving. ON UPDATE CASCADE keeps a future rename
--    consistent across tables.
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_key ON public.locations (name);

ALTER TABLE public.scheduled_breaks
  DROP CONSTRAINT IF EXISTS scheduled_breaks_location_fkey,
  ADD CONSTRAINT scheduled_breaks_location_fkey
    FOREIGN KEY (location) REFERENCES public.locations (name) ON UPDATE CASCADE;

ALTER TABLE public.scheduled_rota
  DROP CONSTRAINT IF EXISTS scheduled_rota_location_fkey,
  ADD CONSTRAINT scheduled_rota_location_fkey
    FOREIGN KEY (location) REFERENCES public.locations (name) ON UPDATE CASCADE;

-- 5. Location is part of every breaks lookup now.
CREATE INDEX IF NOT EXISTS idx_scheduled_breaks_date_shift_location
  ON public.scheduled_breaks (date, shift_type, location);

COMMIT;
