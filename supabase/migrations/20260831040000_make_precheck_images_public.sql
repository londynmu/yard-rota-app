-- PreCheck photos are stored via getPublicUrl(); bucket must be public to view in Admin.
UPDATE storage.buckets
SET public = true
WHERE id = 'precheck-images';
