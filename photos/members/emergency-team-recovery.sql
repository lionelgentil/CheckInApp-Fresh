-- Emergency Team Recovery Script
-- This script attempts to recover teams that were accidentally deleted

-- First, check if teams_backup table exists
-- SELECT COUNT(*) FROM teams_backup;

-- If teams_backup exists, restore from it:
-- INSERT INTO teams SELECT * FROM teams_backup WHERE id NOT IN (SELECT id FROM teams);

-- Alternative: Recreate teams from team_members table references
-- This creates basic team records for any team_id that has members

INSERT INTO teams (id, name, category, color, description, captain_id)
SELECT DISTINCT
    tm.team_id as id,
    'Team ' || SUBSTRING(tm.team_id, 1, 8) as name,  -- Temporary name using first 8 chars of ID
    'Over 30' as category,  -- Default category
    '#2196F3' as color,     -- Default color
    'Recovered team' as description,
    NULL as captain_id
FROM team_members tm
WHERE tm.team_id NOT IN (SELECT id FROM teams)
AND tm.active IS NOT FALSE;  -- Only active members

-- Query to check what team IDs exist in team_members but not in teams:
-- SELECT DISTINCT team_id FROM team_members WHERE team_id NOT IN (SELECT id FROM teams);

-- Query to see current teams:
-- SELECT * FROM teams ORDER BY name;

-- After recovery, you'll need to:
-- 1. Update team names manually to correct names
-- 2. Set correct categories (Over 30, Over 40)
-- 3. Set team captains if known
-- 4. Update descriptions as needed

-- Example updates after recovery:
-- UPDATE teams SET name = 'Actual Team Name', category = 'Over 40' WHERE id = 'team-id-here';