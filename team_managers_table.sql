-- Create team_managers table for manager.html functionality
-- Run this SQL command via db-maintenance.html or directly in database

CREATE TABLE IF NOT EXISTS team_managers (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    email_address VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_team_managers_team_id ON team_managers(team_id);

-- Sample data (optional)
-- INSERT INTO team_managers (team_id, first_name, last_name, phone_number, email_address) 
-- VALUES (1, 'John', 'Manager', '555-123-4567', 'john.manager@email.com');