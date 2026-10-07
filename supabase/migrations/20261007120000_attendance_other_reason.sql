-- ============================================================
-- Attendance: "other" status + admin-only free-text reasons
-- ============================================================
-- attendance is readable by every authenticated user, so reasons live in a
-- separate table that only admins can read or write.

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.attendance'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.attendance DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('no_show', 'sick', 'late', 'other'));

CREATE TABLE IF NOT EXISTS public.attendance_notes (
  scheduled_rota_id uuid PRIMARY KEY
    REFERENCES public.attendance(scheduled_rota_id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 200),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_notes_select_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_select_admin ON public.attendance_notes
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS attendance_notes_insert_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_insert_admin ON public.attendance_notes
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS attendance_notes_update_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_update_admin ON public.attendance_notes
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS attendance_notes_delete_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_delete_admin ON public.attendance_notes
  FOR DELETE TO authenticated USING (is_admin());
