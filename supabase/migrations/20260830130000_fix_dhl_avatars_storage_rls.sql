-- DHL rota: fix avatar Storage RLS for registration profile photo uploads.
--
-- Previous INSERT policy required only:
--   name LIKE (auth.uid()::text || '-%')
-- which rejects nested keys ('avatars/{uid}-...') used by Flutter and fails
-- when auth.uid() is briefly null (upload then aborted the whole profile save).
--
-- Extend path allow-list; keep bucket scope on avatars / user-avatars.

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload avatar objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update own avatar objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete own avatar objects" ON storage.objects;

DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
CREATE POLICY "avatars_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = ANY (ARRAY['avatars'::text, 'user-avatars'::text]));

CREATE POLICY "avatars_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['avatars'::text, 'user-avatars'::text])
  AND (
    name LIKE ((auth.uid())::text || '-%')
    OR name LIKE ('avatars/' || (auth.uid())::text || '-%')
  )
);

CREATE POLICY "avatars_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars'::text, 'user-avatars'::text])
  AND (
    name LIKE ((auth.uid())::text || '-%')
    OR name LIKE ('avatars/' || (auth.uid())::text || '-%')
  )
)
WITH CHECK (
  bucket_id = ANY (ARRAY['avatars'::text, 'user-avatars'::text])
  AND (
    name LIKE ((auth.uid())::text || '-%')
    OR name LIKE ('avatars/' || (auth.uid())::text || '-%')
  )
);

CREATE POLICY "avatars_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = ANY (ARRAY['avatars'::text, 'user-avatars'::text])
  AND (
    name LIKE ((auth.uid())::text || '-%')
    OR name LIKE ('avatars/' || (auth.uid())::text || '-%')
  )
);
