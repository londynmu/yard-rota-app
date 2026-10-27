CREATE OR REPLACE FUNCTION public.get_user_last_login(uid uuid)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT MAX(created_at) FROM auth.user_logins WHERE user_id = uid;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_last_login(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_last_login(uuid) TO service_role; 