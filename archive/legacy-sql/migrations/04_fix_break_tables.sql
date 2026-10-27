-- =====================================================
-- KROK 4: Napraw tabele break (admin/manager)
-- =====================================================
-- Tabele: break_slot_capacities, custom_break_slots, slot_configurations
-- =====================================================

-- =====================================================
-- 4.1 BREAK_SLOT_CAPACITIES
-- =====================================================
-- Obecne: 4 polityki (SELECT dla wszystkich, reszta dla admin/manager)
-- Problem: auth.uid() bez (select), roles={public}

DROP POLICY IF EXISTS "Enable delete for admin and manager" ON break_slot_capacities;
DROP POLICY IF EXISTS "Enable insert for admin and manager" ON break_slot_capacities;
DROP POLICY IF EXISTS "Enable read access for all users" ON break_slot_capacities;
DROP POLICY IF EXISTS "Enable update for admin and manager" ON break_slot_capacities;
DROP POLICY IF EXISTS "break_slot_capacities_select" ON break_slot_capacities;
DROP POLICY IF EXISTS "break_slot_capacities_manage" ON break_slot_capacities;

-- Wszyscy authenticated mogą czytać
CREATE POLICY "break_slot_capacities_select" ON break_slot_capacities
FOR SELECT
TO authenticated
USING (true);

-- Admin/Manager mogą INSERT
CREATE POLICY "break_slot_capacities_insert" ON break_slot_capacities
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_manager());

-- Admin/Manager mogą UPDATE
CREATE POLICY "break_slot_capacities_update" ON break_slot_capacities
FOR UPDATE
TO authenticated
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- Admin/Manager mogą DELETE
CREATE POLICY "break_slot_capacities_delete" ON break_slot_capacities
FOR DELETE
TO authenticated
USING (is_admin_or_manager());

-- =====================================================
-- 4.2 CUSTOM_BREAK_SLOTS
-- =====================================================
-- Obecne: 4 polityki
-- Problem: auth.uid() bez (select), roles={public}

DROP POLICY IF EXISTS "Enable delete for admin and manager" ON custom_break_slots;
DROP POLICY IF EXISTS "Enable insert for admin and manager" ON custom_break_slots;
DROP POLICY IF EXISTS "Enable read access for all users" ON custom_break_slots;
DROP POLICY IF EXISTS "Enable update for admin and manager" ON custom_break_slots;
DROP POLICY IF EXISTS "custom_break_slots_select" ON custom_break_slots;
DROP POLICY IF EXISTS "custom_break_slots_manage" ON custom_break_slots;

-- Wszyscy authenticated mogą czytać
CREATE POLICY "custom_break_slots_select" ON custom_break_slots
FOR SELECT
TO authenticated
USING (true);

-- Admin/Manager mogą INSERT
CREATE POLICY "custom_break_slots_insert" ON custom_break_slots
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_manager());

-- Admin/Manager mogą UPDATE
CREATE POLICY "custom_break_slots_update" ON custom_break_slots
FOR UPDATE
TO authenticated
USING (is_admin_or_manager())
WITH CHECK (is_admin_or_manager());

-- Admin/Manager mogą DELETE
CREATE POLICY "custom_break_slots_delete" ON custom_break_slots
FOR DELETE
TO authenticated
USING (is_admin_or_manager());

-- =====================================================
-- 4.3 SLOT_CONFIGURATIONS
-- =====================================================
-- Obecne: 2 polityki (ALL dla admin, SELECT dla authenticated)
-- Problem: auth.uid() bez (select), zduplikowane SELECT

DROP POLICY IF EXISTS "Admins can manage slot configurations" ON slot_configurations;
DROP POLICY IF EXISTS "All users can view slot configurations" ON slot_configurations;
DROP POLICY IF EXISTS "slot_configurations_select" ON slot_configurations;
DROP POLICY IF EXISTS "slot_configurations_admin" ON slot_configurations;

-- Wszyscy authenticated mogą czytać
CREATE POLICY "slot_configurations_select" ON slot_configurations
FOR SELECT
TO authenticated
USING (true);

-- Admini mogą INSERT
CREATE POLICY "slot_configurations_insert" ON slot_configurations
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Admini mogą UPDATE
CREATE POLICY "slot_configurations_update" ON slot_configurations
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Admini mogą DELETE
CREATE POLICY "slot_configurations_delete" ON slot_configurations
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('break_slot_capacities', 'custom_break_slots', 'slot_configurations')
ORDER BY tablename, policyname;
