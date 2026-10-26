-- Add profile_completed column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- Update existing profiles to set profile_completed to true if they have required fields
UPDATE profiles 
SET profile_completed = true 
WHERE 
  first_name IS NOT NULL AND 
  last_name IS NOT NULL AND 
  shift_preference IS NOT NULL AND 
  avatar_url IS NOT NULL; 