-- ============================================================
-- Ensure regular users can see known defects in PreCheck form
-- RLS: precheck_submissions and precheck_items must allow read
-- for all authenticated (defects come from other users' submissions)
-- ============================================================

-- 1. precheck_submissions: add permissive SELECT for all authenticated
-- (20260211 adds this, but we ensure it exists for known defects feature)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'precheck_submissions'
      AND policyname = 'precheck_submissions_select_all_authenticated'
  ) THEN
    CREATE POLICY "precheck_submissions_select_all_authenticated"
    ON public.precheck_submissions
    FOR SELECT TO authenticated
    USING (true);
  END IF;
END $$;
