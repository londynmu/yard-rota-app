-- =====================================================
-- SKRYPT DIAGNOSTYCZNY - KROK 1
-- Uruchom w Supabase SQL Editor
-- =====================================================

-- 1. LISTA WSZYSTKICH TABEL Z WŁĄCZONYM RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true
ORDER BY tablename;

-- 2. STRUKTURA TABEL (kolumny) - dla tabel z problemami RLS
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c 
    ON t.table_name = c.table_name 
    AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public'
AND t.table_name IN (
    'profiles',
    'availability', 
    'scheduled_rota',
    'scheduled_breaks',
    'locations',
    'settings',
    'agencies',
    'imported_reports',
    'monthly_shunter_awards',
    'shunter_performance',
    'slot_configurations',
    'shift_claims',
    'page_visits',
    'page_views',
    'notifications',
    'break_slot_capacities',
    'custom_break_slots',
    'rota_templates',
    'user_day_notes'
)
ORDER BY t.table_name, c.ordinal_position;

-- 3. WSZYSTKIE ISTNIEJĄCE POLITYKI RLS
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. LICZBA POLITYK PER TABELA/AKCJA (identyfikacja duplikatów)
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
