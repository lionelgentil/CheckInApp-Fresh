-- Phase 3: Reconstruct team_members from match_attendees and photos

-- Step 1: Create basic member records from match_attendees
-- This gives us member_id and which teams they played for

INSERT INTO team_members (id, team_id, name, jersey_number, gender, created_at)
SELECT DISTINCT
    ma.member_id as id,
    m.home_team_id as team_id,  -- Assign to home team first
    'Player-' || SUBSTRING(ma.member_id, 1, 8) as name,  -- Temporary name
    NULL as jersey_number,
    NULL as gender,  -- We'll figure this out from photos
    CURRENT_TIMESTAMP as created_at
FROM match_attendees ma
JOIN matches m ON ma.match_id = m.id
WHERE ma.member_id IS NOT NULL
AND ma.member_id NOT IN (SELECT id FROM team_members);

-- Step 2: Handle members who played for away teams
INSERT INTO team_members (id, team_id, name, jersey_number, gender, created_at)
SELECT DISTINCT
    ma.member_id as id,
    m.away_team_id as team_id,  -- Assign to away team
    'Player-' || SUBSTRING(ma.member_id, 1, 8) as name,  -- Temporary name
    NULL as jersey_number,
    NULL as gender,
    CURRENT_TIMESTAMP as created_at
FROM match_attendees ma
JOIN matches m ON ma.match_id = m.id
WHERE ma.member_id IS NOT NULL
AND ma.member_id NOT IN (SELECT id FROM team_members)
AND m.away_team_id IS NOT NULL;

-- Step 3: Check what we reconstructed
SELECT
    t.name as team_name,
    COUNT(tm.id) as member_count
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id
GROUP BY t.id, t.name
ORDER BY member_count DESC;

-- Step 4: Find members who might be on wrong teams (played for multiple teams)
SELECT
    tm.id as member_id,
    tm.name as member_name,
    COUNT(DISTINCT tm.team_id) as teams_played_for,
    STRING_AGG(DISTINCT tm.team_id, ', ') as team_ids
FROM team_members tm
GROUP BY tm.id, tm.name
HAVING COUNT(DISTINCT tm.team_id) > 1
ORDER BY teams_played_for DESC;