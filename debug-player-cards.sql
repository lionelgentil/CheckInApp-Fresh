-- Debug query for investigating yellow card double counting
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

-- 2. Get current season info
SELECT 
    id as season_id,
    name as season_name,
    status,
    start_date,
    end_date
FROM seasons
WHERE status = 'active'
ORDER BY start_date DESC;

-- 3. Find all cards for this specific player (replace MEMBER_ID with actual ID from query 1)
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
    e.season_id,
    s.name as season_name,
    s.status as season_status,
    ht.name as home_team_name,
    at.name as away_team_name,
    tm.name as player_name,
    -- Check if event is in current season
    CASE 
        WHEN s.status = 'active' THEN 'CURRENT SEASON'
        ELSE 'PREVIOUS SEASON'
    END as season_type
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
JOIN events e ON m.event_id = e.id
JOIN seasons s ON e.season_id = s.id
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
JOIN team_members tm ON mc.member_id = tm.id
WHERE mc.member_id = 'MEMBER_ID_HERE'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
ORDER BY e.date DESC, m.id;

-- 4. Count yellow cards by season for this player
SELECT 
    s.name as season_name,
    s.status as season_status,
    COUNT(mc.id) as yellow_card_count,
    array_agg(DISTINCT e.name ORDER BY e.name) as events_with_cards
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
JOIN events e ON m.event_id = e.id
JOIN seasons s ON e.season_id = s.id
WHERE mc.member_id = 'MEMBER_ID_HERE'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
GROUP BY s.id, s.name, s.status
ORDER BY s.start_date DESC;

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

-- 6. Check if events have proper date_epoch values
SELECT 
    e.id as event_id,
    e.name as event_name,
    e.date as event_date_string,
    EXTRACT(EPOCH FROM e.date) as calculated_epoch,
    e.season_id,
    s.name as season_name,
    COUNT(m.id) as match_count,
    COUNT(mc.id) as total_cards_in_event
FROM events e
JOIN seasons s ON e.season_id = s.id
LEFT JOIN matches m ON e.id = m.event_id
LEFT JOIN match_cards mc ON m.id = mc.match_id AND mc.member_id = 'MEMBER_ID_HERE'
WHERE EXISTS (
    SELECT 1 FROM match_cards mc2 
    JOIN matches m2 ON mc2.match_id = m2.id 
    WHERE m2.event_id = e.id AND mc2.member_id = 'MEMBER_ID_HERE'
)
GROUP BY e.id, e.name, e.date, e.season_id, s.name
ORDER BY e.date DESC;