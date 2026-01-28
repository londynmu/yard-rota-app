-- =====================================================
-- KROK 12: Dodaj brakujące indeksy dla Foreign Keys
-- =====================================================
-- Problem: Foreign keys bez indeksów spowalniają JOIN i DELETE
-- =====================================================

-- 1. monthly_shunter_awards.awarded_by -> profiles.id
-- Najpierw sprawdźmy nazwę kolumny
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'monthly_shunter_awards' 
        AND indexname = 'idx_monthly_shunter_awards_awarded_by'
    ) THEN
        CREATE INDEX idx_monthly_shunter_awards_awarded_by 
        ON public.monthly_shunter_awards(awarded_by);
    END IF;
END $$;

-- 2. profiles.agency_id -> agencies.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'profiles' 
        AND indexname = 'idx_profiles_agency_id'
    ) THEN
        CREATE INDEX idx_profiles_agency_id 
        ON public.profiles(agency_id);
    END IF;
END $$;

-- 3. scheduled_breaks.assigned_by -> profiles.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'scheduled_breaks' 
        AND indexname = 'idx_scheduled_breaks_assigned_by'
    ) THEN
        CREATE INDEX idx_scheduled_breaks_assigned_by 
        ON public.scheduled_breaks(assigned_by);
    END IF;
END $$;

-- =====================================================
-- WERYFIKACJA
-- =====================================================
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN (
    'idx_monthly_shunter_awards_awarded_by',
    'idx_profiles_agency_id',
    'idx_scheduled_breaks_assigned_by'
);
