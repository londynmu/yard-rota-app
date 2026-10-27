-- #20 Wave B4: private precheck-images bucket + tighter storage policies.
-- DO NOT apply to production until web + Flutter clients that use
-- createSignedUrl are deployed (same release window as this PR).
--
-- Insert: own path prefix `{auth.uid()}/...`
-- Select: author (owner or own path), admin, or vmu.
-- Legacy paths `damages/...` and `temp/...` remain readable by approved users
-- so existing image_urls keep working after the bucket flips private.

UPDATE storage.buckets
SET public = false
WHERE id = 'precheck-images';

DROP POLICY IF EXISTS "precheck_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "precheck_images_select" ON storage.objects;
DROP POLICY IF EXISTS precheck_images_insert ON storage.objects;
DROP POLICY IF EXISTS precheck_images_select ON storage.objects;
DROP POLICY IF EXISTS precheck_images_update ON storage.objects;
DROP POLICY IF EXISTS precheck_images_delete ON storage.objects;

CREATE POLICY precheck_images_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'precheck-images'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY precheck_images_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'precheck-images'
  AND (
    owner = (SELECT auth.uid())
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.is_admin()
    OR public.is_vmu()
  )
)
WITH CHECK (
  bucket_id = 'precheck-images'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.is_admin()
    OR public.is_vmu()
  )
);

CREATE POLICY precheck_images_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'precheck-images'
  AND (
    owner = (SELECT auth.uid())
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.is_admin()
    OR public.is_vmu()
  )
);

CREATE POLICY precheck_images_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'precheck-images'
  AND (
    owner = (SELECT auth.uid())
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.is_admin()
    OR public.is_vmu()
    -- Legacy objects uploaded before user-prefixed paths
    OR (
      (storage.foldername(name))[1] IN ('damages', 'temp')
      AND public.is_approved_active_user()
    )
  )
);
