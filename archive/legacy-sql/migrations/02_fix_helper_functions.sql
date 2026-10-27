-- =====================================================
-- KROK 2: Napraw funkcje pomocnicze is_admin()
-- =====================================================
-- Problem: is_admin() może używać auth.uid() bez (select ...)
-- Rozwiązanie: Zastąp funkcję zoptymalizowaną wersją
-- UWAGA: Używamy CREATE OR REPLACE - NIE DROP (bo inne polityki zależą od funkcji)
-- =====================================================

-- Utwórz/zaktualizuj zoptymalizowaną funkcję is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
    AND role = 'admin'
  );
$$;

-- Nadaj uprawnienia
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Opcjonalnie: funkcja is_admin_or_manager()
-- UWAGA: Używamy CREATE OR REPLACE - NIE DROP
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
    AND role IN ('admin', 'manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO anon;

-- =====================================================
-- WERYFIKACJA: Sprawdź czy funkcje działają
-- =====================================================
-- SELECT is_admin();
-- SELECT is_admin_or_manager();
