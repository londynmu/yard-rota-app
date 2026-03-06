-- =====================================================
-- System Activity Log - audit trail for Rota & Breaks
-- Append-only: who, what, when (no UPDATE/DELETE policies)
-- =====================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.system_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('rota', 'breaks')),
  action_type text NOT NULL,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_activity_log IS 'Append-only audit log for Rota Planner and Breaks changes. No UPDATE/DELETE policies.';

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_system_activity_entity_created
  ON public.system_activity_log(entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_activity_user_created
  ON public.system_activity_log(user_id, created_at DESC);

-- 3. RLS: enable, SELECT admin only, INSERT authenticated (own user_id only). No UPDATE/DELETE.
ALTER TABLE public.system_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_activity_log_select"
  ON public.system_activity_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "system_activity_log_insert"
  ON public.system_activity_log
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 4. RPC: get_system_activity_log (admin only, returns rows with profile names)
CREATE OR REPLACE FUNCTION public.get_system_activity_log(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 500,
  entity_type_filter text DEFAULT NULL,
  user_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  entity_type text,
  action_type text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz,
  time_ago text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can read system activity log';
  END IF;

  RETURN QUERY
  SELECT
    sal.id,
    sal.user_id,
    p.first_name,
    p.last_name,
    sal.entity_type,
    sal.action_type,
    sal.entity_id,
    sal.payload,
    sal.created_at,
    CASE
      WHEN sal.created_at > now() - interval '1 hour' THEN
        EXTRACT(MINUTE FROM now() - sal.created_at)::integer::text || ' min ago'
      WHEN sal.created_at > now() - interval '24 hours' THEN
        EXTRACT(HOUR FROM now() - sal.created_at)::integer::text || ' h ago'
      ELSE
        EXTRACT(DAY FROM now() - sal.created_at)::integer::text || ' days ago'
    END
  FROM public.system_activity_log sal
  LEFT JOIN public.profiles p ON p.id = sal.user_id
  WHERE sal.created_at >= now() - (days_back || ' days')::interval
    AND (entity_type_filter IS NULL OR sal.entity_type = entity_type_filter)
    AND (user_id_filter IS NULL OR sal.user_id = user_id_filter)
  ORDER BY sal.created_at DESC
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_activity_log(integer, integer, text, uuid) TO authenticated;
