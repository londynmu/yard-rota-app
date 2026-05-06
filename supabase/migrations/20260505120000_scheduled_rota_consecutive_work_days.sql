-- Max consecutive calendar days with a shift (toggle + limit in settings).
-- Default: enforcement OFF — no behaviour change until an admin enables it in Settings.
--
-- Rollback (run manually if needed):
--   DROP TRIGGER IF EXISTS trg_scheduled_rota_consecutive_work_days ON public.scheduled_rota;
--   DROP FUNCTION IF EXISTS public.scheduled_rota_enforce_consecutive_work_days();
--   (Optional) DROP INDEX IF EXISTS public.idx_scheduled_rota_user_id_date;

INSERT INTO public.settings (key, value, description)
VALUES
  (
    'enforce_max_consecutive_work_days',
    'false',
    'When true, block assignments that would create more consecutive calendar days with a shift than max_consecutive_work_days.'
  ),
  (
    'max_consecutive_work_days',
    '6',
    'Maximum allowed consecutive calendar days with at least one shift (the next day is blocked when enforcement is on).'
  )
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_scheduled_rota_user_id_date
  ON public.scheduled_rota (user_id, date)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.scheduled_rota_enforce_consecutive_work_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enforce_text text;
  max_days_text text;
  max_days int := 6;
  streak_before int := 0;
  streak_after int := 0;
  d date;
  total_streak int;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.value INTO enforce_text
  FROM public.settings AS s
  WHERE s.key = 'enforce_max_consecutive_work_days'
  LIMIT 1;

  IF enforce_text IS NULL OR lower(trim(enforce_text)) <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT s.value INTO max_days_text
  FROM public.settings AS s
  WHERE s.key = 'max_consecutive_work_days'
  LIMIT 1;

  IF max_days_text IS NOT NULL AND btrim(max_days_text) <> '' THEN
    BEGIN
      max_days := btrim(max_days_text)::int;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        max_days := 6;
    END;
  END IF;

  IF max_days < 1 OR max_days > 13 THEN
    max_days := 6;
  END IF;

  d := NEW.date - 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.scheduled_rota AS sr
      WHERE sr.user_id = NEW.user_id
        AND sr.date = d
        AND sr.id IS DISTINCT FROM NEW.id
    );
    streak_before := streak_before + 1;
    d := d - 1;
  END LOOP;

  d := NEW.date + 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.scheduled_rota AS sr
      WHERE sr.user_id = NEW.user_id
        AND sr.date = d
        AND sr.id IS DISTINCT FROM NEW.id
    );
    streak_after := streak_after + 1;
    d := d + 1;
  END LOOP;

  total_streak := streak_before + 1 + streak_after;

  IF total_streak > max_days THEN
    RAISE EXCEPTION 'Cannot assign: this would exceed the maximum of % consecutive calendar days with a shift for this user.', max_days
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_rota_consecutive_work_days ON public.scheduled_rota;

CREATE TRIGGER trg_scheduled_rota_consecutive_work_days
  BEFORE INSERT OR UPDATE OF user_id, date
  ON public.scheduled_rota
  FOR EACH ROW
  EXECUTE FUNCTION public.scheduled_rota_enforce_consecutive_work_days();

COMMENT ON FUNCTION public.scheduled_rota_enforce_consecutive_work_days() IS
  'Blocks INSERT/UPDATE when enforce_max_consecutive_work_days is true and streak would exceed max_consecutive_work_days.';
