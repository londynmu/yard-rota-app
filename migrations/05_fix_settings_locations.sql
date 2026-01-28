-- =====================================================
-- KROK 5: Napraw settings i locations (zduplikowane SELECT)
-- =====================================================

-- =====================================================
-- 5.1 SETTINGS
-- =====================================================
-- Obecne: 3 polityki SELECT (duplikaty!) + 1 ALL
-- Problem: auth.role() i auth.uid() bez (select)

DROP POLICY IF EXISTS "Allow admins to manage settings" ON settings;
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON settings;
DROP POLICY IF EXISTS "Każdy może odczytać ustawienia" ON settings;
DROP POLICY IF EXISTS "settings_select" ON settings;
DROP POLICY IF EXISTS "settings_admin" ON settings;

-- Wszyscy authenticated mogą czytać
CREATE POLICY "settings_select" ON settings
FOR SELECT
TO authenticated
USING (true);

-- Admini mogą INSERT
CREATE POLICY "settings_insert" ON settings
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Admini mogą UPDATE
CREATE POLICY "settings_update" ON settings
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Admini mogą DELETE
CREATE POLICY "settings_delete" ON settings
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- 5.2 LOCATIONS
-- =====================================================
-- Obecne: 3 polityki - ALL dla admin, 2x SELECT (duplikaty!)
-- Problem: auth.role() i auth.uid() bez (select)
-- Uwaga: read_active_locations używa (is_active = true) - zachowaj logikę

DROP POLICY IF EXISTS "Admins manage locations" ON locations;
DROP POLICY IF EXISTS "Każdy może odczytać lokalizacje" ON locations;
DROP POLICY IF EXISTS "read_active_locations" ON locations;
DROP POLICY IF EXISTS "locations_select" ON locations;
DROP POLICY IF EXISTS "locations_admin" ON locations;

-- Wszyscy authenticated mogą czytać aktywne lokalizacje
-- (lub admin może widzieć wszystkie)
CREATE POLICY "locations_select" ON locations
FOR SELECT
TO authenticated
USING (is_active = true OR is_admin());

-- Admini mogą INSERT
CREATE POLICY "locations_insert" ON locations
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Admini mogą UPDATE
CREATE POLICY "locations_update" ON locations
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Admini mogą DELETE
CREATE POLICY "locations_delete" ON locations
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('settings', 'locations')
ORDER BY tablename, policyname;
