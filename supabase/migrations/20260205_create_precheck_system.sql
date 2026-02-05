-- =====================================================
-- PreCheck System - Tug Daily Check Sheet
-- =====================================================
-- Tables: tugs, pecheck_submissions, precheck_items, precheck_damages
-- Also fixes: locations SELECT policy for authenticated users
-- =====================================================

-- =====================================================
-- 0. Fix locations table - add SELECT for all authenticated users
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'locations' AND policyname = 'locations_select_all'
  ) THEN
    CREATE POLICY "locations_select_all" ON locations
    FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- =====================================================
-- 1. Create tugs table
-- =====================================================
CREATE TABLE IF NOT EXISTS tugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tug_number text NOT NULL UNIQUE,
  qr_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tugs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read tugs (to select in form)
CREATE POLICY "tugs_select_all" ON tugs
FOR SELECT TO authenticated USING (true);

-- Only admins can manage tugs
CREATE POLICY "tugs_insert_admin" ON tugs
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "tugs_update_admin" ON tugs
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "tugs_delete_admin" ON tugs
FOR DELETE TO authenticated USING (is_admin());

-- Index for QR token lookups
CREATE INDEX IF NOT EXISTS idx_tugs_qr_token ON tugs(qr_token);
CREATE INDEX IF NOT EXISTS idx_tugs_location_id ON tugs(location_id);
CREATE INDEX IF NOT EXISTS idx_tugs_status ON tugs(status);

-- =====================================================
-- 2. Create precheck_submissions table
-- =====================================================
CREATE TABLE IF NOT EXISTS precheck_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tug_id uuid NOT NULL REFERENCES tugs(id) ON DELETE CASCADE,
  check_date date NOT NULL DEFAULT CURRENT_DATE,
  check_time timestamptz NOT NULL DEFAULT now(),
  check_type text NOT NULL DEFAULT 'pre_shift' CHECK (check_type IN ('pre_shift', 'during_shift')),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE precheck_submissions ENABLE ROW LEVEL SECURITY;

-- Users can INSERT their own submissions
CREATE POLICY "precheck_submissions_insert" ON precheck_submissions
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- Users can SELECT only their own, admin/manager can see all
CREATE POLICY "precheck_submissions_select" ON precheck_submissions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR is_admin_or_manager()
);

-- NO UPDATE or DELETE policies - data is immutable
-- (admin can still access via service role if absolutely needed)

-- Indexes
CREATE INDEX IF NOT EXISTS idx_precheck_submissions_user_date 
  ON precheck_submissions(user_id, check_date);
CREATE INDEX IF NOT EXISTS idx_precheck_submissions_tug_date 
  ON precheck_submissions(tug_id, check_date);
CREATE INDEX IF NOT EXISTS idx_precheck_submissions_check_date 
  ON precheck_submissions(check_date);

-- =====================================================
-- 3. Create precheck_items table
-- =====================================================
CREATE TABLE IF NOT EXISTS precheck_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES precheck_submissions(id) ON DELETE CASCADE,
  item_category text NOT NULL CHECK (item_category IN ('perform', 'check')),
  item_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'repair_needed', 'completed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE precheck_items ENABLE ROW LEVEL SECURITY;

-- Users can INSERT items for their own submissions
CREATE POLICY "precheck_items_insert" ON precheck_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM precheck_submissions 
    WHERE id = submission_id AND user_id = (SELECT auth.uid())
  )
);

-- Users can SELECT only their own, admin/manager can see all
CREATE POLICY "precheck_items_select" ON precheck_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM precheck_submissions 
    WHERE id = submission_id AND (
      user_id = (SELECT auth.uid()) 
      OR is_admin_or_manager()
    )
  )
);

-- NO UPDATE or DELETE policies

-- Indexes
CREATE INDEX IF NOT EXISTS idx_precheck_items_submission 
  ON precheck_items(submission_id);

-- =====================================================
-- 4. Create precheck_damages table
-- =====================================================
CREATE TABLE IF NOT EXISTS precheck_damages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES precheck_submissions(id) ON DELETE CASCADE,
  item_id uuid REFERENCES precheck_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  location_on_tug text CHECK (location_on_tug IN ('front', 'rear', 'left', 'right', 'top', 'interior')),
  image_urls text[] DEFAULT '{}',
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'critical')),
  repair_status text NOT NULL DEFAULT 'open' CHECK (repair_status IN ('open', 'in_progress', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE precheck_damages ENABLE ROW LEVEL SECURITY;

-- Users can INSERT damages for their own submissions
CREATE POLICY "precheck_damages_insert" ON precheck_damages
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM precheck_submissions 
    WHERE id = submission_id AND user_id = (SELECT auth.uid())
  )
);

-- All authenticated users can SELECT damages (to see tug history)
CREATE POLICY "precheck_damages_select" ON precheck_damages
FOR SELECT TO authenticated USING (true);

-- Only admin/manager can UPDATE repair_status
CREATE POLICY "precheck_damages_update" ON precheck_damages
FOR UPDATE TO authenticated
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- NO DELETE policy

-- Indexes
CREATE INDEX IF NOT EXISTS idx_precheck_damages_submission 
  ON precheck_damages(submission_id);
CREATE INDEX IF NOT EXISTS idx_precheck_damages_repair_status 
  ON precheck_damages(repair_status);

-- =====================================================
-- 5. Helper: auto-update updated_at on tugs
-- =====================================================
CREATE OR REPLACE FUNCTION update_tugs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tugs_updated_at ON tugs;
CREATE TRIGGER tugs_updated_at
  BEFORE UPDATE ON tugs
  FOR EACH ROW
  EXECUTE FUNCTION update_tugs_updated_at();

-- =====================================================
-- 6. Storage bucket for precheck images
-- =====================================================
-- NOTE: Run this in Supabase Dashboard > Storage or via API:
-- Create bucket 'precheck-images' with:
--   public: false
--   file_size_limit: 10485760 (10MB)
--   allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp']
--
-- Storage policies (run in SQL editor):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'precheck-images', 
  'precheck-images', 
  false, 
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "precheck_images_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'precheck-images');

CREATE POLICY "precheck_images_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'precheck-images');

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('tugs', 'precheck_submissions', 'precheck_items', 'precheck_damages')
ORDER BY tablename, policyname;
