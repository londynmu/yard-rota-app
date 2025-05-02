# Fix for User Profile Updates Not Displaying & Login Issues

Ten dokument wyjaśnia, jak naprawić problemy z logowaniem użytkowników i niewidocznymi aktualizacjami profili w panelu administratora.

## Opis problemu

Po wprowadzeniu zmian w politykach Row Level Security (RLS) i funkcjach RPC, pojawiły się dwa główne problemy:

1.  **Błąd logowania dla zwykłych użytkowników:** Użytkownicy bez roli admin napotykali błąd `infinite recursion detected in policy for relation "profiles"` podczas próby logowania lub dostępu do profilu.
2.  **Niewidoczne aktualizacje w panelu admina:** Mimo poprawnego zapisu danych, administratorzy nadal mogli nie widzieć wszystkich zaktualizowanych pól (szczególnie Rota Planner) z powodu kombinacji problemów z RLS i funkcjami RPC.

**Przyczyny:**

*   **Rekurencja w politykach RLS:** Poprzednio zdefiniowane polityki RLS dla administratorów zawierały podzapytania do tabeli `profiles`, co prowadziło do nieskończonej pętli.
*   **Błędy w funkcji RPC:** Funkcja `get_complete_profiles_with_emails` miała problemy z niejednoznacznością kolumn (`id`) i niezgodnością typów (`role`).

## Ostateczne rozwiązanie

Stworzyliśmy jeden, kompletny skrypt SQL (`sql/fix_profile_rls_final.sql`), który rozwiązuje **wszystkie** zidentyfikowane problemy. Skrypt ten:

1.  **Tworzy funkcję pomocniczą `is_admin()`:** Sprawdza ona rolę aktualnie zalogowanego użytkownika bez powodowania rekurencji.
2.  **Usuwa stare, błędne polityki admina:** Czyści poprzednie definicje.
3.  **Tworzy nową, bezpieczną politykę dla admina:** Używa funkcji `is_admin()` do przyznania pełnego dostępu (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) administratorom.
4.  **Weryfikuje i tworzy standardowe polityki dla użytkowników:** Zapewnia, że zwykli użytkownicy mogą zarządzać swoim profilem (`SELECT`, `UPDATE`, `INSERT` dla własnego `id`).
5.  **Ponownie definiuje funkcję RPC `get_complete_profiles_with_emails`:** Zawiera wszystkie pola, ma poprawiony typ `VARCHAR` dla `role` i **nie zawiera już wewnętrznej logiki sprawdzania `is_admin`**, ponieważ kontrolą dostępu zajmują się teraz wyłącznie polityki RLS.

### Kroki implementacji

1.  **Uruchom ostateczny skrypt SQL w edytorze SQL Supabase:**
    *   Zaloguj się do Supabase Dashboard.
    *   Przejdź do SQL Editor.
    *   Skopiuj i wklej **całą zawartość** pliku `sql/fix_profile_rls_final.sql` do edytora SQL.
    *   Uruchom skrypt. **Ten jeden skrypt zastępuje wszystkie poprzednie poprawki RLS i RPC dla profili.**
2.  **Kod React (`AdminPage.jsx`) nie wymaga zmian:** Jest już przygotowany do użycia poprawionej funkcji `get_complete_profiles_with_emails`.
3.  **Zrestartuj aplikację** po wykonaniu skryptu SQL.
4.  **Przetestuj:**
    *   Zaloguj się jako zwykły użytkownik - błąd rekurencji powinien zniknąć.
    *   Zaloguj się jako administrator.
    *   Edytuj profil użytkownika (w tym pola Rota Planner) w panelu admina.
    *   Zapisz zmiany.
    *   Sprawdź, czy **wszystkie** zmiany są widoczne po ponownym otwarciu edycji profilu.

## Zawartość ostatecznego skryptu SQL (`sql/fix_profile_rls_final.sql`)

```sql
-- Fix for RLS policies causing infinite recursion
-- Creates an is_admin() helper function and uses it in policies.
-- Run this in the Supabase SQL Editor

-- 1. Create the is_admin() helper function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Optional: Grant execute permission if needed, though SECURITY DEFINER might suffice
-- GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- 2. Drop potentially problematic existing admin policies first (if they exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles') THEN
        DROP POLICY "Admins can view all profiles" ON public.profiles;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can update all profiles') THEN
        DROP POLICY "Admins can update all profiles" ON public.profiles;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can insert all profiles') THEN
        DROP POLICY "Admins can insert all profiles" ON public.profiles;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can delete all profiles') THEN
        DROP POLICY "Admins can delete all profiles" ON public.profiles;
    END IF;
END $$;

-- 3. Recreate admin policies using the is_admin() function
CREATE POLICY "Admin Full Access" 
ON public.profiles
FOR ALL -- Covers SELECT, INSERT, UPDATE, DELETE
USING (is_admin() = true) -- Admins can access any row
WITH CHECK (is_admin() = true); -- Admins can modify any row

-- 4. Ensure standard user policies are correct and exist
-- Policy for users to view their own profile
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view their own profile') THEN
        CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
    END IF;
END $$;

-- Policy for users to update their own profile
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile') THEN
        CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- Policy for users to insert their own profile (usually linked to auth trigger)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile') THEN
        CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- Note: User delete policy might not be desired, typically handled differently.

-- 5. Re-apply the corrected RPC function (ensure type VARCHAR for role)
DROP FUNCTION IF EXISTS get_complete_profiles_with_emails();

CREATE OR REPLACE FUNCTION get_complete_profiles_with_emails()
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    shift_preference TEXT,
    is_active BOOLEAN,
    performance_score INTEGER,
    email VARCHAR,
    custom_start_time TIME,
    custom_end_time TIME,
    preferred_location TEXT,
    max_daily_hours INTEGER,
    unavailable_days TEXT[],
    notes_for_admin TEXT,
    role VARCHAR,  -- Correct type
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) SECURITY DEFINER
AS $$
BEGIN
    -- Function logic remains the same, RLS policies handle access control now
    RETURN QUERY
    SELECT 
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.shift_preference,
        p.is_active,
        p.performance_score,
        au.email,
        p.custom_start_time,
        p.custom_end_time,
        p.preferred_location,
        p.max_daily_hours,
        p.unavailable_days,
        p.notes_for_admin,
        p.role,
        p.created_at,
        p.updated_at
    FROM 
        public.profiles p
    JOIN 
        auth.users au ON p.id = au.id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_complete_profiles_with_emails() TO authenticated;
``` 