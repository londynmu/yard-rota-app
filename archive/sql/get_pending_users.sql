CREATE OR REPLACE FUNCTION public.get_pending_users()
 RETURNS TABLE (
    id uuid,
    email text,
    first_name text,
    last_name text,
    account_status text,
    shift_preference text,
    preferred_location text,
    created_at timestamptz,
    updated_at timestamptz
 ) 
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    u.email,
    p.first_name,
    p.last_name,
    p.account_status,
    p.shift_preference,
    p.preferred_location,
    p.created_at,
    p.updated_at
  FROM
    public.profiles p
  JOIN
    auth.users u ON p.id = u.id
  WHERE
    p.account_status = 'pending_approval'
  ORDER BY
    p.created_at DESC;
END;
$function$;

-- Permission: This function is security definer, but we need to grant execution permission
GRANT EXECUTE ON FUNCTION public.get_pending_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_users() TO service_role; 