-- Debug query for investigating yellow card double counting
-- Replace 'PLAYER_MEMBER_ID' with the actual member ID of the player showing the discrepancy

-- 1. First, find all cards for this specific player
SELECT 
    mc.id as card_id,
    mc.member_id,
    mc.team_id,
    mc.card_type,
    mc.reason,
    mc.minute,
    mc.notes,
    m.event_id,
    m.match_id,
    m.home_team_id,
    m.away_team_id,
    e.name as event_name,
    e.date as event_date,
    e.season_id,
    ht.name as home_team_name,
    at.name as away_team_name,
    tm.name as player_name
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
JOIN events e ON m.event_id = e.id
JOIN teams ht ON m.home_team_id = ht.id
JOIN teams at ON m.away_team_id = at.id
JOIN team_members tm ON mc.member_id = tm.id
WHERE mc.member_id = 'PLAYER_MEMBER_ID'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
ORDER BY e.date DESC, m.id;

-- 2. Check for duplicate cards (same player, same match, same type)
SELECT 
    mc.member_id,
    mc.match_id,
    mc.card_type,
    COUNT(*) as duplicate_count,
    array_agg(mc.id) as card_ids
FROM match_cards mc
WHERE mc.member_id = 'PLAYER_MEMBER_ID'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
GROUP BY mc.member_id, mc.match_id, mc.card_type
HAVING COUNT(*) > 1;

-- 3. Check current season events and their matches
SELECT 
    e.id as event_id,
    e.name as event_name,
    e.date as event_date,
    e.season_id,
    COUNT(m.id) as match_count
FROM events e
LEFT JOIN matches m ON e.id = m.event_id
WHERE e.season_id = (
    SELECT id FROM seasons WHERE status = 'active' LIMIT 1
)
GROUP BY e.id, e.name, e.date, e.season_id
ORDER BY e.date DESC;

-- 4. Check if player has cards in multiple seasons
SELECT 
    e.season_id,
    s.name as season_name,
    s.status as season_status,
    COUNT(mc.id) as yellow_card_count
FROM match_cards mc
JOIN matches m ON mc.match_id = m.id
JOIN events e ON m.event_id = e.id
JOIN seasons s ON e.season_id = s.id
WHERE mc.member_id = 'PLAYER_MEMBER_ID'  -- Replace with actual member ID
    AND mc.card_type = 'yellow'
GROUP BY e.season_id, s.name, s.status
ORDER BY e.season_id DESC;