-- =====================================================
-- KROK 6: Napraw profiles, notifications, page_views, page_visits
-- =====================================================

-- =====================================================
-- 6.1 PROFILES
-- =====================================================
-- Obecne: 5 polityk, 2x UPDATE (duplikat!)
-- Problem: auth.uid() bez (select)
-- Uwaga: profiles.id = user_id (nie ma osobnej kolumny user_id)

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Wszyscy authenticated mogą czytać wszystkie profile
CREATE POLICY "profiles_select" ON profiles
FOR SELECT
TO authenticated
USING (true);

-- Użytkownik może dodać swój profil
CREATE POLICY "profiles_insert" ON profiles
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = id);

-- Użytkownik może edytować swój profil LUB admin może edytować każdy
CREATE POLICY "profiles_update" ON profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id OR is_admin())
WITH CHECK ((SELECT auth.uid()) = id OR is_admin());

-- Admin może usuwać profile
CREATE POLICY "profiles_delete" ON profiles
FOR DELETE
TO authenticated
USING (is_admin());

-- =====================================================
-- 6.2 NOTIFICATIONS
-- =====================================================
-- Obecne: 2 polityki (SELECT i UPDATE dla recipient_id)
-- Problem: auth.uid() bez (select)
-- Uwaga: używa recipient_id (nie user_id!)

DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

-- Użytkownik widzi swoje powiadomienia
CREATE POLICY "notifications_select" ON notifications
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = recipient_id);

-- Użytkownik może aktualizować swoje powiadomienia (np. mark as read)
CREATE POLICY "notifications_update" ON notifications
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = recipient_id)
WITH CHECK ((SELECT auth.uid()) = recipient_id);

-- =====================================================
-- 6.3 PAGE_VIEWS
-- =====================================================
-- Obecne: 2 polityki (INSERT dla user, SELECT dla admin)
-- Problem: auth.uid() bez (select), roles={public}

DROP POLICY IF EXISTS "insert_own_page_views" ON page_views;
DROP POLICY IF EXISTS "admin_view_page_views" ON page_views;

-- Użytkownik może dodawać swoje wizyty
CREATE POLICY "page_views_insert" ON page_views
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Admin może przeglądać wszystkie
CREATE POLICY "page_views_select" ON page_views
FOR SELECT
TO authenticated
USING (is_admin());

-- =====================================================
-- 6.4 PAGE_VISITS
-- =====================================================
-- Obecne: 2 polityki
-- Problem: auth.uid() bez (select)

DROP POLICY IF EXISTS "Users can insert their own page visits" ON page_visits;
DROP POLICY IF EXISTS "Admins can view all page visits" ON page_visits;

-- Użytkownik może dodawać swoje wizyty
CREATE POLICY "page_visits_insert" ON page_visits
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Admin może przeglądać wszystkie
CREATE POLICY "page_visits_select" ON page_visits
FOR SELECT
TO authenticated
USING (is_admin());

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'notifications', 'page_views', 'page_visits')
ORDER BY tablename, policyname;
