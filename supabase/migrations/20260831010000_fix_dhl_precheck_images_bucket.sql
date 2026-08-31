-- DHL: create missing precheck-images storage bucket + RLS.
-- App uploads with upsert:true, so INSERT + SELECT + UPDATE are required.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'precheck-images',
  'precheck-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = EXCLUDED.public;

DROP POLICY IF EXISTS "precheck_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "precheck_images_select" ON storage.objects;
DROP POLICY IF EXISTS "precheck_images_update" ON storage.objects;

CREATE POLICY "precheck_images_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'precheck-images');

CREATE POLICY "precheck_images_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'precheck-images');

CREATE POLICY "precheck_images_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'precheck-images')
WITH CHECK (bucket_id = 'precheck-images');
