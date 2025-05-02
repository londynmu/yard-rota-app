-- Insert sample availability data (replace 'your-user-id-here' with actual user IDs after users register)
INSERT INTO public.availability (
    user_id, 
    date, 
    status, 
    comment
) VALUES 
-- User 1 data (replace with actual user ID)
('your-user-id-here', '2025-04-01', 'available', 'Morning shift preferred'),
('your-user-id-here', '2025-04-02', 'unavailable', 'Doctor appointment'),
('your-user-id-here', '2025-04-03', 'holiday', 'Annual leave'),
('your-user-id-here', '2025-04-10', 'available', NULL),
('your-user-id-here', '2025-04-11', 'available', 'Can work extra hours if needed'),
('your-user-id-here', '2025-04-15', 'unavailable', 'Family commitment'),
('your-user-id-here', '2025-04-20', 'holiday', 'Weekend trip'),
('your-user-id-here', '2025-04-25', 'available', NULL);

-- Add more users and their availability as needed 