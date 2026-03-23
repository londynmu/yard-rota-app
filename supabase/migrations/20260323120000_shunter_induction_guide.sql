-- Shunter yard induction guide — sections + public image bucket
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shunter_induction_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  body_markdown text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shunter_induction_sections_sort
  ON public.shunter_induction_sections (sort_order ASC, id ASC);

ALTER TABLE public.shunter_induction_sections ENABLE ROW LEVEL SECURITY;

-- Read: published for everyone; admins see all rows (drafts in admin UI)
CREATE POLICY shunter_induction_sections_select ON public.shunter_induction_sections
  FOR SELECT TO authenticated
  USING (
    is_published = true
    OR is_admin()
  );

CREATE POLICY shunter_induction_sections_insert ON public.shunter_induction_sections
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY shunter_induction_sections_update ON public.shunter_induction_sections
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY shunter_induction_sections_delete ON public.shunter_induction_sections
  FOR DELETE TO authenticated
  USING (is_admin());

CREATE OR REPLACE FUNCTION public.update_shunter_induction_sections_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shunter_induction_sections_updated_at ON public.shunter_induction_sections;
CREATE TRIGGER trg_shunter_induction_sections_updated_at
  BEFORE UPDATE ON public.shunter_induction_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_shunter_induction_sections_updated_at();

-- Storage: public read so <img src="getPublicUrl(...)"> works without JWT
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'induction-guide-images',
  'induction-guide-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Upload only for admins
DROP POLICY IF EXISTS induction_guide_images_insert_admin ON storage.objects;
CREATE POLICY induction_guide_images_insert_admin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'induction-guide-images'
    AND is_admin()
  );
