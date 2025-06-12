-- Create a function to delete users that can only be called by admins
CREATE OR REPLACE FUNCTION delete_user(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- This ensures the function runs with the privileges of the owner
AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Check if the current user is an admin
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    ) INTO is_admin;

    -- If not admin, raise an error
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Only administrators can delete users';
    END IF;

    -- Delete from auth.users (this will cascade to profiles and other tables)
    DELETE FROM auth.users WHERE id = user_id;
END;
$$;

-- Grant execute permission to authenticated users (the admin check is inside the function)
GRANT EXECUTE ON FUNCTION delete_user(UUID) TO authenticated; 