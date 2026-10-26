-- ============================================
-- BACKUP: Stare polityki RLS na tabeli profiles
-- Data utworzenia: 2026-01-28
-- ============================================
-- Użyj tego pliku jeśli nowe polityki powodują problemy
-- Najpierw usuń nowe polityki, potem uruchom ten plik
-- ============================================

-- Najpierw usuń nowe polityki (jeśli istnieją)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

-- ============================================
-- PRZYWRÓĆ STARE POLITYKI
-- ============================================

-- 1. Admin Full Access
CREATE POLICY "Admin Full Access"
ON public.profiles
FOR ALL
TO public
USING (is_admin() = true)
WITH CHECK (is_admin() = true);

-- 2. Admins can delete any profile
CREATE POLICY "Admins can delete any profile"
ON public.profiles
FOR DELETE
TO public
USING (EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((auth.uid() = users.id) AND (users.is_super_admin = true))));

-- 3. Admins can update any profile
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO public
USING (EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((auth.uid() = users.id) AND (users.is_super_admin = true))));

-- 4. Allow admin read access on profiles
CREATE POLICY "Allow admin read access on profiles"
ON public.profiles
FOR SELECT
TO public
USING (is_admin() = true);

-- 5. Allow authenticated users to view team member names
CREATE POLICY "Allow authenticated users to view team member names"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 6. Allow reading all profiles
CREATE POLICY "Allow reading all profiles"
ON public.profiles
FOR SELECT
TO public
USING (true);

-- 7. Allow users read own profile
CREATE POLICY "Allow users read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 8. Allow users update own profile
CREATE POLICY "Allow users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 9. Anyone can update profiles during registration (UWAGA: to było NIEBEZPIECZNE!)
-- CREATE POLICY "Anyone can update profiles during registration"
-- ON public.profiles
-- FOR UPDATE
-- TO public
-- USING (true);
-- ^^ ZAKOMENTOWANE - ta polityka była zbyt permisywna!

-- 10. Każdy może odczytać dane profilu
CREATE POLICY "Każdy może odczytać dane profilu"
ON public.profiles
FOR SELECT
TO public
USING (auth.role() = 'authenticated'::text);

-- 11. Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (auth.uid() = id);

-- 12. Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 13. Users can view all profiles
CREATE POLICY "Users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 14. Użytkownicy mogą edytować tylko swoje profile
CREATE POLICY "Użytkownicy mogą edytować tylko swoje profile"
ON public.profiles
FOR UPDATE
TO public
USING (auth.uid() = id);

-- 15. authenticated_users_can_view_team_profiles
CREATE POLICY "authenticated_users_can_view_team_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- ============================================
-- UWAGA: Polityka "Anyone can update profiles during registration"
-- była NIEBEZPIECZNA i pozwalała każdemu edytować dowolny profil!
-- Jeśli przywracasz stare polityki, NIE przywracaj tej jednej.
-- ============================================
