-- =====================================================
-- KROK 10: Napraw pozostałe tabele
-- =====================================================
-- Tabele: shift_claims, user_day_notes
-- =====================================================

-- =====================================================
-- 10.1 SHIFT_CLAIMS
-- =====================================================
-- Obecne: 2 polityki (SELECT dla wszystkich, UPDATE dla własnych)
-- Problem: auth.uid() bez (select)

DROP POLICY IF EXISTS "Shift claims: select all" ON shift_claims;
DROP POLICY IF EXISTS "Shift claims: update own assigned" ON shift_claims;

-- Wszyscy authenticated mogą widzieć
CREATE POLICY "shift_claims_select" ON shift_claims
FOR SELECT
TO authenticated
USING (true);

-- Użytkownik może aktualizować swoje lub admin wszystkie
CREATE POLICY "shift_claims_update" ON shift_claims
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()) OR is_admin())
WITH CHECK (user_id = (SELECT auth.uid()) OR is_admin());

-- Użytkownik może dodawać swoje claims lub admin wszystkie
CREATE POLICY "shift_claims_insert" ON shift_claims
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) OR is_admin());

-- Admin może usuwać
CREATE POLICY "shift_claims_delete" ON shift_claims
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- 10.2 USER_DAY_NOTES
-- =====================================================
-- Obecne: 4 polityki
-- Problem: auth.uid() bez (select), roles={public}

DROP POLICY IF EXISTS "Users can delete their own notes" ON user_day_notes;
DROP POLICY IF EXISTS "Users can insert their own notes" ON user_day_notes;
DROP POLICY IF EXISTS "Users can view their own notes and admins can view all notes" ON user_day_notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON user_day_notes;

-- SELECT: Użytkownik widzi swoje, admin widzi wszystkie
CREATE POLICY "user_day_notes_select" ON user_day_notes
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()) OR is_admin());

-- INSERT: Użytkownik może dodawać swoje
CREATE POLICY "user_day_notes_insert" ON user_day_notes
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- UPDATE: Użytkownik może edytować swoje
CREATE POLICY "user_day_notes_update" ON user_day_notes
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- DELETE: Użytkownik może usuwać swoje
CREATE POLICY "user_day_notes_delete" ON user_day_notes
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('shift_claims', 'user_day_notes')
ORDER BY tablename, policyname;
