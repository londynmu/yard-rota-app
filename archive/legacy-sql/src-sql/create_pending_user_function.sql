-- This function creates a pending user with a generated UUID
-- It should be run in Supabase SQL Editor

-- Function to create a pending user with a generated UUID
CREATE OR REPLACE FUNCTION create_pending_user(
  first_name TEXT,
  last_name TEXT,
  shift_preference TEXT DEFAULT 'day',
  user_role TEXT DEFAULT 'user'
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  -- Generate a new UUID for the user
  SELECT gen_random_uuid() INTO new_id;
  
  -- Insert directly into profiles table with the generated UUID
  INSERT INTO profiles (
    id,
    first_name,
    last_name,
    shift_preference,
    role,
    status,
    is_active,
    profile_completed,
    performance_score
  ) VALUES (
    new_id,
    first_name,
    last_name,
    shift_preference,
    user_role,
    'pending',
    true,
    false,
    50
  );
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set appropriate permissions for the function
GRANT EXECUTE ON FUNCTION create_pending_user(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_pending_user(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- Create RPC endpoint for this function
COMMENT ON FUNCTION create_pending_user IS 'Creates a pending user profile with a generated UUID'; 