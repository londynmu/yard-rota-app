-- Add form_session_id to precheck_submissions for deduplication
-- Prevents duplicate submissions when network is unstable
ALTER TABLE precheck_submissions ADD COLUMN IF NOT EXISTS form_session_id text;

-- UNIQUE but nullable - old data without form_session_id won't conflict (NULL != NULL in PG)
CREATE UNIQUE INDEX IF NOT EXISTS idx_precheck_submissions_form_session_id 
  ON precheck_submissions(form_session_id) WHERE form_session_id IS NOT NULL;
