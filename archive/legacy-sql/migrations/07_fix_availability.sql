-- =====================================================
-- KROK 7: Napraw availability (najbardziej zduplikowana!)
-- =====================================================
-- Obecne: 9 polityk! 4x SELECT, 2x INSERT, 2x UPDATE, 1x DELETE
-- Problem: auth.uid() i auth.role() bez (select), wiele duplikatów
-- =====================================================

-- Usuń WSZYSTKIE istniejące polityki
DROP POLICY IF EXISTS "Allow admins to delete any availability" ON availability;
DROP POLICY IF EXISTS "Allow admins to insert availability" ON availability;
DROP POLICY IF EXISTS "Allow users insert own availability" ON availability;
DROP POLICY IF EXISTS "Allow admin read access on availability" ON availability;
DROP POLICY IF EXISTS "Allow admins to read all availability" ON availability;
DROP POLICY IF EXISTS "Allow authenticated users read all availability" ON availability;
DROP POLICY IF EXISTS "Każdy może odczytać dostępność innych" ON availability;
DROP POLICY IF EXISTS "Allow admins to update any availability" ON availability;
DROP POLICY IF EXISTS "Allow users update own availability" ON availability;

-- =====================================================
-- NOWE POLITYKI (skonsolidowane i zoptymalizowane)
-- =====================================================

-- SELECT: Wszyscy authenticated mogą czytać całą dostępność
CREATE POLICY "availability_select" ON availability
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Użytkownik może dodać swoją dostępność LUB admin może dodać każdą
CREATE POLICY "availability_insert" ON availability
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id OR is_admin());

-- UPDATE: Użytkownik może edytować swoją dostępność LUB admin może edytować każdą
CREATE POLICY "availability_update" ON availability
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id OR is_admin())
WITH CHECK ((SELECT auth.uid()) = user_id OR is_admin());

-- DELETE: Tylko admin może usuwać
CREATE POLICY "availability_delete" ON availability
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'availability'
ORDER BY policyname;
