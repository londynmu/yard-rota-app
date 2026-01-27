# Security Issues Fix - Instructions

## 🔒 Problemy do naprawienia

Linter Supabase wykrył trzy problemy bezpieczeństwa:

### 1. **View `user_availability` z SECURITY DEFINER**
- **Problem**: View jest zdefiniowany z właściwością SECURITY DEFINER, co oznacza, że używa uprawnień twórcy view zamiast użytkownika wykonującego zapytanie
- **Ryzyko**: Może ominąć polityki RLS
- **Rozwiązanie**: Usunąć SECURITY DEFINER i używać domyślnego SECURITY INVOKER

### 2. **Tabela `monthly_shunter_awards` bez RLS**
- **Problem**: Tabela jest publiczna, ale nie ma włączonego Row Level Security
- **Ryzyko**: Brak kontroli dostępu - każdy zalogowany użytkownik może modyfikować dane
- **Rozwiązanie**: Włączyć RLS i dodać polityki

### 3. **Tabela `imported_reports` bez RLS**
- **Problem**: Tabela jest publiczna, ale nie ma włączonego Row Level Security  
- **Ryzyko**: Brak kontroli dostępu
- **Rozwiązanie**: Włączyć RLS i dodać polityki (tylko dla adminów)

## 📋 Jak naprawić

### Krok 1: Otwórz Supabase SQL Editor

1. Zaloguj się do [Supabase Dashboard](https://app.supabase.com)
2. Wybierz projekt `yard-rota-app`
3. Przejdź do **SQL Editor** w lewym menu

### Krok 2: Wykonaj skrypt naprawczy

1. Otwórz plik **`fix_security_issues.sql`** w edytorze kodu
2. Skopiuj **całą zawartość** pliku
3. Wklej do SQL Editor w Supabase
4. Kliknij **RUN** lub naciśnij `Ctrl+Enter` / `Cmd+Enter`

### Krok 3: Weryfikacja

Po wykonaniu skryptu, uruchom te zapytania weryfikacyjne w SQL Editor:

#### Sprawdź czy `user_availability` nie ma już SECURITY DEFINER:
```sql
SELECT 
    viewname, 
    definition 
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'user_availability';
```

#### Sprawdź czy RLS jest włączony na `monthly_shunter_awards`:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'monthly_shunter_awards';
```
Wynik powinien pokazać: `rowsecurity: true`

#### Sprawdź polityki na `monthly_shunter_awards`:
```sql
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'monthly_shunter_awards';
```
Powinno być 4 polityki:
- Anyone can view monthly awards (SELECT)
- Admins can insert monthly awards (INSERT)
- Admins can update monthly awards (UPDATE)
- Admins can delete monthly awards (DELETE)

#### Sprawdź czy RLS jest włączony na `imported_reports` (jeśli tabela istnieje):
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'imported_reports';
```

### Krok 4: Ponownie uruchom linter

1. W Supabase Dashboard przejdź do **Database** → **Linter**
2. Kliknij **Run linter**
3. Sprawdź czy błędy zniknęły

## 🛡️ Co zostało naprawione

### ✅ View `user_availability`
- **Przed**: View z SECURITY DEFINER (używa uprawnień twórcy)
- **Po**: View bez SECURITY DEFINER (używa uprawnień użytkownika wykonującego query)
- **Efekt**: View teraz respektuje polityki RLS z tabel `availability` i `profiles`

### ✅ Tabela `monthly_shunter_awards`
- **Przed**: Brak RLS - każdy mógł modyfikować
- **Po**: RLS włączony + 4 polityki
  - Wszyscy zalogowani mogą **przeglądać** nagrody (leaderboard jest publiczny)
  - Tylko **admini** mogą **dodawać/edytować/usuwać** nagrody

### ✅ Tabela `imported_reports`
- **Przed**: Brak RLS (jeśli tabela istnieje)
- **Po**: RLS włączony + 4 polityki
  - Tylko **admini** mogą **przeglądać/dodawać/edytować/usuwać** raporty importu

## 📝 Uwagi techniczne

### Dlaczego `monthly_shunter_awards` ma publiczny SELECT?
System "Shunter of the Month" to **leaderboard** - wszyscy użytkownicy powinni widzieć zwycięzców. Tylko admini mogą przyznawać nagrody, ale lista nagrodzonych jest publiczna dla wszystkich zalogowanych użytkowników.

### Dlaczego `imported_reports` jest tylko dla adminów?
Historia importów CSV to funkcja **administracyjna**. Zwykli użytkownicy nie powinni widzieć szczegółów importu danych (kto, kiedy, jakie pliki).

### Co z tabelą `shunter_performance`?
Ta tabela **już ma** prawidłowe polityki RLS (utworzone w migracji `add_shunter_performance_system.sql`):
- Wszyscy mogą przeglądać (leaderboard)
- Tylko admini mogą modyfikować

## 🔄 Jeśli coś pójdzie nie tak

### Rollback dla view:
```sql
-- Jeśli pojawią się problemy z view, można go usunąć i odtworzyć:
DROP VIEW IF EXISTS public.user_availability CASCADE;

CREATE VIEW public.user_availability AS
SELECT 
    a.id, a.user_id, a.date, a.status, a.comment, 
    a.created_at, a.updated_at,
    p.first_name, p.last_name, p.shift_preference, p.avatar_url
FROM public.availability a
LEFT JOIN public.profiles p ON a.user_id = p.id;

GRANT SELECT ON public.user_availability TO authenticated;
```

### Rollback dla RLS:
```sql
-- Jeśli polityki powodują problemy, można je usunąć:
ALTER TABLE public.monthly_shunter_awards DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view monthly awards" ON public.monthly_shunter_awards;
DROP POLICY IF EXISTS "Admins can insert monthly awards" ON public.monthly_shunter_awards;
DROP POLICY IF EXISTS "Admins can update monthly awards" ON public.monthly_shunter_awards;
DROP POLICY IF EXISTS "Admins can delete monthly awards" ON public.monthly_shunter_awards;
```

## ✅ Checklist

- [ ] Skopiowano plik `fix_security_issues.sql`
- [ ] Wykonano skrypt w Supabase SQL Editor
- [ ] Zweryfikowano że view `user_availability` nie ma SECURITY DEFINER
- [ ] Zweryfikowano że RLS jest włączony na `monthly_shunter_awards`
- [ ] Zweryfikowano polityki na `monthly_shunter_awards`
- [ ] Ponownie uruchomiono linter w Supabase
- [ ] Wszystkie błędy bezpieczeństwa zostały naprawione

## 🎯 Oczekiwany rezultat

Po wykonaniu tych kroków, linter Supabase **nie powinien już pokazywać** tych trzech błędów:
- ✅ `security_definer_view` dla `user_availability`
- ✅ `rls_disabled_in_public` dla `monthly_shunter_awards`
- ✅ `rls_disabled_in_public` dla `imported_reports`

## 📞 Pomoc

Jeśli napotkasz problemy:
1. Sprawdź logi w SQL Editor (czerwony tekst na dole)
2. Sprawdź czy jesteś zalogowany jako właściciel projektu (owner)
3. Sprawdź czy masz uprawnienia do modyfikacji schemy






