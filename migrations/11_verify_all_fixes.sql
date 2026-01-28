-- =====================================================
-- KROK 11: Weryfikacja wszystkich napraw
-- =====================================================
-- Uruchom po wszystkich poprzednich skryptach
-- =====================================================

-- 1. Sprawdź czy są zduplikowane polityki
SELECT 
    tablename,
    cmd,
    COUNT(*) as policy_count,
    STRING_AGG(policyname, ', ') as policies
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename, cmd
HAVING COUNT(*) > 1
ORDER BY tablename, cmd;

-- 2. Sprawdź wszystkie polityki (powinny używać is_admin() lub (SELECT auth.uid()))
SELECT 
    tablename,
    policyname,
    cmd,
    roles::text,
    CASE 
        WHEN qual::text LIKE '%auth.uid()%' AND qual::text NOT LIKE '%(SELECT auth.uid())%' AND qual::text NOT LIKE '%select auth.uid()%' THEN 'WARNING: auth.uid() without SELECT'
        WHEN qual::text LIKE '%auth.role()%' THEN 'WARNING: auth.role() used'
        ELSE 'OK'
    END as using_check,
    CASE 
        WHEN with_check::text LIKE '%auth.uid()%' AND with_check::text NOT LIKE '%(SELECT auth.uid())%' AND with_check::text NOT LIKE '%select auth.uid()%' THEN 'WARNING: auth.uid() without SELECT'
        WHEN with_check::text LIKE '%auth.role()%' THEN 'WARNING: auth.role() used'
        ELSE 'OK'
    END as with_check_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Podsumowanie per tabela
SELECT 
    tablename,
    COUNT(*) as total_policies,
    STRING_AGG(DISTINCT cmd::text, ', ') as commands
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 4. Sprawdź czy funkcje pomocnicze istnieją
SELECT 
    proname as function_name,
    prosecdef as security_definer,
    provolatile as volatility
FROM pg_proc 
WHERE proname IN ('is_admin', 'is_admin_or_manager')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
