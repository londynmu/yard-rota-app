-- =====================================================
-- KROK 3a: Napraw zduplikowane polityki SELECT
-- =====================================================
-- Ten skrypt naprawia tabele które już mają błędne polityki
-- z poprzedniego uruchomienia skryptów
-- =====================================================

-- =====================================================
-- AGENCIES
-- =====================================================
DROP POLICY IF EXISTS "agencies_admin_manage" ON agencies;
DROP POLICY IF EXISTS "agencies_select" ON agencies;

CREATE POLICY "agencies_select" ON agencies
FOR SELECT TO authenticated USING (true);

CREATE POLICY "agencies_insert" ON agencies
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "agencies_update" ON agencies
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "agencies_delete" ON agencies
FOR DELETE TO authenticated USING (is_admin());

-- =====================================================
-- MONTHLY_SHUNTER_AWARDS
-- =====================================================
DROP POLICY IF EXISTS "monthly_shunter_awards_admin" ON monthly_shunter_awards;
DROP POLICY IF EXISTS "monthly_shunter_awards_select" ON monthly_shunter_awards;

CREATE POLICY "monthly_shunter_awards_select" ON monthly_shunter_awards
FOR SELECT TO authenticated USING (true);

CREATE POLICY "monthly_shunter_awards_insert" ON monthly_shunter_awards
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "monthly_shunter_awards_update" ON monthly_shunter_awards
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "monthly_shunter_awards_delete" ON monthly_shunter_awards
FOR DELETE TO authenticated USING (is_admin());

-- =====================================================
-- SHUNTER_PERFORMANCE
-- =====================================================
DROP POLICY IF EXISTS "shunter_performance_admin" ON shunter_performance;
DROP POLICY IF EXISTS "shunter_performance_select" ON shunter_performance;

CREATE POLICY "shunter_performance_select" ON shunter_performance
FOR SELECT TO authenticated USING (true);

CREATE POLICY "shunter_performance_insert" ON shunter_performance
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "shunter_performance_update" ON shunter_performance
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "shunter_performance_delete" ON shunter_performance
FOR DELETE TO authenticated USING (is_admin());

-- =====================================================
-- BREAK_SLOT_CAPACITIES
-- =====================================================
DROP POLICY IF EXISTS "break_slot_capacities_manage" ON break_slot_capacities;
DROP POLICY IF EXISTS "break_slot_capacities_select" ON break_slot_capacities;

CREATE POLICY "break_slot_capacities_select" ON break_slot_capacities
FOR SELECT TO authenticated USING (true);

CREATE POLICY "break_slot_capacities_insert" ON break_slot_capacities
FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager());

CREATE POLICY "break_slot_capacities_update" ON break_slot_capacities
FOR UPDATE TO authenticated USING (is_admin_or_manager()) WITH CHECK (is_admin_or_manager());

CREATE POLICY "break_slot_capacities_delete" ON break_slot_capacities
FOR DELETE TO authenticated USING (is_admin_or_manager());

-- =====================================================
-- CUSTOM_BREAK_SLOTS
-- =====================================================
DROP POLICY IF EXISTS "custom_break_slots_manage" ON custom_break_slots;
DROP POLICY IF EXISTS "custom_break_slots_select" ON custom_break_slots;

CREATE POLICY "custom_break_slots_select" ON custom_break_slots
FOR SELECT TO authenticated USING (true);

CREATE POLICY "custom_break_slots_insert" ON custom_break_slots
FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager());

CREATE POLICY "custom_break_slots_update" ON custom_break_slots
FOR UPDATE TO authenticated USING (is_admin_or_manager()) WITH CHECK (is_admin_or_manager());

CREATE POLICY "custom_break_slots_delete" ON custom_break_slots
FOR DELETE TO authenticated USING (is_admin_or_manager());

-- =====================================================
-- SLOT_CONFIGURATIONS
-- =====================================================
DROP POLICY IF EXISTS "slot_configurations_admin" ON slot_configurations;
DROP POLICY IF EXISTS "slot_configurations_select" ON slot_configurations;

CREATE POLICY "slot_configurations_select" ON slot_configurations
FOR SELECT TO authenticated USING (true);

CREATE POLICY "slot_configurations_insert" ON slot_configurations
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "slot_configurations_update" ON slot_configurations
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "slot_configurations_delete" ON slot_configurations
FOR DELETE TO authenticated USING (is_admin());

-- =====================================================
-- SETTINGS
-- =====================================================
DROP POLICY IF EXISTS "settings_admin" ON settings;
DROP POLICY IF EXISTS "settings_select" ON settings;

CREATE POLICY "settings_select" ON settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "settings_insert" ON settings
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "settings_update" ON settings
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "settings_delete" ON settings
FOR DELETE TO authenticated USING (is_admin());

-- =====================================================
-- LOCATIONS
-- =====================================================
DROP POLICY IF EXISTS "locations_admin" ON locations;
DROP POLICY IF EXISTS "locations_select" ON locations;

CREATE POLICY "locations_select" ON locations
FOR SELECT TO authenticated USING (is_active = true OR is_admin());

CREATE POLICY "locations_insert" ON locations
FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "locations_update" ON locations
FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "locations_delete" ON locations
FOR DELETE TO authenticated USING (is_admin());

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('agencies', 'monthly_shunter_awards', 'shunter_performance', 
                  'break_slot_capacities', 'custom_break_slots', 'slot_configurations',
                  'settings', 'locations')
ORDER BY tablename, cmd;
