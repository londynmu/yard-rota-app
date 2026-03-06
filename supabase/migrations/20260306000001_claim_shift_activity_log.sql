-- Extend claim_shift to log to system_activity_log (shift_claimed)
CREATE OR REPLACE FUNCTION public.claim_shift(
  shift_id uuid,
  user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_shift record;
  conflict_check record;
  user_profile record;
BEGIN
  SELECT * INTO target_shift
  FROM scheduled_rota
  WHERE id = claim_shift.shift_id
    AND status = 'available'
    AND scheduled_rota.user_id IS NULL;

  IF target_shift IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Shift not found or not available for claiming'
    );
  END IF;

  SELECT * INTO user_profile
  FROM profiles
  WHERE id = claim_shift.user_id;

  IF user_profile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  SELECT sr.id INTO conflict_check
  FROM scheduled_rota sr
  WHERE sr.user_id = claim_shift.user_id
    AND sr.date = target_shift.date
    AND (
      (target_shift.start_time >= sr.start_time AND target_shift.start_time < sr.end_time)
      OR (target_shift.end_time > sr.start_time AND target_shift.end_time <= sr.end_time)
      OR (target_shift.start_time <= sr.start_time AND target_shift.end_time >= sr.end_time)
    )
  LIMIT 1;

  IF conflict_check IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You already have a shift scheduled that conflicts with this time'
    );
  END IF;

  UPDATE scheduled_rota
  SET
    user_id = claim_shift.user_id,
    status = NULL
  WHERE id = claim_shift.shift_id;

  INSERT INTO public.system_activity_log (user_id, entity_type, action_type, entity_id, payload)
  VALUES (
    claim_shift.user_id,
    'rota',
    'shift_claimed',
    claim_shift.shift_id,
    jsonb_build_object(
      'shift_id', claim_shift.shift_id,
      'date', target_shift.date,
      'location', target_shift.location,
      'shift_type', target_shift.shift_type,
      'start_time', target_shift.start_time,
      'end_time', target_shift.end_time
    )
  );

  INSERT INTO notifications (type, recipient_id, title, message, metadata, created_at)
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
      'user_id', claim_shift.user_id,
      'user_name', user_profile.first_name || ' ' || user_profile.last_name
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

GRANT EXECUTE ON FUNCTION public.claim_shift(uuid, uuid) TO authenticated;
