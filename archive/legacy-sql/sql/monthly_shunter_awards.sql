-- Monthly Shunter Awards
-- NOTE: This file only defines the schema. Run it manually in Supabase/Postgres.
-- User rule: "sql ja wklejam do bazy danych , ty mi tylko dajesz kod".

DO $$
BEGIN
  -- Create table only if it does not exist yet
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'monthly_shunter_awards'
  ) THEN
    CREATE TABLE public.monthly_shunter_awards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- User who received the award
      user_id UUID NOT NULL
        REFERENCES public.profiles (id)
        ON DELETE SET NULL,

      -- Month for which the award applies (store as first day of month, e.g. 2025-11-01)
      award_month DATE NOT NULL,

      -- 'day' or 'night' – exactly one Day and one Night winner per month (for whole company)
      period TEXT NOT NULL
        CHECK (period IN ('day', 'night')),

      -- Award amount (default £50)
      amount NUMERIC(10, 2) NOT NULL DEFAULT 50,

      -- When the award record was created
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      -- (Optional) admin who granted the award – only for logs, never shown in UI
      awarded_by UUID
        REFERENCES auth.users (id)
        ON DELETE SET NULL
    );

    -- Exactly one Day and one Night award per month for the whole company
    CREATE UNIQUE INDEX monthly_shunter_awards_unique_month_period
      ON public.monthly_shunter_awards (award_month, period);

    -- Fast lookup of last award per user
    CREATE INDEX monthly_shunter_awards_user_idx
      ON public.monthly_shunter_awards (user_id, award_month DESC, period);

    COMMENT ON TABLE public.monthly_shunter_awards IS
      'Monthly Shunter of the Month awards – one Day and one Night winner per month for the whole company.';

    COMMENT ON COLUMN public.monthly_shunter_awards.user_id IS
      'Profile ID of the user who received the award.';

    COMMENT ON COLUMN public.monthly_shunter_awards.award_month IS
      'Month (stored as first day of the month) for which the award applies, e.g. 2025-11-01.';

    COMMENT ON COLUMN public.monthly_shunter_awards.period IS
      'Award period: day or night.';

    COMMENT ON COLUMN public.monthly_shunter_awards.amount IS
      'Award amount in GBP (default 50).';

    COMMENT ON COLUMN public.monthly_shunter_awards.awarded_at IS
      'Timestamp when this award record was created.';

    COMMENT ON COLUMN public.monthly_shunter_awards.awarded_by IS
      'Admin user (auth.users.id) who granted the award. Used only for logs, never exposed in UI.';

    -- Enable Row Level Security
    ALTER TABLE public.monthly_shunter_awards ENABLE ROW LEVEL SECURITY;

    -- Policy: All authenticated users can view all awards (public leaderboard)
    CREATE POLICY "Anyone can view monthly awards"
        ON public.monthly_shunter_awards
        FOR SELECT
        TO authenticated
        USING (true);

    -- Policy: Only admins can insert awards
    CREATE POLICY "Admins can insert monthly awards"
        ON public.monthly_shunter_awards
        FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid()
                AND profiles.role = 'admin'
            )
        );

    -- Policy: Only admins can update awards
    CREATE POLICY "Admins can update monthly awards"
        ON public.monthly_shunter_awards
        FOR UPDATE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid()
                AND profiles.role = 'admin'
            )
        );

    -- Policy: Only admins can delete awards
    CREATE POLICY "Admins can delete monthly awards"
        ON public.monthly_shunter_awards
        FOR DELETE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE profiles.id = auth.uid()
                AND profiles.role = 'admin'
            )
        );

    -- Grant permissions
    GRANT SELECT ON public.monthly_shunter_awards TO authenticated;

    RAISE NOTICE 'Table monthly_shunter_awards created with RLS policies';
  END IF;
END $$;


