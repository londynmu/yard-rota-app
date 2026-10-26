-- Create locations table for dynamic location management in Rota Planner
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow only admins to manage locations
CREATE POLICY "Admins manage locations"
ON locations
FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
));

-- Insert default locations if table is empty
INSERT INTO locations (name)
SELECT 'Main Hub' WHERE NOT EXISTS (SELECT 1 FROM locations WHERE name = 'Main Hub');

INSERT INTO locations (name)
SELECT 'NRC' WHERE NOT EXISTS (SELECT 1 FROM locations WHERE name = 'NRC'); 