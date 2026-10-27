-- Allow transport managers to READ attendance free-text notes (reasons).
-- Writes (insert/update/delete) stay admin-only.
-- DO NOT apply to production without owner approval.

DROP POLICY IF EXISTS attendance_notes_select_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_select_admin ON public.attendance_notes
  FOR SELECT TO authenticated
  USING (
    public.is_approved_active_user()
    AND (public.is_admin() OR public.is_transport_manager())
  );
