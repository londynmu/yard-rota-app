-- Preserve attendance when a scheduled_rota row is deleted after a tracked
-- removal (My Rota reason → auto-unassign). Snapshot identity onto attendance,
-- retarget notes to attendance.id, then SET NULL on scheduled_rota_id.

-- 1) Snapshot columns on attendance
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS date date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS shift_type text,
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone;

-- Backfill from live rota rows
UPDATE public.attendance a
SET
  user_id = sr.user_id,
  date = sr.date,
  location = sr.location,
  shift_type = sr.shift_type,
  start_time = sr.start_time,
  end_time = sr.end_time
FROM public.scheduled_rota sr
WHERE a.scheduled_rota_id = sr.id
  AND (
    a.user_id IS NULL
    OR a.date IS NULL
    OR a.location IS NULL
    OR a.shift_type IS NULL
    OR a.start_time IS NULL
    OR a.end_time IS NULL
  );

-- 2) Retarget attendance_notes to attendance(id) so notes survive SET NULL
ALTER TABLE public.attendance_notes
  ADD COLUMN IF NOT EXISTS attendance_id uuid;

UPDATE public.attendance_notes n
SET attendance_id = a.id
FROM public.attendance a
WHERE n.attendance_id IS NULL
  AND a.scheduled_rota_id = n.scheduled_rota_id;

DELETE FROM public.attendance_notes WHERE attendance_id IS NULL;

ALTER TABLE public.attendance_notes
  DROP CONSTRAINT IF EXISTS attendance_notes_scheduled_rota_id_fkey;

ALTER TABLE public.attendance_notes
  DROP CONSTRAINT IF EXISTS attendance_notes_pkey;

ALTER TABLE public.attendance_notes
  ALTER COLUMN attendance_id SET NOT NULL;

ALTER TABLE public.attendance_notes
  ADD CONSTRAINT attendance_notes_pkey PRIMARY KEY (attendance_id);

ALTER TABLE public.attendance_notes
  ADD CONSTRAINT attendance_notes_attendance_id_fkey
  FOREIGN KEY (attendance_id) REFERENCES public.attendance(id) ON DELETE CASCADE;

-- Keep scheduled_rota_id as denormalized lookup while the rota row still exists
ALTER TABLE public.attendance_notes
  ALTER COLUMN scheduled_rota_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_notes_scheduled_rota_id_idx
  ON public.attendance_notes (scheduled_rota_id)
  WHERE scheduled_rota_id IS NOT NULL;

-- 3) Allow attendance to outlive the rota row
ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_scheduled_rota_id_fkey;

ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_scheduled_rota_id_key;

ALTER TABLE public.attendance
  ALTER COLUMN scheduled_rota_id DROP NOT NULL;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_scheduled_rota_id_fkey
  FOREIGN KEY (scheduled_rota_id) REFERENCES public.scheduled_rota(id) ON DELETE SET NULL;

-- Nullable UNIQUE: many NULL orphans allowed; live slot links stay unique (PostgREST upsert).
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_scheduled_rota_id_key UNIQUE (scheduled_rota_id);

CREATE INDEX IF NOT EXISTS attendance_user_id_date_idx
  ON public.attendance (user_id, date);
