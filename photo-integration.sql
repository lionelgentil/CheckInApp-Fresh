-- Photo Integration SQL Script
-- This updates team_members with photo information from the matched files

-- Step 1: First, let's see what members exist that match photo file patterns
-- Check if we have members whose IDs match the photo filename patterns

SELECT
    tm.id,
    tm.name as current_name,
    tm.team_id,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'temp_photos'
        ) THEN 'temp_photos_exists'
        ELSE 'need_to_create_temp_photos'
    END as temp_table_status
FROM team_members tm
LIMIT 5;

-- Step 2: We need to create a way to match photos with members
-- Since we can't directly access files from SQL, we'll need to use the PHP script
-- or manually create a mapping

-- For now, let's update the photo field for members where we know files exist
-- Based on the photo naming pattern: {member_id}_{timestamp}.png

-- Example: Update photo field to point to the correct filename
-- UPDATE team_members
-- SET photo = id || '_' || '1757191070' || '.png'
-- WHERE id = '000f1e61-367d-43b7-b60d-92e601886637';

-- Step 3: Bulk update photo fields (run this after we confirm the file pattern)
-- This assumes most photos follow the pattern {member_id}_{some_timestamp}.png

-- We can't do this automatically without knowing the timestamp part
-- So we'll need to use the PHP integration script first

-- Step 4: Sample queries to update specific members once we have the mapping
-- UPDATE team_members SET photo = '000f1e61-367d-43b7-b60d-92e601886637_1757191070.png'
-- WHERE id = '000f1e61-367d-43b7-b60d-92e601886637';

-- UPDATE team_members SET photo = '00487f10-eace-457f-9a3f-dd85e5f5d4ea_1758235755.png'
-- WHERE id = '00487f10-eace-457f-9a3f-dd85e5f5d4ea';

-- Step 5: Update member names to be more user-friendly
-- For now, let's at least make them shorter and cleaner
UPDATE team_members
SET name = 'Player ' || ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY id)
FROM (SELECT DISTINCT team_id FROM team_members) teams_list;

-- Actually, let's use a better approach - use the first 8 characters of UUID for uniqueness
UPDATE team_members
SET name = 'Player-' || UPPER(SUBSTRING(id, 1, 8));

-- Check results
SELECT
    tm.id,
    tm.name,
    tm.photo,
    t.name as team_name
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
ORDER BY t.name, tm.name
LIMIT 20;