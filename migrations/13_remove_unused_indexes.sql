-- =====================================================
-- KROK 13: Usuń nieużywane indeksy
-- =====================================================
-- UWAGA: Te indeksy nigdy nie były używane, ale przed usunięciem
-- upewnij się że aplikacja działa poprawnie bez nich.
-- Możesz uruchomić to w częściach jeśli wolisz być ostrożny.
-- =====================================================

-- =====================================================
-- CZĘŚĆ 1: Indeksy na tabelach page_views/page_visits
-- (prawdopodobnie bezpieczne do usunięcia - tabele analityczne)
-- =====================================================
DROP INDEX IF EXISTS public.idx_page_views_page_path;
DROP INDEX IF EXISTS public.idx_page_views_session_id;
DROP INDEX IF EXISTS public.idx_page_views_user_email;
DROP INDEX IF EXISTS public.idx_page_views_user_id;
DROP INDEX IF EXISTS public.idx_page_views_visited_at;
DROP INDEX IF EXISTS public.idx_page_visits_page_path;
DROP INDEX IF EXISTS public.idx_page_visits_session_id;
DROP INDEX IF EXISTS public.idx_page_visits_user_id;
DROP INDEX IF EXISTS public.idx_page_visits_visited_at;

-- =====================================================
-- CZĘŚĆ 2: Indeksy na notifications
-- =====================================================
DROP INDEX IF EXISTS public.idx_notifications_is_read;
DROP INDEX IF EXISTS public.idx_notifications_recipient_id;

-- =====================================================
-- CZĘŚĆ 3: Indeksy na break tables
-- =====================================================
DROP INDEX IF EXISTS public.idx_break_slot_capacities_date_shift_location;
DROP INDEX IF EXISTS public.idx_custom_break_slots_date_shift_location;
DROP INDEX IF EXISTS public.idx_scheduled_breaks_location;
DROP INDEX IF EXISTS public.idx_scheduled_breaks_std_slot;

-- =====================================================
-- CZĘŚĆ 4: Indeksy na profiles
-- =====================================================
DROP INDEX IF EXISTS public.idx_profiles_location;
DROP INDEX IF EXISTS public.idx_profiles_yard_system_id;

-- =====================================================
-- CZĘŚĆ 5: Indeksy na scheduled_rota
-- =====================================================
DROP INDEX IF EXISTS public.idx_scheduled_rota_status;
DROP INDEX IF EXISTS public.idx_scheduled_rota_temp_user_id;
DROP INDEX IF EXISTS public.scheduled_rota_location_idx;

-- =====================================================
-- CZĘŚĆ 6: Indeksy na shift_claims
-- =====================================================
DROP INDEX IF EXISTS public.idx_shift_claims_slot_state;
DROP INDEX IF EXISTS public.idx_shift_claims_user;

-- =====================================================
-- CZĘŚĆ 7: Indeksy na shunter_performance
-- =====================================================
DROP INDEX IF EXISTS public.idx_shunter_performance_date_range;
DROP INDEX IF EXISTS public.idx_shunter_performance_user_id;

-- =====================================================
-- CZĘŚĆ 8: Pozostałe
-- =====================================================
DROP INDEX IF EXISTS public.idx_slot_config_shift;
DROP INDEX IF EXISTS public.idx_templates_name;
DROP INDEX IF EXISTS public.monthly_shunter_awards_user_idx;

-- =====================================================
-- WERYFIKACJA - pokaż pozostałe indeksy
-- =====================================================
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
