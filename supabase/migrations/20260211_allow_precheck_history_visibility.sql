-- Allow authenticated users to view tug check history in precheck card
-- Existing policy still allows own records; this one opens read access for history UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'precheck_submissions'
      AND policyname = 'precheck_submissions_select_all_authenticated'
  ) THEN
    CREATE POLICY "precheck_submissions_select_all_authenticated"
    ON precheck_submissions
    FOR SELECT TO authenticated
    USING (true);
  END IF;
END $$;
