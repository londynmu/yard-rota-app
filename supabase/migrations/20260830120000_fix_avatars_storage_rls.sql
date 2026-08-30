-- Allow authenticated users to upload/update/delete their own objects in the avatars bucket.
-- Previous INSERT policy required (storage.foldername(name))[1] = 'avatars', which rejected
-- flat keys like "{userId}-{random}.jpg" used by the web ProfilePage and blocked registration.

DROP POLICY IF EXISTS "Allow authenticated users to upload avatar objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update own avatar objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete own avatar objects" ON storage.objects;

CREATE POLICY "Allow authenticated users to upload avatar objects"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() = owner
);

CREATE POLICY "Allow authenticated users to update own avatar objects"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() = owner
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() = owner
);

CREATE POLICY "Allow authenticated users to delete own avatar objects"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() = owner
);
