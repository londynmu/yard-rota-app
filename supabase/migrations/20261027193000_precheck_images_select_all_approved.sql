-- Precheck photos are operational shared evidence: every approved active user
-- must be able to view every object in precheck-images (own and others').
-- INSERT / UPDATE / DELETE stay owner- or admin/vmu-scoped (unchanged).
-- DO NOT apply to production without owner approval.

DROP POLICY IF EXISTS precheck_images_select ON storage.objects;

CREATE POLICY precheck_images_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'precheck-images'
  AND public.is_approved_active_user()
);
