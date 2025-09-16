-- Debug query for investigating yellow card double counting (Updated for actual DB schema)
-- Replace 'PLAYER_NAME_HERE' with the actual name of the player showing the discrepancy

-- 1. Find the player and get their ID
SELECT 
    tm.id as member_id,
    tm.name as player_name,
    tm.team_id,
    t.name as team_name
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
WHERE tm.name ILIKE '%PLAYER_NAME_HERE%'  -- Replace with actual player name
LIMIT 5;

-- 2. Find all yellow cards for this specific player (replace MEMBER_ID with actual ID from query 1)
SELECT 
    mc.id as card_id,
    mc.member_id,
    mc.card_type,
    mc.reason,
    mc.minute,
    mc.notes,
    m.event_id,
    m.match_id,
    e.name as event_name,
    e.date as event_date,
    ht.name as home_team_name,
    at.name as away_team_name,
    tm.name as player_name
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
JOIN events e ON m.event_id = e.id
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
JOIN team_members tm ON mc.member_id = tm.id
WHERE mc.member_id = 'MEMBER_ID_HERE'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
ORDER BY e.date DESC, m.id;

-- 3. Count total yellow cards for this player
SELECT 
    COUNT(*) as total_yellow_cards,
    COUNT(DISTINCT m.event_id) as events_with_cards,
    COUNT(DISTINCT m.id) as matches_with_cards
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
WHERE mc.member_id = 'MEMBER_ID_HERE'  -- Replace with actual member ID
    AND mc.card_type = 'yellow';

-- 4. Group by event to see distribution
SELECT 
    e.name as event_name,
    e.date as event_date,
    COUNT(mc.id) as yellow_cards_in_event,
    array_agg(
        CONCAT(ht.name, ' vs ', at.name, ' (', COALESCE(mc.minute::text, 'no min'), ' min)')
        ORDER BY m.id
    ) as match_details
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
JOIN events e ON m.event_id = e.id
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
WHERE mc.member_id = 'MEMBER_ID_HERE'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
GROUP BY e.id, e.name, e.date
ORDER BY e.date DESC;

-- 5. Check for duplicate cards (same player, same match, same type)
SELECT 
    mc.member_id,
    mc.match_id,
    mc.card_type,
    COUNT(*) as duplicate_count,
    array_agg(mc.id) as card_ids,
    e.name as event_name,
    tm.name as player_name
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
JOIN events e ON m.event_id = e.id
JOIN team_members tm ON mc.member_id = tm.id
WHERE mc.member_id = 'MEMBER_ID_HERE'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
GROUP BY mc.member_id, mc.match_id, mc.card_type, e.name, tm.name
HAVING COUNT(*) > 1;

-- 6. Show the actual table structure to understand the schema
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('events', 'matches', 'match_cards', 'team_members', 'teams')
ORDER BY table_name, ordinal_position;