-- Shunter driver assessments / reassessments.
-- Private storage for paper-form photos + admin-managed assessment rows.
-- DO NOT apply to production until the web clients that use createSignedUrl
-- and the Assessments UI are deployed (same release window as this PR).

-- ============================================================
-- Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shunter_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assessment_date date NOT NULL,
  next_due_date date NOT NULL,
  duration text,
  time_from time,
  time_to time,
  profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_paths text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shunter_assessments_user_id
  ON public.shunter_assessments(user_id);

CREATE INDEX IF NOT EXISTS idx_shunter_assessments_next_due_date
  ON public.shunter_assessments(next_due_date);

CREATE OR REPLACE FUNCTION public.update_shunter_assessments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shunter_assessments_updated_at ON public.shunter_assessments;
CREATE TRIGGER trg_shunter_assessments_updated_at
  BEFORE UPDATE ON public.shunter_assessments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_shunter_assessments_updated_at();

ALTER TABLE public.shunter_assessments ENABLE ROW LEVEL SECURITY;

-- SELECT: admin sees all; shunter sees own rows
CREATE POLICY shunter_assessments_select ON public.shunter_assessments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = (SELECT auth.uid())
  );

-- INSERT/UPDATE/DELETE: admin only
CREATE POLICY shunter_assessments_insert_admin ON public.shunter_assessments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY shunter_assessments_update_admin ON public.shunter_assessments
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY shunter_assessments_delete_admin ON public.shunter_assessments
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- Private storage bucket (paper form photos)
-- Object path convention: {assessed_user_id}/{assessment_id}/{filename}
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shunter-assessments',
  'shunter-assessments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS shunter_assessments_images_insert ON storage.objects;
DROP POLICY IF EXISTS shunter_assessments_images_select ON storage.objects;
DROP POLICY IF EXISTS shunter_assessments_images_update ON storage.objects;
DROP POLICY IF EXISTS shunter_assessments_images_delete ON storage.objects;

CREATE POLICY shunter_assessments_images_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shunter-assessments'
  AND public.is_admin()
);

CREATE POLICY shunter_assessments_images_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'shunter-assessments'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'shunter-assessments'
  AND public.is_admin()
);

CREATE POLICY shunter_assessments_images_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'shunter-assessments'
  AND public.is_admin()
);

CREATE POLICY shunter_assessments_images_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'shunter-assessments'
  AND (
    public.is_admin()
    OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
);
