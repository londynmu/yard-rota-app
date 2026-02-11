-- Align precheck items visibility with precheck submissions visibility.
-- This ensures check history can display problem items for visible submissions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'precheck_items'
      AND policyname = 'precheck_items_select'
  ) THEN
    DROP POLICY "precheck_items_select" ON precheck_items;
  END IF;

  CREATE POLICY "precheck_items_select"
  ON precheck_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM precheck_submissions ps
      WHERE ps.id = precheck_items.submission_id
    )
  );
END $$;
