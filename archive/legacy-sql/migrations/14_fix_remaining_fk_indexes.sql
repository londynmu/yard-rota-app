-- =====================================================
-- KROK 14: Dodaj brakujące indeksy dla pozostałych FK
-- =====================================================
-- Po usunięciu "unused" indeksów, linter wykrył że niektóre
-- były potrzebne dla Foreign Keys. Dodajemy je z powrotem.
-- =====================================================

-- 1. monthly_shunter_awards.user_id
CREATE INDEX IF NOT EXISTS idx_monthly_shunter_awards_user_id 
ON public.monthly_shunter_awards(user_id);

-- 2. notifications.recipient_id
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id 
ON public.notifications(recipient_id);

-- 3. page_views.user_id
CREATE INDEX IF NOT EXISTS idx_page_views_user_id 
ON public.page_views(user_id);

-- 4. page_visits.user_id
CREATE INDEX IF NOT EXISTS idx_page_visits_user_id 
ON public.page_visits(user_id);

-- 5. shift_claims.slot_id
CREATE INDEX IF NOT EXISTS idx_shift_claims_slot_id 
ON public.shift_claims(slot_id);

-- 6. shift_claims.user_id
CREATE INDEX IF NOT EXISTS idx_shift_claims_user_id 
ON public.shift_claims(user_id);

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
