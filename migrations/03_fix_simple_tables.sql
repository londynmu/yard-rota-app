-- =====================================================
-- KROK 3: Napraw proste tabele (tylko admin lub publiczny odczyt)
-- =====================================================
-- Tabele: agencies, imported_reports, monthly_shunter_awards, 
--         shunter_performance, rota_templates
-- =====================================================

-- =====================================================
-- 3.1 AGENCIES
-- =====================================================
-- Obecne: 2 polityki (ALL dla admin, SELECT dla authenticated)
-- Problem: auth.uid() bez (select)
-- Rozwiązanie: Użyj is_admin(), osobne polityki (nie ALL!)

DROP POLICY IF EXISTS "Allow admins to manage agencies" ON agencies;
DROP POLICY IF EXISTS "Allow authenticated users to read agencies" ON agencies;
DROP POLICY IF EXISTS "agencies_select" ON agencies;
DROP POLICY IF EXISTS "agencies_admin_manage" ON agencies;

-- Wszyscy authenticated mogą czytać
CREATE POLICY "agencies_select" ON agencies
FOR SELECT
TO authenticated
USING (true);

-- Admini mogą INSERT
CREATE POLICY "agencies_insert" ON agencies
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Admini mogą UPDATE
CREATE POLICY "agencies_update" ON agencies
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Admini mogą DELETE
CREATE POLICY "agencies_delete" ON agencies
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- 3.2 IMPORTED_REPORTS
-- =====================================================
-- Obecne: 4 polityki (SELECT, INSERT, UPDATE, DELETE dla admin)
-- Problem: auth.uid() bez (select) w każdej
-- Uwaga: Ta tabela jest TYLKO dla adminów, więc ALL jest OK

DROP POLICY IF EXISTS "Admins can delete import reports" ON imported_reports;
DROP POLICY IF EXISTS "Admins can insert import reports" ON imported_reports;
DROP POLICY IF EXISTS "Admins can view import reports" ON imported_reports;
DROP POLICY IF EXISTS "Admins can update import reports" ON imported_reports;
DROP POLICY IF EXISTS "imported_reports_admin" ON imported_reports;

-- Jedna polityka ALL dla adminów (tylko admin ma dostęp, więc nie ma konfliktu)
CREATE POLICY "imported_reports_admin" ON imported_reports
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- =====================================================
-- 3.3 MONTHLY_SHUNTER_AWARDS
-- =====================================================
-- Obecne: 4 polityki (SELECT dla wszystkich, reszta dla admin)
-- Problem: auth.uid() bez (select)

DROP POLICY IF EXISTS "Admins can delete monthly awards" ON monthly_shunter_awards;
DROP POLICY IF EXISTS "Admins can insert monthly awards" ON monthly_shunter_awards;
DROP POLICY IF EXISTS "Anyone can view monthly awards" ON monthly_shunter_awards;
DROP POLICY IF EXISTS "Admins can update monthly awards" ON monthly_shunter_awards;
DROP POLICY IF EXISTS "monthly_shunter_awards_select" ON monthly_shunter_awards;
DROP POLICY IF EXISTS "monthly_shunter_awards_admin" ON monthly_shunter_awards;

-- Wszyscy mogą czytać
CREATE POLICY "monthly_shunter_awards_select" ON monthly_shunter_awards
FOR SELECT
TO authenticated
USING (true);

-- Admini mogą INSERT
CREATE POLICY "monthly_shunter_awards_insert" ON monthly_shunter_awards
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Admini mogą UPDATE
CREATE POLICY "monthly_shunter_awards_update" ON monthly_shunter_awards
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Admini mogą DELETE
CREATE POLICY "monthly_shunter_awards_delete" ON monthly_shunter_awards
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- 3.4 SHUNTER_PERFORMANCE
-- =====================================================
-- Obecne: 4 polityki
-- Problem: auth.uid() bez (select)

DROP POLICY IF EXISTS "Admins can delete performance data" ON shunter_performance;
DROP POLICY IF EXISTS "Admins can insert performance data" ON shunter_performance;
DROP POLICY IF EXISTS "Anyone can view performance data" ON shunter_performance;
DROP POLICY IF EXISTS "Admins can update performance data" ON shunter_performance;
DROP POLICY IF EXISTS "shunter_performance_select" ON shunter_performance;
DROP POLICY IF EXISTS "shunter_performance_admin" ON shunter_performance;

-- Wszyscy mogą czytać
CREATE POLICY "shunter_performance_select" ON shunter_performance
FOR SELECT
TO authenticated
USING (true);

-- Admini mogą INSERT
CREATE POLICY "shunter_performance_insert" ON shunter_performance
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Admini mogą UPDATE
CREATE POLICY "shunter_performance_update" ON shunter_performance
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Admini mogą DELETE
CREATE POLICY "shunter_performance_delete" ON shunter_performance
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- 3.5 ROTA_TEMPLATES
-- =====================================================
-- Obecne: 4 polityki (wszystkie dla admin)
-- Problem: auth.uid() bez (select)
-- Uwaga: Ta tabela jest TYLKO dla adminów, więc ALL jest OK

DROP POLICY IF EXISTS "Templates are deletable by admins" ON rota_templates;
DROP POLICY IF EXISTS "Templates are insertable by admins" ON rota_templates;
DROP POLICY IF EXISTS "Templates are viewable by admins" ON rota_templates;
DROP POLICY IF EXISTS "Templates are updatable by admins" ON rota_templates;
DROP POLICY IF EXISTS "rota_templates_admin" ON rota_templates;

-- Jedna polityka ALL dla adminów (tylko admin ma dostęp, więc nie ma konfliktu)
CREATE POLICY "rota_templates_admin" ON rota_templates
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('agencies', 'imported_reports', 'monthly_shunter_awards', 'shunter_performance', 'rota_templates')
ORDER BY tablename, policyname;
