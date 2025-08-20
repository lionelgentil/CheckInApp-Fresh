<?php
/**
 * CheckIn App - PHP API
 * RESTful API for team and event management
 */

// Version constant - update this single location to change version everywhere
const APP_VERSION = '2.14.18';

// Default photos - simple SVG avatars
function getDefaultPhoto($gender) {
    if ($gender === 'female') {
        $svg = '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="50" fill="#FF69B4"/>
            <circle cx="50" cy="35" r="18" fill="white"/>
            <ellipse cx="50" cy="75" rx="25" ry="20" fill="white"/>
        </svg>';
    } else {
        $svg = '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="50" fill="#4F80FF"/>
            <circle cx="50" cy="35" r="18" fill="white"/>
            <ellipse cx="50" cy="75" rx="25" ry="20" fill="white"/>
        </svg>';
    }
    
    return 'data:image/svg+xml;base64,' . base64_encode($svg);
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Enable gzip compression for faster responses
if (extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    ini_set('zlib.output_compression', 1);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database connection - PostgreSQL ONLY
$databaseUrl = null;

// Check common Railway PostgreSQL variable patterns
$possibleVars = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL'];
foreach ($possibleVars as $var) {
    if (isset($_ENV[$var])) {
        $databaseUrl = $_ENV[$var];
        break;
    }
}

// Also check for any PostgreSQL connection strings in environment
foreach ($_ENV as $key => $value) {
    if ((strpos($key, 'DATABASE_URL') !== false || 
         strpos($key, 'POSTGRES') !== false) && 
        strpos($value, 'postgres://') === 0) {
        $databaseUrl = $value;
        break;
    }
}

// Fail if no PostgreSQL database URL found
if (!$databaseUrl) {
    http_response_code(500);
    echo json_encode([
        'error' => 'PostgreSQL database required. No DATABASE_URL found.',
        'instructions' => 'Add PostgreSQL service in Railway and connect DATABASE_URL variable',
        'available_drivers' => PDO::getAvailableDrivers(),
        'debug_env_vars' => array_keys(array_filter($_ENV, function($key) {
            return strpos(strtolower($key), 'database') !== false || 
                   strpos(strtolower($key), 'postgres') !== false ||
                   strpos($key, 'URL') !== false;
        }, ARRAY_FILTER_USE_KEY))
    ]);
    exit();
}

// Fail if PostgreSQL driver not available
if (!in_array('pgsql', PDO::getAvailableDrivers())) {
    http_response_code(500);
    echo json_encode([
        'error' => 'PostgreSQL driver not available',
        'available_drivers' => PDO::getAvailableDrivers(),
        'php_extensions' => get_loaded_extensions()
    ]);
    exit();
}

try {
    // Parse PostgreSQL URL and convert to PDO connection string
    $parsedUrl = parse_url($databaseUrl);
    
    $host = $parsedUrl['host'];
    $port = $parsedUrl['port'] ?? 5432;
    $dbname = ltrim($parsedUrl['path'], '/');
    $user = $parsedUrl['user'];
    $password = $parsedUrl['pass'];
    
    // Build PostgreSQL PDO connection string
    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname}";
    
    $db = new PDO($dsn, $user, $password);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Initialize PostgreSQL database
    initializeDatabase($db);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'PostgreSQL connection failed: ' . $e->getMessage(),
        'database_url_found' => !empty($databaseUrl),
        'parsed_components' => [
            'host' => $parsedUrl['host'] ?? 'missing',
            'port' => $parsedUrl['port'] ?? 5432,
            'dbname' => ltrim($parsedUrl['path'] ?? '', '/'),
            'user' => isset($parsedUrl['user']) ? 'present' : 'missing',
            'password' => isset($parsedUrl['pass']) ? 'present' : 'missing'
        ],
        'dsn' => $dsn ?? 'failed_to_build',
        'available_drivers' => PDO::getAvailableDrivers()
    ]);
    exit();
}

// Get request path
$path = $_GET['path'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Route requests
try {
    switch ($path) {
        case 'health':
            echo json_encode([
                'status' => 'OK',
                'version' => APP_VERSION,
                'timestamp' => date('c'),
                'database' => 'PostgreSQL',
                'php_version' => PHP_VERSION,
                'persistent' => true
            ]);
            break;
            
        case 'teams':
            if ($method === 'GET') {
                getTeams($db);
            } elseif ($method === 'POST') {
                saveTeams($db);
            }
            break;
            
        case 'events':
            if ($method === 'GET') {
                getEvents($db);
            } elseif ($method === 'POST') {
                saveEvents($db);
            }
            break;
            
        case 'referees':
            if ($method === 'GET') {
                getReferees($db);
            } elseif ($method === 'POST') {
                saveReferees($db);
            }
            break;
            
        case 'disciplinary-records':
            if ($method === 'GET') {
                getDisciplinaryRecords($db);
            } elseif ($method === 'POST') {
                saveDisciplinaryRecords($db);
            }
            break;
            
        case 'debug-disciplinary':
            if ($method === 'GET') {
                debugDisciplinaryRecords($db);
            }
            break;
            
        case 'cleanup-disciplinary':
            // DISABLED: Cleanup endpoint removed to prevent accidental data loss
            http_response_code(404);
            echo json_encode(['error' => 'Cleanup endpoint disabled for data protection']);
            break;
            
        case 'db-schema':
            if ($method === 'GET') {
                getDatabaseSchema($db);
            }
            break;
            
        case 'db-data':
            if ($method === 'GET') {
                getDatabaseData($db);
            }
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Endpoint not found']);
    }
} catch (Exception $e) {
    error_log("API Error: " . $e->getMessage());
    error_log("API Stack trace: " . $e->getTraceAsString());
    http_response_code(500);
    echo json_encode([
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);
}

function getTeams($db) {
    // Optimized single query with JOIN to get all teams and members at once
    $stmt = $db->query('
        SELECT 
            t.id as team_id,
            t.name as team_name,
            t.category as team_category,
            t.color as team_color,
            t.description as team_description,
            t.captain_id as team_captain_id,
            tm.id as member_id,
            tm.name as member_name,
            tm.jersey_number,
            tm.gender,
            tm.photo
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        ORDER BY t.name, tm.name
    ');
    
    $teams = [];
    $currentTeam = null;
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Start new team or continue existing team
        if (!$currentTeam || $currentTeam['id'] !== $row['team_id']) {
            // Save previous team if exists
            if ($currentTeam) {
                $teams[] = $currentTeam;
            }
            
            // Start new team
            $currentTeam = [
                'id' => $row['team_id'],
                'name' => $row['team_name'],
                'category' => $row['team_category'],
                'colorData' => $row['team_color'],
                'description' => $row['team_description'],
                'captainId' => $row['team_captain_id'],
                'members' => []
            ];
        }
        
        // Add member to current team (if member exists)
        if ($row['member_id']) {
            $photo = $row['photo'] ?: getDefaultPhoto($row['gender']);
            
            $currentTeam['members'][] = [
                'id' => $row['member_id'],
                'name' => $row['member_name'],
                'jerseyNumber' => $row['jersey_number'] ? (int)$row['jersey_number'] : null,
                'gender' => $row['gender'],
                'photo' => $photo
            ];
        }
    }
    
    // Don't forget the last team
    if ($currentTeam) {
        $teams[] = $currentTeam;
    }
    
    echo json_encode($teams);
}

function saveTeams($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        // IMPORTANT: Instead of DELETE FROM team_members (which cascades to disciplinary records),
        // we'll use UPSERT approach to preserve member IDs and disciplinary data
        
        // First, collect all incoming member IDs
        $incomingMemberIds = [];
        foreach ($input as $team) {
            if (isset($team['members']) && is_array($team['members'])) {
                foreach ($team['members'] as $member) {
                    $incomingMemberIds[] = $member['id'];
                }
            }
        }
        
        // Delete orphaned members (not in incoming data) - this will cascade delete their disciplinary records
        if (!empty($incomingMemberIds)) {
            $placeholders = str_repeat('?,', count($incomingMemberIds) - 1) . '?';
            $stmt = $db->prepare("DELETE FROM team_members WHERE id NOT IN ({$placeholders})");
            $stmt->execute($incomingMemberIds);
        } else {
            // CRITICAL FIX: Only delete all members if we're sure this is intentional
            // Check if any teams in the input are supposed to have members
            $hasAnyMembersData = false;
            foreach ($input as $team) {
                if (isset($team['members']) && is_array($team['members'])) {
                    $hasAnyMembersData = true;
                    break;
                }
            }
            
            // Only delete all members if teams explicitly have empty members arrays
            // Don't delete if members key is missing entirely (could be partial update)
            if ($hasAnyMembersData) {
                error_log("WARNING: Deleting all team members due to empty members data");
                $db->exec('DELETE FROM team_members');
            } else {
                error_log("SKIPPING: Team save without members data - preserving existing members");
            }
        }
        
        // Delete all teams (safe since no foreign keys reference teams)
        $db->exec('DELETE FROM teams');
        
        foreach ($input as $team) {
            // Insert/Update team
            $stmt = $db->prepare('
                INSERT INTO teams (id, name, category, color, description, captain_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ');
            $stmt->execute([
                $team['id'],
                $team['name'],
                $team['category'] ?? null,
                $team['colorData'] ?? '#2196F3',
                $team['description'] ?? '',
                $team['captainId'] ?? null
            ]);
            
            if (isset($team['members']) && is_array($team['members'])) {
                foreach ($team['members'] as $member) {
                    // Use INSERT ON CONFLICT (UPSERT) to preserve existing members and their disciplinary records
                    $stmt = $db->prepare('
                        INSERT INTO team_members (id, team_id, name, jersey_number, gender, photo)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET
                            team_id = EXCLUDED.team_id,
                            name = EXCLUDED.name,
                            jersey_number = EXCLUDED.jersey_number,
                            gender = EXCLUDED.gender,
                            photo = EXCLUDED.photo
                    ');
                    $stmt->execute([
                        $member['id'],
                        $team['id'],
                        $member['name'],
                        $member['jerseyNumber'] ?? null,
                        $member['gender'] ?? null,
                        $member['photo'] ?? null
                    ]);
                }
            }
        }
        
        $db->commit();
        echo json_encode(['success' => true]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function getEvents($db) {
    // Step 1: Get all events
    $stmt = $db->query('SELECT * FROM events ORDER BY date');
    $events = [];
    $eventIds = [];
    
    while ($event = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $events[$event['id']] = [
            'id' => $event['id'],
            'name' => $event['name'],
            'date' => $event['date'],
            'description' => $event['description'],
            'matches' => [],
            'attendees' => []
        ];
        $eventIds[] = $event['id'];
    }
    
    if (empty($eventIds)) {
        echo json_encode([]);
        return;
    }
    
    // Step 2: Get all matches for all events in one query
    $eventIdsPlaceholder = str_repeat('?,', count($eventIds) - 1) . '?';
    $stmt = $db->prepare("SELECT * FROM matches WHERE event_id IN ({$eventIdsPlaceholder}) ORDER BY event_id, match_time");
    $stmt->execute($eventIds);
    
    $matches = [];
    $matchIds = [];
    while ($match = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $matches[$match['id']] = [
            'id' => $match['id'],
            'eventId' => $match['event_id'],
            'homeTeamId' => $match['home_team_id'],
            'awayTeamId' => $match['away_team_id'],
            'field' => $match['field'],
            'time' => $match['match_time'],
            'mainRefereeId' => $match['main_referee_id'],
            'assistantRefereeId' => $match['assistant_referee_id'],
            'notes' => $match['notes'],
            'homeScore' => $match['home_score'] !== null ? (int)$match['home_score'] : null,
            'awayScore' => $match['away_score'] !== null ? (int)$match['away_score'] : null,
            'matchStatus' => $match['match_status'] ?? 'scheduled',
            'homeTeamAttendees' => [],
            'awayTeamAttendees' => [],
            'cards' => []
        ];
        $matchIds[] = $match['id'];
    }
    
    if (!empty($matchIds)) {
        // Step 3: Get all attendees for all matches in one query
        $matchIdsPlaceholder = str_repeat('?,', count($matchIds) - 1) . '?';
        $stmt = $db->prepare("
            SELECT ma.*, tm.name as member_name
            FROM match_attendees ma
            JOIN team_members tm ON ma.member_id = tm.id
            WHERE ma.match_id IN ({$matchIdsPlaceholder})
        ");
        $stmt->execute($matchIds);
        
        while ($attendee = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $attendeeData = [
                'memberId' => $attendee['member_id'],
                'name' => $attendee['member_name'],
                'checkedInAt' => $attendee['checked_in_at']
            ];
            
            if ($attendee['team_type'] === 'home') {
                $matches[$attendee['match_id']]['homeTeamAttendees'][] = $attendeeData;
            } else {
                $matches[$attendee['match_id']]['awayTeamAttendees'][] = $attendeeData;
            }
        }
        
        // Step 4: Get all cards for all matches in one query
        $stmt = $db->prepare("
            SELECT mc.*, tm.name as member_name
            FROM match_cards mc
            JOIN team_members tm ON mc.member_id = tm.id
            WHERE mc.match_id IN ({$matchIdsPlaceholder})
            ORDER BY mc.match_id, mc.minute ASC
        ");
        $stmt->execute($matchIds);
        
        while ($card = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $matches[$card['match_id']]['cards'][] = [
                'id' => $card['id'],
                'memberId' => $card['member_id'],
                'memberName' => $card['member_name'],
                'teamType' => $card['team_type'],
                'cardType' => $card['card_type'],
                'reason' => $card['reason'],
                'notes' => $card['notes'],
                'minute' => $card['minute'] ? (int)$card['minute'] : null
            ];
        }
    }
    
    // Step 5: Get all general attendees for all events in one query
    $stmt = $db->prepare("SELECT * FROM general_attendees WHERE event_id IN ({$eventIdsPlaceholder})");
    $stmt->execute($eventIds);
    
    while ($attendee = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $events[$attendee['event_id']]['attendees'][] = [
            'memberId' => $attendee['member_id'],
            'name' => $attendee['name'],
            'team' => $attendee['team_name'],
            'status' => $attendee['status'],
            'checkedInAt' => $attendee['checked_in_at']
        ];
    }
    
    // Step 6: Assemble matches into events
    foreach ($matches as $match) {
        $events[$match['eventId']]['matches'][] = $match;
    }
    
    // Convert to array and return
    echo json_encode(array_values($events));
}

function saveEvents($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        $db->exec('DELETE FROM match_cards');
        $db->exec('DELETE FROM general_attendees');
        $db->exec('DELETE FROM match_attendees');
        $db->exec('DELETE FROM matches');
        $db->exec('DELETE FROM events');
        
        foreach ($input as $event) {
            $stmt = $db->prepare('
                INSERT INTO events (id, name, date, description)
                VALUES (?, ?, ?, ?)
            ');
            $stmt->execute([
                $event['id'],
                $event['name'],
                $event['date'],
                $event['description'] ?? ''
            ]);
            
            if (isset($event['matches']) && is_array($event['matches'])) {
                foreach ($event['matches'] as $match) {
                    $stmt = $db->prepare('
                        INSERT INTO matches (id, event_id, home_team_id, away_team_id, field, match_time, main_referee_id, assistant_referee_id, notes, home_score, away_score, match_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $match['id'],
                        $event['id'],
                        $match['homeTeamId'],
                        $match['awayTeamId'],
                        $match['field'] ?? null,
                        $match['time'] ?? null,
                        $match['mainRefereeId'] ?? null,
                        $match['assistantRefereeId'] ?? null,
                        $match['notes'] ?? null,
                        $match['homeScore'] ?? null,
                        $match['awayScore'] ?? null,
                        $match['matchStatus'] ?? 'scheduled'
                    ]);
                    
                    // Save attendees
                    if (isset($match['homeTeamAttendees'])) {
                        foreach ($match['homeTeamAttendees'] as $attendee) {
                            try {
                                $stmt = $db->prepare('
                                    INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at)
                                    VALUES (?, ?, ?, ?)
                                ');
                                $stmt->execute([
                                    $match['id'],
                                    $attendee['memberId'],
                                    'home',
                                    $attendee['checkedInAt']
                                ]);
                            } catch (Exception $e) {
                                error_log("Error saving home attendee: " . $e->getMessage());
                                error_log("Match ID: " . $match['id'] . ", Member ID: " . $attendee['memberId']);
                                throw $e;
                            }
                        }
                    }
                    
                    if (isset($match['awayTeamAttendees'])) {
                        foreach ($match['awayTeamAttendees'] as $attendee) {
                            try {
                                $stmt = $db->prepare('
                                    INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at)
                                    VALUES (?, ?, ?, ?)
                                ');
                                $stmt->execute([
                                    $match['id'],
                                    $attendee['memberId'],
                                    'away',
                                    $attendee['checkedInAt']
                                ]);
                            } catch (Exception $e) {
                                error_log("Error saving away attendee: " . $e->getMessage());
                                error_log("Match ID: " . $match['id'] . ", Member ID: " . $attendee['memberId']);
                                throw $e;
                            }
                        }
                    }
                    
                    // Save cards
                    if (isset($match['cards']) && is_array($match['cards'])) {
                        foreach ($match['cards'] as $card) {
                            try {
                                $stmt = $db->prepare('
                                    INSERT INTO match_cards (match_id, member_id, team_type, card_type, reason, notes, minute)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                ');
                                $stmt->execute([
                                    $match['id'],
                                    $card['memberId'],
                                    $card['teamType'],
                                    $card['cardType'],
                                    $card['reason'] ?? null,
                                    $card['notes'] ?? null,
                                    $card['minute'] ?? null
                                ]);
                            } catch (Exception $e) {
                                error_log("Error saving card: " . $e->getMessage());
                                error_log("Match ID: " . $match['id'] . ", Member ID: " . $card['memberId']);
                                throw $e;
                            }
                        }
                    }
                }
            }
            
            if (isset($event['attendees']) && is_array($event['attendees'])) {
                foreach ($event['attendees'] as $attendee) {
                    $stmt = $db->prepare('
                        INSERT INTO general_attendees (event_id, member_id, name, team_name, status, checked_in_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $event['id'],
                        $attendee['memberId'],
                        $attendee['name'],
                        $attendee['team'] ?? null,
                        $attendee['status'] ?? 'present',
                        $attendee['checkedInAt']
                    ]);
                }
            }
        }
        
        $db->commit();
        echo json_encode(['success' => true]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function getReferees($db) {
    $stmt = $db->query('SELECT * FROM referees ORDER BY name');
    $referees = [];
    
    while ($referee = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $referees[] = [
            'id' => $referee['id'],
            'name' => $referee['name'],
            'phone' => $referee['phone']
        ];
    }
    
    echo json_encode($referees);
}

function saveReferees($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        $db->exec('DELETE FROM referees');
        
        foreach ($input as $referee) {
            $stmt = $db->prepare('
                INSERT INTO referees (id, name, phone)
                VALUES (?, ?, ?)
            ');
            $stmt->execute([
                $referee['id'],
                $referee['name'],
                $referee['phone'] ?? null
            ]);
        }
        
        $db->commit();
        echo json_encode(['success' => true]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function generateUUID() {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function cleanupDisciplinaryRecords($db) {
    error_log("WARNING: cleanupDisciplinaryRecords function was called! This should not happen.");
    try {
        // Get count and sample data before cleanup for confirmation
        $stmt = $db->query('SELECT COUNT(*) as total FROM player_disciplinary_records');
        $recordsBeforeCleanup = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
        
        // Get sample of existing records to show what's being deleted
        $stmt = $db->query('SELECT card_type, incident_date, suspension_matches, suspension_served, suspension_served_date FROM player_disciplinary_records ORDER BY created_at DESC LIMIT 5');
        $sampleRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Clear all disciplinary records
        $db->exec('DELETE FROM player_disciplinary_records');
        
        // Reset the auto-increment counter
        $db->exec('ALTER SEQUENCE player_disciplinary_records_id_seq RESTART WITH 1');
        
        echo json_encode([
            'success' => true,
            'message' => 'Disciplinary records cleaned up successfully for v2.14.9',
            'records_deleted' => $recordsBeforeCleanup,
            'sample_deleted_records' => $sampleRecords,
            'note' => 'Fresh start with suspension served date support',
            'timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Failed to cleanup disciplinary records: ' . $e->getMessage(),
            'timestamp' => date('c')
        ]);
    }
}

function getDatabaseSchema($db) {
    try {
        // Get all tables in the database
        $stmt = $db->query("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        ");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        $schema = [];
        
        foreach ($tables as $tableName) {
            // Get column information for each table
            $stmt = $db->prepare("
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale
                FROM information_schema.columns 
                WHERE table_name = ? 
                AND table_schema = 'public'
                ORDER BY ordinal_position
            ");
            $stmt->execute([$tableName]);
            $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get constraints (primary keys, foreign keys, etc.)
            $stmt = $db->prepare("
                SELECT 
                    tc.constraint_name,
                    tc.constraint_type,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                LEFT JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.table_name = ? 
                AND tc.table_schema = 'public'
                ORDER BY tc.constraint_type, kcu.ordinal_position
            ");
            $stmt->execute([$tableName]);
            $constraints = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get row count
            $stmt = $db->prepare("SELECT COUNT(*) as row_count FROM {$tableName}");
            $stmt->execute();
            $rowCount = $stmt->fetch(PDO::FETCH_ASSOC)['row_count'];
            
            $schema[$tableName] = [
                'columns' => $columns,
                'constraints' => $constraints,
                'row_count' => $rowCount
            ];
        }
        
        echo json_encode([
            'success' => true,
            'schema' => $schema,
            'table_count' => count($tables),
            'timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Failed to get database schema: ' . $e->getMessage(),
            'timestamp' => date('c')
        ]);
    }
}

function getDatabaseData($db) {
    try {
        // Get all tables
        $stmt = $db->query("
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        ");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        $data = [];
        $totalRows = 0;
        
        foreach ($tables as $tableName) {
            // Get all data from each table (limit to prevent huge responses)
            $stmt = $db->prepare("SELECT * FROM {$tableName} ORDER BY 1 LIMIT 100");
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get total count
            $stmt = $db->prepare("SELECT COUNT(*) as total FROM {$tableName}");
            $stmt->execute();
            $count = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
            
            $data[$tableName] = [
                'rows' => $rows,
                'count' => $count,
                'showing' => count($rows),
                'truncated' => $count > 100
            ];
            
            $totalRows += $count;
        }
        
        echo json_encode([
            'success' => true,
            'data' => $data,
            'total_tables' => count($tables),
            'total_rows' => $totalRows,
            'timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Failed to get database data: ' . $e->getMessage(),
            'timestamp' => date('c')
        ]);
    }
}

function debugDisciplinaryRecords($db) {
    try {
        // Check if table exists and has records
        $stmt = $db->query('SELECT COUNT(*) as total FROM player_disciplinary_records');
        $totalRecords = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
        
        // Get all raw records without joins
        $stmt = $db->query('SELECT * FROM player_disciplinary_records ORDER BY created_at DESC LIMIT 10');
        $rawRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Check for orphaned records (records with member_id that don't exist in team_members)
        $stmt = $db->query('
            SELECT pdr.id, pdr.member_id, pdr.card_type, pdr.created_at
            FROM player_disciplinary_records pdr
            LEFT JOIN team_members tm ON pdr.member_id = tm.id
            WHERE tm.id IS NULL
            ORDER BY pdr.created_at DESC
        ');
        $orphanedRecords = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Check table structure
        $stmt = $db->query("SELECT column_name, data_type, is_nullable, column_default 
                           FROM information_schema.columns 
                           WHERE table_name = 'player_disciplinary_records' 
                           ORDER BY ordinal_position");
        $tableStructure = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode([
            'total_records' => $totalRecords,
            'raw_records' => $rawRecords,
            'orphaned_records' => $orphanedRecords,
            'table_structure' => $tableStructure,
            'debug_timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        echo json_encode([
            'error' => $e->getMessage(),
            'debug_timestamp' => date('c')
        ]);
    }
}

function getDisciplinaryRecords($db) {
    $memberId = $_GET['member_id'] ?? null;
    
    if ($memberId) {
        // Get records for specific member
        $stmt = $db->prepare('
            SELECT pdr.*, tm.name as member_name, t.name as team_name
            FROM player_disciplinary_records pdr
            JOIN team_members tm ON pdr.member_id = tm.id
            JOIN teams t ON tm.team_id = t.id
            WHERE pdr.member_id = ?
            ORDER BY pdr.incident_date DESC, pdr.created_at DESC
        ');
        $stmt->execute([$memberId]);
    } else {
        // Get all records
        $stmt = $db->query('
            SELECT pdr.*, tm.name as member_name, t.name as team_name
            FROM player_disciplinary_records pdr
            JOIN team_members tm ON pdr.member_id = tm.id
            JOIN teams t ON tm.team_id = t.id
            ORDER BY pdr.incident_date DESC, pdr.created_at DESC
        ');
    }
    
    $records = [];
    while ($record = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $records[] = [
            'id' => $record['id'],
            'memberId' => $record['member_id'],
            'memberName' => $record['member_name'],
            'teamName' => $record['team_name'],
            'cardType' => $record['card_type'],
            'reason' => $record['reason'],
            'notes' => $record['notes'],
            'incidentDate' => $record['incident_date'],
            'eventDescription' => $record['event_description'],
            'suspensionMatches' => $record['suspension_matches'] ? (int)$record['suspension_matches'] : null,
            'suspensionServed' => $record['suspension_served'] ? true : false,
            'suspensionServedDate' => $record['suspension_served_date'],
            'createdAt' => $record['created_at']
        ];
    }
    
    echo json_encode($records);
}

function saveDisciplinaryRecords($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $action = $input['action'] ?? 'save';
    $memberId = $input['member_id'] ?? null;
    
    if ($action === 'delete' && isset($input['record_id'])) {
        // Delete specific record
        try {
            $stmt = $db->prepare('DELETE FROM player_disciplinary_records WHERE id = ?');
            $stmt->execute([$input['record_id']]);
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete record']);
        }
        return;
    }
    
    if (!$memberId || !isset($input['records'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        // SIMPLIFIED FIX: Just append new records, don't delete existing ones
        // unless explicitly requested via 'replace_all' action
        
        if ($action === 'replace_all') {
            // Only for full replacement (like editing all records in modal)
            $stmt = $db->prepare('SELECT COUNT(*) as count FROM player_disciplinary_records WHERE member_id = ?');
            $stmt->execute([$memberId]);
            $existingCount = $stmt->fetch(PDO::FETCH_ASSOC)['count'];
            
            if ($existingCount > 0) {
                error_log("Disciplinary: Replacing {$existingCount} existing records for member {$memberId}");
            }
            
            $db->prepare('DELETE FROM player_disciplinary_records WHERE member_id = ?')->execute([$memberId]);
        }
        
        // Insert new records (append mode by default)
        $stmt = $db->prepare('
            INSERT INTO player_disciplinary_records (member_id, card_type, reason, notes, incident_date, event_description, suspension_matches, suspension_served, suspension_served_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        
        foreach ($input['records'] as $record) {
            $suspensionServed = false;
            $suspensionServedDate = null;
            
            if (isset($record['suspensionServed'])) {
                if (is_bool($record['suspensionServed'])) {
                    $suspensionServed = $record['suspensionServed'];
                } elseif (is_string($record['suspensionServed'])) {
                    $suspensionServed = in_array(strtolower($record['suspensionServed']), ['true', '1', 'yes', 'on']);
                } else {
                    $suspensionServed = (bool)$record['suspensionServed'];
                }
            }
            
            // Ensure we never pass empty string for boolean - PostgreSQL strict requirement
            $suspensionServed = (bool)$suspensionServed;
            
            // Only set served date if suspension is actually served
            if ($suspensionServed && isset($record['suspensionServedDate']) && !empty($record['suspensionServedDate'])) {
                $suspensionServedDate = $record['suspensionServedDate'];
            }
            
            // Optimized execution with explicit boolean handling for PostgreSQL
            $stmt->bindValue(1, $memberId, PDO::PARAM_STR);
            $stmt->bindValue(2, $record['cardType'], PDO::PARAM_STR);
            $stmt->bindValue(3, $record['reason'] ?? null, PDO::PARAM_STR);
            $stmt->bindValue(4, $record['notes'] ?? null, PDO::PARAM_STR);
            $stmt->bindValue(5, $record['incidentDate'] ?? null, PDO::PARAM_STR);
            $stmt->bindValue(6, $record['eventDescription'] ?? null, PDO::PARAM_STR);
            $stmt->bindValue(7, $record['suspensionMatches'] ?? null, PDO::PARAM_INT);
            $stmt->bindValue(8, $suspensionServed, PDO::PARAM_BOOL);
            $stmt->bindValue(9, $suspensionServedDate, PDO::PARAM_STR);
            
            $stmt->execute();
        }
        
        $db->commit();
        echo json_encode(['success' => true]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function initializeDatabase($db) {
    // PostgreSQL schema only
    $db->exec('
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            color TEXT DEFAULT \'#2196F3\',
            description TEXT,
            captain_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS team_members (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            name TEXT NOT NULL,
            jersey_number INTEGER,
            gender TEXT CHECK(gender IN (\'male\', \'female\')),
            photo TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            date TIMESTAMP NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS referees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            level TEXT,
            phone TEXT,
            email TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS matches (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            home_team_id TEXT NOT NULL,
            away_team_id TEXT NOT NULL,
            field TEXT,
            match_time TIME,
            main_referee_id TEXT,
            assistant_referee_id TEXT,
            notes TEXT,
            home_score INTEGER DEFAULT NULL,
            away_score INTEGER DEFAULT NULL,
            match_status TEXT DEFAULT \'scheduled\' CHECK(match_status IN (\'scheduled\', \'in_progress\', \'completed\', \'cancelled\')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS match_cards (
            id SERIAL PRIMARY KEY,
            match_id TEXT NOT NULL,
            member_id TEXT NOT NULL,
            team_type TEXT NOT NULL CHECK(team_type IN (\'home\', \'away\')),
            card_type TEXT NOT NULL CHECK(card_type IN (\'yellow\', \'red\')),
            reason TEXT,
            notes TEXT,
            minute INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS match_attendees (
            id SERIAL PRIMARY KEY,
            match_id TEXT NOT NULL,
            member_id TEXT NOT NULL,
            team_type TEXT NOT NULL CHECK(team_type IN (\'home\', \'away\')),
            checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
            UNIQUE(match_id, member_id)
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS general_attendees (
            id SERIAL PRIMARY KEY,
            event_id TEXT NOT NULL,
            member_id TEXT NOT NULL,
            name TEXT NOT NULL,
            team_name TEXT,
            status TEXT DEFAULT \'present\',
            checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            UNIQUE(event_id, member_id)
        )
    ');
    
    $db->exec('
        CREATE TABLE IF NOT EXISTS player_disciplinary_records (
            id SERIAL PRIMARY KEY,
            member_id TEXT NOT NULL,
            card_type TEXT NOT NULL CHECK(card_type IN (\'yellow\', \'red\')),
            reason TEXT,
            notes TEXT,
            incident_date DATE,
            event_description TEXT,
            suspension_matches INTEGER DEFAULT NULL,
            suspension_served BOOLEAN DEFAULT FALSE,
            suspension_served_date DATE DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE
        )
    ');
    
    // Create indexes
    try {
        $db->exec('CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_matches_event_id ON matches(event_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_match_attendees_match_id ON match_attendees(match_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_general_attendees_event_id ON general_attendees(event_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_player_disciplinary_records_member_id ON player_disciplinary_records(member_id)');
        
        // Additional performance indexes for optimized queries
        $db->exec('CREATE INDEX IF NOT EXISTS idx_match_cards_match_id ON match_cards(match_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_matches_event_time ON matches(event_id, match_time)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_team_members_name ON team_members(team_id, name)');
    } catch (Exception $e) {
        // Indexes might already exist, ignore errors
    }
    
    // Add referee columns to existing matches table if they don't exist
    try {
        $db->exec('ALTER TABLE matches ADD COLUMN IF NOT EXISTS main_referee_id TEXT');
        $db->exec('ALTER TABLE matches ADD COLUMN IF NOT EXISTS assistant_referee_id TEXT');
        $db->exec('ALTER TABLE teams ADD COLUMN IF NOT EXISTS captain_id TEXT');
        
        // Add match results columns
        $db->exec('ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_score INTEGER DEFAULT NULL');
        $db->exec('ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_score INTEGER DEFAULT NULL');
        $db->exec('ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_status TEXT DEFAULT \'scheduled\'');
        
        // Add notes column to match_cards
        $db->exec('ALTER TABLE match_cards ADD COLUMN IF NOT EXISTS notes TEXT');
        
        // Add suspension tracking columns to player_disciplinary_records
        $db->exec('ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS suspension_matches INTEGER DEFAULT NULL');
        $db->exec('ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS suspension_served BOOLEAN DEFAULT FALSE');
        $db->exec('ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS suspension_served_date DATE DEFAULT NULL');
        
        // Add indexes for new tables
        $db->exec('CREATE INDEX IF NOT EXISTS idx_match_cards_match_id ON match_cards(match_id)');
    } catch (Exception $e) {
        // Columns might already exist, ignore errors
    }
}
?>