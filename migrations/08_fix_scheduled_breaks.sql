-- =====================================================
-- KROK 8: Napraw scheduled_breaks
-- =====================================================
-- Obecne: 9 polityk! Wiele duplikatów i problemów
-- Problem: auth.uid() i auth.role() bez (select), roles={public}
-- Uwaga: Polityka "Admins can manage break slot definitions" używa 
--        (user_id IS NULL) dla definicji slotów - musimy to zachować
-- =====================================================

-- Usuń WSZYSTKIE istniejące polityki
DROP POLICY IF EXISTS "Admins can manage break slot definitions" ON scheduled_breaks;
DROP POLICY IF EXISTS "Users can delete their own breaks" ON scheduled_breaks;
DROP POLICY IF EXISTS "breaks_delete_policy" ON scheduled_breaks;
DROP POLICY IF EXISTS "Users can insert their own breaks" ON scheduled_breaks;
DROP POLICY IF EXISTS "breaks_insert_policy" ON scheduled_breaks;
DROP POLICY IF EXISTS "Everyone can view all breaks" ON scheduled_breaks;
DROP POLICY IF EXISTS "breaks_select_policy" ON scheduled_breaks;
DROP POLICY IF EXISTS "Users can update their own breaks" ON scheduled_breaks;
DROP POLICY IF EXISTS "breaks_update_policy" ON scheduled_breaks;

-- =====================================================
-- NOWE POLITYKI (skonsolidowane i zoptymalizowane)
-- =====================================================

-- SELECT: Wszyscy authenticated mogą widzieć wszystkie przerwy
CREATE POLICY "scheduled_breaks_select" ON scheduled_breaks
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Użytkownik może dodać swoje przerwy LUB admin może dodać każde
--         (w tym definicje slotów gdzie user_id IS NULL)
CREATE POLICY "scheduled_breaks_insert" ON scheduled_breaks
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id 
  OR is_admin()
);

-- UPDATE: Użytkownik może edytować swoje przerwy LUB admin może edytować każde
CREATE POLICY "scheduled_breaks_update" ON scheduled_breaks
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) = user_id 
  OR is_admin()
)
WITH CHECK (
  (SELECT auth.uid()) = user_id 
  OR is_admin()
);

-- DELETE: Użytkownik może usuwać swoje przerwy LUB admin może usuwać każde
CREATE POLICY "scheduled_breaks_delete" ON scheduled_breaks
FOR DELETE
TO authenticated
USING (
  (SELECT auth.uid()) = user_id 
  OR is_admin()
);

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'scheduled_breaks'
ORDER BY policyname;
