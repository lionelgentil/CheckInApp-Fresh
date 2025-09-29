-- EMERGENCY: Complete Data Recovery Script
-- This addresses total loss of teams AND team_members

-- STEP 1: Check for any backup tables
SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%backup%';

-- STEP 2: Check for any remaining data
SELECT COUNT(*) FROM teams;
SELECT COUNT(*) FROM team_members;
SELECT COUNT(*) FROM team_captains;
SELECT COUNT(*) FROM player_disciplinary_records;

-- STEP 3: If backup tables exist, restore them
-- Check these specific backup tables:
-- SELECT COUNT(*) FROM teams_backup;
-- SELECT COUNT(*) FROM team_members_backup;

-- If backups exist, restore:
-- INSERT INTO teams SELECT * FROM teams_backup WHERE id NOT IN (SELECT id FROM teams);
-- INSERT INTO team_members SELECT * FROM team_members_backup WHERE id NOT IN (SELECT id FROM team_members);

-- STEP 4: If no backups, check for data in related tables
-- Check if disciplinary records still have team/member references
SELECT DISTINCT member_id, player_name FROM player_disciplinary_records LIMIT 20;

-- Check if any attendee data exists with member references
SELECT DISTINCT member_id FROM match_attendees LIMIT 20;

-- STEP 5: Emergency reconstruction from disciplinary records (if they exist)
-- This reconstructs basic member data from disciplinary history
/*
INSERT INTO team_members (id, team_id, name, jersey_number, gender, created_at)
SELECT DISTINCT
    pdr.member_id as id,
    'unknown-team-' || SUBSTRING(pdr.member_id, 1, 8) as team_id,  -- Temporary team assignment
    pdr.player_name as name,
    NULL as jersey_number,
    CASE
        WHEN pdr.player_name LIKE '% (F)' THEN 'female'
        WHEN pdr.player_name LIKE '% (M)' THEN 'male'
        ELSE NULL
    END as gender,
    CURRENT_TIMESTAMP as created_at
FROM player_disciplinary_records pdr
WHERE pdr.member_id IS NOT NULL
AND pdr.player_name IS NOT NULL
AND pdr.member_id NOT IN (SELECT id FROM team_members);
*/

-- STEP 6: Check Railway database logs for any clues
-- Look for error logs or transaction logs that might help

-- IMMEDIATE ACTION ITEMS:
-- 1. Run backup table checks first
-- 2. If backups exist, restore immediately
-- 3. If no backups, use disciplinary records to reconstruct what we can
-- 4. Check if Railway has any database snapshots or point-in-time recovery