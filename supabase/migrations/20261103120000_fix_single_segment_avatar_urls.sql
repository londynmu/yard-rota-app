-- Fix profiles.avatar_url values that lost the nested `avatars/` object prefix.
-- Storage objects live at bucket `avatars` + key `avatars/<file>`.
-- Correct public URL: …/object/public/avatars/avatars/<file>
-- Broken (single-segment) URL: …/object/public/avatars/<file>
--
-- DO NOT apply to production without owner approval.
-- Frontend fix alone restores the 6 already-correct double URLs; these ~7
-- single-segment rows still need this rewrite after approval.

UPDATE public.profiles
SET avatar_url = regexp_replace(
  avatar_url,
  '(/object/public/avatars/)(?!avatars/)',
  '\1avatars/'
)
WHERE avatar_url LIKE '%/object/public/avatars/%'
  AND avatar_url NOT LIKE '%/object/public/avatars/avatars/%'
  AND EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'avatars'
      AND o.name = 'avatars/' || split_part(avatar_url, '/object/public/avatars/', 2)
  );
