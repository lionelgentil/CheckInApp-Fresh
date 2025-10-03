-- Add role field to team_managers table to distinguish Manager vs Assistant Manager
-- Execute this SQL to update the existing table structure

ALTER TABLE team_managers
ADD COLUMN role VARCHAR(50) DEFAULT 'Assistant Manager'
CHECK (role IN ('Manager', 'Assistant Manager'));

-- Update existing records to be Assistant Managers by default
-- (Admin can manually promote one to Manager per team)
UPDATE team_managers SET role = 'Assistant Manager' WHERE role IS NULL;

-- Add index for better performance when filtering by role
CREATE INDEX idx_team_managers_role ON team_managers(role);
CREATE INDEX idx_team_managers_team_role ON team_managers(team_id, role);