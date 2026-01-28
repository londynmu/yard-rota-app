# RLS & Database Performance Fix - Step by Step

## Problem
Supabase linter wykrył:
- 64 ostrzeżenia `auth_rls_initplan` (WARN) ✅ NAPRAWIONE
- 44 ostrzeżenia `multiple_permissive_policies` (WARN) ✅ NAPRAWIONE
- 3 info `unindexed_foreign_keys` (INFO)
- 28 info `unused_index` (INFO)
- 1 info `auth_db_connections_absolute` (INFO)

## Rozwiązanie - Uruchom skrypty w kolejności

Każdy skrypt uruchom osobno w **Supabase Dashboard > SQL Editor**:

### CZĘŚĆ A: Naprawy RLS (WARN)

#### Krok 2: Funkcje pomocnicze
```
02_fix_helper_functions.sql
```
Tworzy zoptymalizowane `is_admin()` i `is_admin_or_manager()`.

#### Krok 3a: Napraw zduplikowane SELECT (jeśli uruchomiłeś 03-05)
```
03a_fix_duplicate_select.sql
```
Naprawia błędy z FOR ALL vs FOR SELECT.

### CZĘŚĆ B: Optymalizacja indeksów (INFO)

#### Krok 12: Dodaj brakujące indeksy dla Foreign Keys
```
12_add_missing_fk_indexes.sql
```
Dodaje indeksy dla: `awarded_by`, `agency_id`, `assigned_by`

#### Krok 13: Usuń nieużywane indeksy
```
13_remove_unused_indexes.sql
```
Usuwa 28 nieużywanych indeksów (oszczędza miejsce i przyspiesza INSERT/UPDATE)

### CZĘŚĆ C: Auth DB Connections (INFO)

To ustawia się w dashboardzie, nie przez SQL:
1. Idź do **Project Settings > Auth**
2. Znajdź sekcję **Database Pool Connections**
3. Zmień strategię na **Percentage** zamiast absolutnej liczby

## Weryfikacja końcowa

Po uruchomieniu wszystkich skryptów, sprawdź linter:
**Database > Linter** - powinno pokazać 0 WARN i mniej INFO.

## Co naprawiliśmy?

1. **auth_rls_initplan**: `auth.uid()` -> `(SELECT auth.uid())`
2. **multiple_permissive_policies**: Konsolidacja duplikatów, FOR ALL -> osobne polityki
3. **roles={public}**: Zmiana na `TO authenticated`
4. **unindexed_foreign_keys**: Dodanie indeksów dla FK
5. **unused_index**: Usunięcie nieużywanych indeksów
