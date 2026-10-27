-- =====================================================
-- KROK 15: Napraw widoczność dla zwykłych użytkowników
-- =====================================================
-- Problem: Użytkownicy nie widzą innych osób na rocie i przerwach
-- Rozwiązanie: Wszyscy authenticated widzą wszystko (SELECT)
-- =====================================================

-- =====================================================
-- SCHEDULED_ROTA - Napraw SELECT
-- =====================================================
DROP POLICY IF EXISTS "scheduled_rota_select" ON scheduled_rota;

-- SELECT: WSZYSCY authenticated widzą CAŁĄ rotę
CREATE POLICY "scheduled_rota_select" ON scheduled_rota
FOR SELECT
TO authenticated
USING (true);

-- =====================================================
-- SCHEDULED_BREAKS - Upewnij się że SELECT działa
-- =====================================================
DROP POLICY IF EXISTS "scheduled_breaks_select" ON scheduled_breaks;

-- SELECT: WSZYSCY authenticated widzą WSZYSTKIE przerwy
CREATE POLICY "scheduled_breaks_select" ON scheduled_breaks
FOR SELECT
TO authenticated
USING (true);

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('scheduled_rota', 'scheduled_breaks')
AND cmd = 'SELECT'
ORDER BY tablename;
