-- Sync prod-only migration enable_rls_app_config (applied 2026-11-05 as
-- version 20261105142010 outside this repo). Idempotent: safe if already on.
-- Enables RLS on public.app_config; SELECT for authenticated; writes via is_admin().

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_select ON public.app_config;
DROP POLICY IF EXISTS app_config_insert ON public.app_config;
DROP POLICY IF EXISTS app_config_update ON public.app_config;
DROP POLICY IF EXISTS app_config_delete ON public.app_config;

CREATE POLICY app_config_select
  ON public.app_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY app_config_insert
  ON public.app_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY app_config_update
  ON public.app_config
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY app_config_delete
  ON public.app_config
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
