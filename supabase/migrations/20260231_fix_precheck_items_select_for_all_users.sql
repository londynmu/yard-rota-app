-- ============================================================
-- Fix precheck_items visibility for regular users
-- Current policy restricts to own submissions only (user_id = auth.uid() OR admin)
-- New: allow all authenticated to see items when submission exists
-- (precheck_submissions is already readable by all via select_all_authenticated)
-- ============================================================

DROP POLICY IF EXISTS "precheck_items_select" ON public.precheck_items;

CREATE POLICY "precheck_items_select"
ON public.precheck_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.precheck_submissions ps
    WHERE ps.id = precheck_items.submission_id
  )
);
