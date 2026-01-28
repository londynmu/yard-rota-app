-- =====================================================
-- KROK 9: Napraw scheduled_rota
-- =====================================================
-- Obecne: 6 polityk - 2x ALL (duplikat!), 3x SELECT, 1x UPDATE
-- Problem: auth.uid() i auth.role() bez (select), duplikaty
-- Uwaga: view_available_shifts używa logiki (status = 'available' OR user_id = auth.uid())
-- =====================================================

-- Usuń WSZYSTKIE istniejące polityki
DROP POLICY IF EXISTS "Admins have full access to scheduled_rota" ON scheduled_rota;
DROP POLICY IF EXISTS "Tylko administratorzy mogą zarządzać rotą" ON scheduled_rota;
DROP POLICY IF EXISTS "Każdy może odczytać dane roty" ON scheduled_rota;
DROP POLICY IF EXISTS "Users can view their assignments" ON scheduled_rota;
DROP POLICY IF EXISTS "view_available_shifts" ON scheduled_rota;
DROP POLICY IF EXISTS "update_shift_status" ON scheduled_rota;

-- =====================================================
-- NOWE POLITYKI (skonsolidowane i zoptymalizowane)
-- =====================================================

-- SELECT: Wszyscy authenticated mogą widzieć:
--   - Dostępne zmiany (status = 'available')
--   - Swoje przypisania
--   - Admin widzi wszystko
CREATE POLICY "scheduled_rota_select" ON scheduled_rota
FOR SELECT
TO authenticated
USING (
  status = 'available' 
  OR user_id = (SELECT auth.uid())
  OR is_admin()
);

-- INSERT: Tylko admin może dodawać
CREATE POLICY "scheduled_rota_insert" ON scheduled_rota
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- UPDATE: Admin może wszystko, użytkownik może aktualizować swoje przypisania
CREATE POLICY "scheduled_rota_update" ON scheduled_rota
FOR UPDATE
TO authenticated
USING (
  is_admin() 
  OR user_id = (SELECT auth.uid())
)
WITH CHECK (
  is_admin() 
  OR user_id = (SELECT auth.uid())
);

-- DELETE: Tylko admin może usuwać
CREATE POLICY "scheduled_rota_delete" ON scheduled_rota
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'scheduled_rota'
ORDER BY policyname;
