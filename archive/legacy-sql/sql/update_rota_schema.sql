-- Add status column to scheduled_rota table
ALTER TABLE scheduled_rota 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT NULL;

-- Create index for faster filtering of available shifts
CREATE INDEX IF NOT EXISTS idx_scheduled_rota_status 
ON scheduled_rota (status);

-- Add comment explaining the status field
COMMENT ON COLUMN scheduled_rota.status IS 
'Status of the shift. Values: "available" (for employee self-service), NULL (normal admin-assigned shift)';

-- Create function to claim a shift
CREATE OR REPLACE FUNCTION claim_shift(
  shift_id UUID,
  user_id UUID
) 
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_shift RECORD;
  conflict_check RECORD;
  user_profile RECORD;
  response JSONB;
BEGIN
  -- Check if shift exists and is available
  SELECT * INTO target_shift 
  FROM scheduled_rota 
  WHERE id = shift_id 
  AND status = 'available'
  AND user_id IS NULL;

  IF target_shift IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Shift not found or not available for claiming'
    );
  END IF;
  
  -- Check if user exists
  SELECT * INTO user_profile 
  FROM profiles 
  WHERE id = user_id;
  
  IF user_profile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  -- Check for scheduling conflicts
  SELECT id INTO conflict_check 
  FROM scheduled_rota 
  WHERE user_id = claim_shift.user_id 
  AND date = target_shift.date
  AND (
    -- Time overlap cases:
    -- 1. Shift starts during existing shift
    (target_shift.start_time >= start_time AND target_shift.start_time < end_time) OR
    -- 2. Shift ends during existing shift
    (target_shift.end_time > start_time AND target_shift.end_time <= end_time) OR
    -- 3. Shift completely contains existing shift
    (target_shift.start_time <= start_time AND target_shift.end_time >= end_time)
  )
  LIMIT 1;

  IF conflict_check IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You already have a shift scheduled that conflicts with this time'
    );
  END IF;

  -- Assign the shift to the user
  UPDATE scheduled_rota 
  SET 
    user_id = claim_shift.user_id,
    status = NULL -- Mark as no longer available for claiming
  WHERE id = shift_id;

  -- Create a notification for admin about the claimed shift
  INSERT INTO notifications (
    type, 
    recipient_id, 
    title, 
    message, 
    metadata,
    created_at
  )
  SELECT 
    'shift_claimed',
    p.id,
    'Shift Claimed',
    format('%s %s claimed a shift for %s', 
           user_profile.first_name, 
           user_profile.last_name, 
           to_char(target_shift.date, 'DD Mon YYYY')),
    jsonb_build_object(
      'shift_id', target_shift.id,
      'date', target_shift.date,
      'location', target_shift.location,
      'shift_type', target_shift.shift_type,
      'start_time', target_shift.start_time,
      'end_time', target_shift.end_time,
      'user_id', user_id,
      'user_name', concat(user_profile.first_name, ' ', user_profile.last_name)
    ),
    now()
  FROM profiles p
  WHERE p.role = 'admin';

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Shift claimed successfully'
  );
END;
$$;

-- Create RLS policies for self-service shift claiming

-- Allow all users to view available shifts
CREATE POLICY view_available_shifts 
ON scheduled_rota 
FOR SELECT 
USING (status = 'available' OR user_id = auth.uid());

-- Allow admins to update shift status
CREATE POLICY update_shift_status
ON scheduled_rota
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Allow users to call the claim_shift function
GRANT EXECUTE ON FUNCTION claim_shift TO authenticated; 