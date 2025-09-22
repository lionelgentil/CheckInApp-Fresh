<?php
/**
 * CheckIn App for BUSC PASS - PHP API (PRODUCTION CLEAN VERSION)
 * RESTful API for team and event management
 */

// Start session for authentication BEFORE any output
session_start();

// Version constant - update this single location to change version everywhere
const APP_VERSION = '6.4.0';

// Authentication configuration
const ADMIN_PASSWORD = 'checkin2024'; // Change this to your desired password
const SESSION_TIMEOUT = 3600; // 1 hour in seconds

// Default photos - use direct URLs for better performance (bypass PHP)
function getDefaultPhoto($gender) {
    // Use direct static URLs - served by Apache without PHP overhead
    return '/photos/default-' . ($gender === 'female' ? 'female' : 'male') . '.svg';
}

// Performance optimization: Cache for database queries
$queryCache = array();

// =====================================
// CENTRALIZED SEASON LOGIC (SINGLE SOURCE OF TRUTH)
// =====================================

/**
 * Get current season start epoch timestamp
 * IMPORTANT: This must match the logic in core.js getCurrentSeason()
 */
function getCurrentSeasonStartEpoch() {
    $now = time();
    $currentYear = date('Y', $now);
    $currentMonth = (int)date('n', $now); // 1-12
    
    // Spring season: Jan 1st to Jun 30th
    // Fall season: Jul 1st to Dec 31st
    if ($currentMonth >= 1 && $currentMonth <= 6) {
        // Current Spring season: Jan 1st to Jun 30th
        return strtotime($currentYear . '-01-01 00:00:00');
    } else {
        // Current Fall season: Jul 1st to Dec 31st  
        return strtotime($currentYear . '-07-01 00:00:00');
    }
}

// =====================================

// Helper function to get disciplinary records count with caching
function getDisciplinaryRecordsCount($db, $bustCache = false) {
    global $queryCache;
    $cacheKey = 'disciplinary_records_count';
    
    if (!$bustCache && isset($queryCache[$cacheKey])) {
        return $queryCache[$cacheKey];
    }
    
    $stmt = $db->query('SELECT COUNT(*) as total FROM player_disciplinary_records');
    $count = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
    $queryCache[$cacheKey] = $count;
    
    return $count;
}

// Database ping function to keep connection warm
function pingDatabase($db) {
    $start = microtime(true);
    try {
        $stmt = $db->query('SELECT 1');
        $result = $stmt->fetch();
        $ping_time = round((microtime(true) - $start) * 1000, 2);
        return $ping_time . 'ms';
    } catch (Exception $e) {
        return 'failed: ' . $e->getMessage();
    }
}

// Authentication functions
function isAuthenticated() {
    return isset($_SESSION['admin_authenticated']) && 
           $_SESSION['admin_authenticated'] === true &&
           isset($_SESSION['auth_timestamp']) &&
           (time() - $_SESSION['auth_timestamp']) < SESSION_TIMEOUT;
}

function authenticate($password) {
    if ($password === ADMIN_PASSWORD) {
        $_SESSION['admin_authenticated'] = true;
        $_SESSION['auth_timestamp'] = time();
        return true;
    }
    return false;
}

function requireAuth() {
    if (!isAuthenticated()) {
        http_response_code(401);
        echo json_encode(array('error' => 'Authentication required'));
        exit();
    }
    // Refresh session timestamp on authenticated requests
    $_SESSION['auth_timestamp'] = time();
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
$possibleVars = array('DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL');
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
    echo json_encode(array(
        'error' => 'PostgreSQL database required. No DATABASE_URL found.',
        'instructions' => 'Add PostgreSQL service in Railway and connect DATABASE_URL variable',
        'available_drivers' => PDO::getAvailableDrivers(),
        'debug_env_vars' => array_keys(array_filter($_ENV, function($key) {
            return strpos(strtolower($key), 'database') !== false || 
                   strpos(strtolower($key), 'postgres') !== false ||
                   strpos($key, 'URL') !== false;
        }, ARRAY_FILTER_USE_KEY))
    ));
    exit();
}

// Fail if PostgreSQL driver not available
if (!in_array('pgsql', PDO::getAvailableDrivers())) {
    http_response_code(500);
    echo json_encode(array(
        'error' => 'PostgreSQL driver not available',
        'available_drivers' => PDO::getAvailableDrivers(),
        'php_extensions' => get_loaded_extensions()
    ));
    exit();
}

try {
    // Parse PostgreSQL URL and convert to PDO connection string
    $parsedUrl = parse_url($databaseUrl);
    
    $host = $parsedUrl['host'];
    $port = isset($parsedUrl['port']) ? $parsedUrl['port'] : 5432;
    $dbname = ltrim($parsedUrl['path'], '/');
    $user = $parsedUrl['user'];
    $password = $parsedUrl['pass'];
    
    // Build PostgreSQL PDO connection string with optimizations
    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname};connect_timeout=10";
    
    // PDO options for better performance and persistent connections
    $options = array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_PERSISTENT => true, // Use persistent connections
        PDO::ATTR_TIMEOUT => 10, // Connection timeout
        PDO::ATTR_EMULATE_PREPARES => false, // Use native prepared statements
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC // Default fetch mode
    );
    
    $db = new PDO($dsn, $user, $password, $options);
    
    // Initialize PostgreSQL database
    initializeDatabase($db);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(array(
        'error' => 'PostgreSQL connection failed: ' . $e->getMessage(),
        'database_url_found' => !empty($databaseUrl),
        'dsn' => isset($dsn) ? $dsn : 'failed_to_build',
        'available_drivers' => PDO::getAvailableDrivers()
    ));
    exit();
}

// Get request path
$path = isset($_GET['path']) ? $_GET['path'] : '';
$method = $_SERVER['REQUEST_METHOD'];

// Route requests
try {
    // Extract the main endpoint from the path
    $pathSegments = explode('/', $path);  
    $endpoint = $pathSegments[0];
    
    switch ($endpoint) {
        case 'auth':
            // Handle auth sub-routes
            if ($path === 'auth/check' && $method === 'GET') {
                echo json_encode(array(
                    'authenticated' => isAuthenticated(),
                    'session_remaining' => isAuthenticated() ? SESSION_TIMEOUT - (time() - $_SESSION['auth_timestamp']) : 0
                ));
            } elseif ($path === 'auth/login' && $method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $password = isset($input['password']) ? $input['password'] : '';
                
                if (authenticate($password)) {
                    echo json_encode(array(
                        'success' => true,
                        'message' => 'Authentication successful'
                    ));
                } else {
                    http_response_code(401);
                    echo json_encode(array(
                        'success' => false,
                        'message' => 'Invalid password'
                    ));
                }
            } elseif ($path === 'auth/logout' && $method === 'POST') {
                session_destroy();
                echo json_encode(array('success' => true, 'message' => 'Logged out successfully'));
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Auth endpoint not found']);
            }
            break;
            
        case 'version':
            // Version endpoint for dynamic cache-busting
            if ($method === 'GET') {
                echo json_encode(array('version' => APP_VERSION));
            }
            break;
            
        case 'health':
            echo json_encode(array(
                'status' => 'OK',
                'version' => APP_VERSION,
                'timestamp' => date('c'),
                'database' => 'PostgreSQL',
                'php_version' => PHP_VERSION,
                'persistent' => true,
                'db_ping' => pingDatabase($db) // Add DB ping
            ));
            break;
            
        case 'keep-alive':
            // Lightweight endpoint to keep database connections warm
            if ($method === 'GET') {
                $start = microtime(true);
                
                // Ping database and get basic stats
                $db_ping = pingDatabase($db);
                $team_count = $db->query('SELECT COUNT(*) FROM teams')->fetchColumn();
                $event_count = $db->query('SELECT COUNT(*) FROM events')->fetchColumn();
                
                $total_time = round((microtime(true) - $start) * 1000, 2);
                
                echo json_encode(array(
                    'status' => 'alive',
                    'db_ping' => $db_ping,
                    'stats' => array(
                        'teams' => (int)$team_count,
                        'events' => (int)$event_count
                    ),
                    'total_time' => $total_time . 'ms',
                    'timestamp' => time()
                ));
            }
            break;
            
        case 'teams':
            if ($method === 'GET') {
                getTeams($db);
            } elseif ($method === 'POST') {
                requireAuth(); // Require authentication for modifications
                saveTeams($db);
            }
            break;
            
        case 'teams-no-photos':
            // Teams with members but WITHOUT photo data for faster loading
            if ($method === 'GET') {
                getTeamsWithoutPhotos($db);
            }
            break;
            
        case 'teams-basic':
            // Lightweight teams endpoint for performance optimization
            if ($method === 'GET') {
                getTeamsBasic($db);
            }
            break;
            
        case 'teams-specific':
            // Load specific teams by IDs for match check-in performance
            if ($method === 'GET') {
                getSpecificTeams($db);
            }
            break;
            
        case 'events':
            if ($method === 'GET') {
                getEvents($db);
            } elseif ($method === 'POST') {
                requireAuth(); // Require authentication for modifications
                saveEvents($db);
            }
            break;
            
        case 'event':
            // Individual event operations (more efficient)
            if ($method === 'POST') {
                requireAuth();
                createSingleEvent($db);
            } elseif ($method === 'PUT') {
                requireAuth();
                updateSingleEvent($db);
            } elseif ($method === 'DELETE') {
                requireAuth();
                deleteSingleEvent($db);
            }
            break;
            
        case 'match':
            // Individual match operations for efficiency
            if ($method === 'POST') {
                requireAuth();
                createSingleMatch($db);
            } elseif ($method === 'PUT') {
                requireAuth();
                updateSingleMatch($db);
            } elseif ($method === 'DELETE') {
                requireAuth();
                deleteSingleMatch($db);
            }
            break;
            
        case 'attendance':
            // Attendance-only endpoint for view.html (no admin auth required)
            if ($method === 'POST') {
                updateAttendanceOnly($db);
            }
            break;
            
        case 'teams/member-profile':
            // Update limited member profile data (jersey number, photo) - no admin auth required
            if ($method === 'POST') {
                updateMemberProfile($db);
            }
            break;
            
        case 'teams/member-create':
            // Create new team member - requires admin auth
            if ($method === 'POST') {
                requireAuth();
                createMemberProfile($db);
            }
            break;
            
        case 'teams/member-delete':
            // Delete team member - requires admin auth
            if ($method === 'POST') {
                requireAuth();
                deleteMemberProfile($db);
            }
            break;
            
        case 'teams/member-deactivate':
            // Deactivate team member (soft delete) - requires admin auth
            if ($method === 'POST') {
                requireAuth();
                deactivateMemberProfile($db);
            }
            break;
            
        case 'teams/member-search-inactive':
            // Search for inactive members by name - requires admin auth
            if ($method === 'GET') {
                requireAuth();
                searchInactiveMembers($db);
            }
            break;
            
        case 'teams/member-reactivate':
            // Reactivate inactive member and add to team - requires admin auth
            if ($method === 'POST') {
                requireAuth();
                reactivateMemberProfile($db);
            }
            break;
            
        case 'match-results':
            // Match results endpoint for view.html (no admin auth required)
            if ($method === 'POST') {
                updateMatchResults($db);
            }
            break;
            
        case 'players/cards':
            // Add cards to players - no admin auth required for view.html referees
            if ($method === 'POST') {
                addPlayerCards($db);
            }
            break;
            
        case 'referees':
            if ($method === 'GET') {
                getReferees($db);
            } elseif ($method === 'POST') {
                requireAuth(); // Require authentication for modifications
                saveReferees($db);
            }
            break;
            
        case 'captains':
            // Captain management endpoints
            if ($method === 'GET') {
                // Get captains for a team
                $teamId = $_GET['team_id'] ?? null;
                if ($teamId) {
                    echo json_encode(getTeamCaptains($db, $teamId));
                } else {
                    echo json_encode(getTeamCaptains($db));
                }
            } elseif ($method === 'POST') {
                requireAuth();
                // Add captain
                $input = json_decode(file_get_contents('php://input'), true);
                $teamId = $input['team_id'] ?? null;
                $memberId = $input['member_id'] ?? null;
                
                if (!$teamId || !$memberId) {
                    http_response_code(400);
                    echo json_encode(['error' => 'team_id and member_id are required']);
                    return;
                }
                
                if (addTeamCaptain($db, $teamId, $memberId)) {
                    echo json_encode(['success' => true, 'message' => 'Captain added successfully']);
                } else {
                    http_response_code(500);
                    echo json_encode(['error' => 'Failed to add captain']);
                }
            } elseif ($method === 'DELETE') {
                requireAuth();
                // Remove captain
                $teamId = $_GET['team_id'] ?? null;
                $memberId = $_GET['member_id'] ?? null;
                
                if (!$teamId || !$memberId) {
                    http_response_code(400);
                    echo json_encode(['error' => 'team_id and member_id are required']);
                    return;
                }
                
                if (removeTeamCaptain($db, $teamId, $memberId)) {
                    echo json_encode(['success' => true, 'message' => 'Captain removed successfully']);
                } else {
                    http_response_code(500);
                    echo json_encode(['error' => 'Failed to remove captain']);
                }
            }
            break;
            
        case 'disciplinary-records':
            if ($method === 'GET') {
                getDisciplinaryRecords($db);
            } elseif ($method === 'POST') {
                requireAuth(); // Require authentication for modifications
                saveDisciplinaryRecords($db);
            }
            break;
            
        case 'team-card-summary':
            if ($method === 'GET') {
                getTeamCardSummary($db);
            }
            break;
            
        case 'photos':
            // Photo serving and upload endpoints
            if ($method === 'GET') {
                servePhoto($db);
            } elseif ($method === 'POST') {
                requireAuth(); // Require authentication for photo uploads
                uploadPhoto($db);
            } elseif ($method === 'DELETE') {
                requireAuth(); // Require authentication for photo deletions
                deletePhoto($db);
            }
            break;
            
        case 'current-season':
            if ($method === 'GET') {
                getCurrentSeason($db);
            }
            break;
            
        case 'suspensions':
            if ($method === 'POST') {
                requireAuth();
                applySuspension($db);
            } elseif ($method === 'PUT') {
                requireAuth();
                updateSuspension($db);
            } elseif ($method === 'DELETE') {
                requireAuth();
                deleteSuspension($db);
            } elseif ($method === 'GET') {
                getSuspensions($db);
            }
            break;
            
        case 'suspension-cleanup':
            if ($method === 'POST') {
                requireAuth();
                cleanupOrphanedSuspensions($db);
            } elseif ($method === 'GET') {
                checkOrphanedSuspensions($db);
            }
            break;
            
        case 'db-schema':
            // Database schema inspection endpoint
            if ($method === 'GET') {
                requireAuth();
                getDbSchema($db);
            }
            break;
            
        case 'db-maintenance':
            // Database maintenance operations
            if ($method === 'POST') {
                // Check if this is the team_managers table creation (temporary exception)
                $input = json_decode(file_get_contents('php://input'), true);
                if ($input && isset($input['sql']) && 
                    (strpos($input['sql'], 'team_managers') !== false) && 
                    (strpos($input['sql'], 'CREATE TABLE') !== false || strpos($input['sql'], 'CREATE INDEX') !== false)) {
                    // Allow team_managers table/index creation without auth
                    executeDbMaintenance($db);
                } else {
                    // Regular auth required for other operations
                    requireAuth();
                    executeDbMaintenance($db);
                }
            }
            break;
            
        case 'team-managers':
            // Team managers endpoint - no auth required for manager.html
            handleTeamManagers($db, $method, $path);
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

// Individual event operations for efficiency (replaces bulk operations)
function createSingleEvent($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id']) || !isset($input['name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Event ID and name are required']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        // Use epoch timestamp directly (no more string date conversion)
        $dateEpoch = $input['date_epoch'] ?? time();
        
        // Create the event with pure epoch format
        $stmt = $db->prepare('
            INSERT INTO events (id, name, date_epoch, description)
            VALUES (?, ?, ?, ?)
        ');
        $stmt->execute([
            $input['id'],
            $input['name'],
            $dateEpoch, // Pure epoch storage
            $input['description'] ?? ''
        ]);
        
        // Create matches if provided
        if (isset($input['matches']) && is_array($input['matches'])) {
            foreach ($input['matches'] as $match) {
                // Use epoch timestamp directly (no more string time conversion)
                $matchTimeEpoch = $match['time_epoch'] ?? time();
                
                // Store pure epoch format
                $stmt = $db->prepare('
                    INSERT INTO matches (id, event_id, home_team_id, away_team_id, field, match_time_epoch, main_referee_id, assistant_referee_id, notes, home_score, away_score, match_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ');
                $stmt->execute([
                    $match['id'],
                    $input['id'],
                    $match['homeTeamId'],
                    $match['awayTeamId'],
                    $match['field'] ?? null,
                    $matchTimeEpoch, // Pure epoch storage
                    $match['mainRefereeId'] ?? null,
                    $match['assistantRefereeId'] ?? null,
                    $match['notes'] ?? null,
                    $match['homeScore'] ?? null,
                    $match['awayScore'] ?? null,
                    $match['matchStatus'] ?? 'scheduled'
                ]);
            }
        }
        
        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Event created successfully']);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function updateSingleEvent($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    $eventId = $_GET['id'] ?? $input['id'] ?? null;
    
    if (!$eventId) {
        http_response_code(400);
        echo json_encode(['error' => 'Event ID is required']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        // Update event basic info
        if (isset($input['name']) || isset($input['date_epoch']) || isset($input['description'])) {
            $updates = [];
            $params = [];
            
            if (isset($input['name'])) {
                $updates[] = 'name = ?';
                $params[] = $input['name'];
            }
            
            if (isset($input['date_epoch'])) {
                $updates[] = 'date_epoch = ?';
                $params[] = $input['date_epoch'];
            }
            
            if (isset($input['description'])) {
                $updates[] = 'description = ?';
                $params[] = $input['description'];
            }
            
            $params[] = $eventId;
            $sql = 'UPDATE events SET ' . implode(', ', $updates) . ' WHERE id = ?';
            $stmt = $db->prepare($sql);
            $stmt->execute($params);
        }
        
        // Update matches if provided (replace all matches for this event)
        if (isset($input['matches'])) {
            // Remove existing matches for this event and cleanup related suspensions
            $db->prepare('DELETE FROM player_suspensions WHERE card_source_id IN (SELECT id FROM matches WHERE event_id = ?)')->execute([$eventId]);
            $db->prepare('DELETE FROM match_cards WHERE match_id IN (SELECT id FROM matches WHERE event_id = ?)')->execute([$eventId]);
            $db->prepare('DELETE FROM match_attendees WHERE match_id IN (SELECT id FROM matches WHERE event_id = ?)')->execute([$eventId]);
            $db->prepare('DELETE FROM matches WHERE event_id = ?')->execute([$eventId]);
            
            // Add new matches
            foreach ($input['matches'] as $match) {
                $matchTimeEpoch = $match['time_epoch'] ?? time();
                
                $stmt = $db->prepare('
                    INSERT INTO matches (id, event_id, home_team_id, away_team_id, field, match_time_epoch, main_referee_id, assistant_referee_id, notes, home_score, away_score, match_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ');
                $stmt->execute([
                    $match['id'],
                    $eventId,
                    $match['homeTeamId'],
                    $match['awayTeamId'],
                    $match['field'] ?? null,
                    $matchTimeEpoch,
                    $match['mainRefereeId'] ?? null,
                    $match['assistantRefereeId'] ?? null,
                    $match['notes'] ?? null,
                    $match['homeScore'] ?? null,
                    $match['awayScore'] ?? null,
                    $match['matchStatus'] ?? 'scheduled'
                ]);
                
                // Add attendees if provided
                if (isset($match['homeTeamAttendees'])) {
                    foreach ($match['homeTeamAttendees'] as $attendee) {
                        $checkedInEpoch = $attendee['checkedInAt_epoch'] ?? time();
                        $stmt = $db->prepare('
                            INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at_epoch)
                            VALUES (?, ?, ?, ?)
                        ');
                        $stmt->execute([$match['id'], $attendee['memberId'], 'home', $checkedInEpoch]);
                    }
                }
                
                if (isset($match['awayTeamAttendees'])) {
                    foreach ($match['awayTeamAttendees'] as $attendee) {
                        $checkedInEpoch = $attendee['checkedInAt_epoch'] ?? time();
                        $stmt = $db->prepare('
                            INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at_epoch)
                            VALUES (?, ?, ?, ?)
                        ');
                        $stmt->execute([$match['id'], $attendee['memberId'], 'away', $checkedInEpoch]);
                    }
                }
                
                // Add cards if provided
                if (isset($match['cards']) && is_array($match['cards'])) {
                    foreach ($match['cards'] as $card) {
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
                    }
                }
            }
        }
        
        // Update general attendees if provided
        if (isset($input['attendees'])) {
            // Remove existing attendees
            $db->prepare('DELETE FROM general_attendees WHERE event_id = ?')->execute([$eventId]);
            
            // Add new attendees
            foreach ($input['attendees'] as $attendee) {
                $checkedInEpoch = $attendee['checkedInAt_epoch'] ?? time();
                $stmt = $db->prepare('
                    INSERT INTO general_attendees (event_id, member_id, name, team_name, status, checked_in_at_epoch)
                    VALUES (?, ?, ?, ?, ?, ?)
                ');
                $stmt->execute([
                    $eventId,
                    $attendee['memberId'],
                    $attendee['name'],
                    $attendee['team'] ?? null,
                    $attendee['status'] ?? 'present',
                    $checkedInEpoch
                ]);
            }
        }
        
        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Event updated successfully']);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function deleteSingleEvent($db) {
    $eventId = $_GET['id'] ?? null;
    
    if (!$eventId) {
        http_response_code(400);
        echo json_encode(['error' => 'Event ID is required']);
        return;
    }
    
    try {
        // Delete event (cascades to matches, attendees, cards due to foreign key constraints)
        $stmt = $db->prepare('DELETE FROM events WHERE id = ?');
        $result = $stmt->execute([$eventId]);
        
        if ($result && $stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Event deleted successfully']);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Event not found']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete event: ' . $e->getMessage()]);
    }
}

function getTeams($db) {
    // Optimized single query with JOIN to get all teams and members with photos from separate table
    // Only include active members (active = TRUE or active IS NULL for backward compatibility)
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
            CASE 
                WHEN tm.photo = \'has_photo\' THEN \'has_photo\'
                ELSE tm.photo
            END AS photo_flag,
            mp.photo_data
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id AND (tm.active IS NULL OR tm.active = TRUE)
        LEFT JOIN member_photos mp ON tm.id = mp.member_id
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
            // Generate photo URL - prioritize migrated filenames over backup data
            if ($row['photo_flag'] && $row['photo_flag'] !== 'has_photo') {
                // After migration: team_members.photo field contains filenames (preferred)
                $photoValue = $row['photo_flag'];
                
                // Check if it's already base64 data (legacy)
                if (strpos($photoValue, 'data:image/') === 0) {
                    // It's base64 data, use directly
                    $photo = $photoValue;
                } else {
                    // Check if it's a filename with valid extension (post-migration format)
                    if (preg_match('/\.(jpg|jpeg|png|webp)$/i', $photoValue)) {
                        // It's a filename - use direct static URL (bypass PHP for better performance)
                        // Check if it already starts with /photos/ to avoid double prefix
                        if (strpos($photoValue, '/photos/') === 0) {
                            $photo = $photoValue;
                        } else {
                            $photo = '/photos/' . $photoValue;
                        }
                    } else {
                        // Legacy file-based storage - convert to API URL
                        // Handle different photo storage formats
                        if (strpos($photoValue, '/photos/members/') === 0) {
                            // Full path format: /photos/members/filename.ext
                            $photoValue = basename($photoValue);
                        } elseif (strpos($photoValue, '/api/photos') === 0) {
                            // Already a URL format: /api/photos?filename=xyz - extract filename
                            $parsedUrl = parse_url($photoValue);
                            if ($parsedUrl && isset($parsedUrl['query'])) {
                                parse_str($parsedUrl['query'], $query);
                                if (isset($query['filename'])) {
                                    $photoValue = $query['filename'];
                                    // Clean recursively in case of nested URLs
                                    while (strpos($photoValue, '/api/photos') === 0) {
                                        $nestedUrl = parse_url($photoValue);
                                        if ($nestedUrl && isset($nestedUrl['query'])) {
                                            parse_str($nestedUrl['query'], $nestedQuery);
                                            if (isset($nestedQuery['filename'])) {
                                                $photoValue = $nestedQuery['filename'];
                                            } else {
                                                break;
                                            }
                                        } else {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        // If it's already just a filename (preferred), use as-is
                        
                        // Check if it already starts with /photos/ to avoid double prefix
                        if (strpos($photoValue, '/photos/') === 0) {
                            $photo = $photoValue;
                        } else {
                            $photo = '/photos/' . $photoValue;
                        }
                    }
                }
            } elseif ($row['photo_data']) {
                // Fallback to member_photos table data (backup) only if no filename in team_members
                $photo = $row['photo_data'];
            } elseif ($row['photo_flag'] === 'has_photo') {
                // Member has photo in member_photos table but photo_data was NULL
                // This shouldn't happen, but fallback to gender default
                $photo = getDefaultPhoto($row['gender']);
            } else {
                $photo = getDefaultPhoto($row['gender']);
            }
            
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
    
    // Add captain information from new team_captains table
    $allCaptains = getTeamCaptains($db);
    foreach ($teams as &$team) {
        $team['captains'] = $allCaptains[$team['id']] ?? [];
        
        // For backward compatibility, also check if any of the captains match the legacy captainId
        if ($team['captainId'] && empty($team['captains'])) {
            // Legacy captain exists but not in new table - migrate it
            addTeamCaptain($db, $team['id'], $team['captainId']);
            $team['captains'] = getTeamCaptains($db, $team['id']);
        }
    }
    
    echo json_encode($teams);
}

function getTeamsWithoutPhotos($db) {
    // Fast teams endpoint optimized for static photo serving
    // Only include active members (active = TRUE or active IS NULL for backward compatibility)
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
        LEFT JOIN team_members tm ON t.id = tm.team_id AND (tm.active IS NULL OR tm.active = TRUE)
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
            // Generate photo URL - same logic as getTeams() for consistency
            if ($row['photo']) {
                // Check if it's already base64 data (legacy)
                if (strpos($row['photo'], 'data:image/') === 0) {
                    // It's base64 data, use directly
                    $photo = $row['photo'];
                } else {
                    // Check if it's a filename with valid extension (post-migration format)
                    if (preg_match('/\.(jpg|jpeg|png|webp)$/i', $row['photo'])) {
                        // It's a filename - use direct static URL (bypass PHP for better performance)
                        // Check if it already starts with /photos/ to avoid double prefix
                        if (strpos($row['photo'], '/photos/') === 0) {
                            $photo = $row['photo'];
                        } else {
                            $photo = '/photos/' . $row['photo'];
                        }
                    } else {
                        // Legacy file-based storage - convert to API URL
                        $photoValue = $row['photo'];
                        if (strpos($photoValue, '/photos/members/') === 0) {
                            $photoValue = basename($photoValue);
                        } elseif (strpos($photoValue, '/api/photos') === 0) {
                            $parsedUrl = parse_url($photoValue);
                            if ($parsedUrl && isset($parsedUrl['query'])) {
                                parse_str($parsedUrl['query'], $query);
                                if (isset($query['filename'])) {
                                    $photoValue = $query['filename'];
                                }
                            }
                        }
                        // Check if it already starts with /photos/ to avoid double prefix
                        if (strpos($photoValue, '/photos/') === 0) {
                            $photo = $photoValue;
                        } else {
                            $photo = '/photos/' . $photoValue;
                        }
                    }
                }
            } else {
                $photo = getDefaultPhoto($row['gender']);
            }
            
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
    
    // Add captain information from new team_captains table
    $allCaptains = getTeamCaptains($db);
    foreach ($teams as &$team) {
        $team['captains'] = $allCaptains[$team['id']] ?? [];
        
        // For backward compatibility, also check if any of the captains match the legacy captainId
        if ($team['captainId'] && empty($team['captains'])) {
            // Legacy captain exists but not in new table - migrate it
            addTeamCaptain($db, $team['id'], $team['captainId']);
            $team['captains'] = getTeamCaptains($db, $team['id']);
        }
    }
    
    echo json_encode($teams);
}

function getTeamsBasic($db) {
    // Lightweight teams endpoint - only essential data without player photos for performance
    // Only count active members (active = TRUE or active IS NULL for backward compatibility)  
    $stmt = $db->query('
        SELECT 
            t.id,
            t.name,
            t.category,
            t.color,
            t.description,
            t.captain_id,
            COUNT(tm.id) as member_count
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id AND (tm.active IS NULL OR tm.active = TRUE)
        GROUP BY t.id, t.name, t.category, t.color, t.description, t.captain_id
        ORDER BY t.name
    ');
    
    $teams = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $teams[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'category' => $row['category'],
            'colorData' => $row['color'] ?? '#2196F3',
            'description' => $row['description'],
            'captainId' => $row['captain_id'],
            'memberCount' => (int)$row['member_count']
        ];
    }
    
    // Add captain information from new team_captains table
    $allCaptains = getTeamCaptains($db);
    foreach ($teams as &$team) {
        $team['captains'] = $allCaptains[$team['id']] ?? [];
        
        // For backward compatibility, also check if any of the captains match the legacy captainId
        if ($team['captainId'] && empty($team['captains'])) {
            // Legacy captain exists but not in new table - migrate it
            addTeamCaptain($db, $team['id'], $team['captainId']);
            $team['captains'] = getTeamCaptains($db, $team['id']);
        }
    }
    
    echo json_encode($teams);
}

function getSpecificTeams($db) {
    // Load specific teams by IDs for match check-in performance optimization
    $teamIds = $_GET['ids'] ?? '';
    
    if (empty($teamIds)) {
        http_response_code(400);
        echo json_encode(['error' => 'Team IDs parameter required']);
        return;
    }
    
    // Parse comma-separated team IDs
    $teamIdArray = array_filter(array_map('trim', explode(',', $teamIds)));
    
    if (empty($teamIdArray)) {
        http_response_code(400);
        echo json_encode(['error' => 'Valid team IDs required']);
        return;
    }
    
    // Create placeholders for prepared statement
    $placeholders = str_repeat('?,', count($teamIdArray) - 1) . '?';
    
    // Optimized query similar to getTeams() but filtered by specific team IDs
    $stmt = $db->prepare("
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
            CASE 
                WHEN tm.photo = 'has_photo' THEN 'has_photo'
                ELSE tm.photo
            END AS photo_flag,
            CASE 
                WHEN tm.photo = 'has_photo' THEN 'has_photo'
                WHEN tm.photo IS NOT NULL AND tm.photo != '' THEN 'has_photo'
                ELSE NULL
            END AS has_photo,
            mp.photo_data
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id AND (tm.active IS NULL OR tm.active = TRUE)
        LEFT JOIN member_photos mp ON tm.id = mp.member_id
        WHERE t.id IN ({$placeholders})
        ORDER BY t.name, tm.name
    ");
    
    $stmt->execute($teamIdArray);
    
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
        
        // Add member to current team (if member exists) - using same photo logic as getTeams()
        if ($row['member_id']) {
            // Generate photo URL - prioritize migrated filenames over backup data
            if ($row['photo_flag'] && $row['photo_flag'] !== 'has_photo') {
                // After migration: team_members.photo field contains filenames (preferred)
                $photoValue = $row['photo_flag'];
                
                // Check if it's already base64 data (legacy)
                if (strpos($photoValue, 'data:image/') === 0) {
                    // It's base64 data, use directly
                    $photo = $photoValue;
                } else {
                    // Check if it's a filename with valid extension (post-migration format)
                    if (preg_match('/\.(jpg|jpeg|png|webp)$/i', $photoValue)) {
                        // It's a filename - use direct static URL (bypass PHP for better performance)
                        // Check if it already starts with /photos/ to avoid double prefix
                        if (strpos($photoValue, '/photos/') === 0) {
                            $photo = $photoValue;
                        } else {
                            $photo = '/photos/' . $photoValue;
                        }
                    } else {
                        // Legacy file-based storage - convert to API URL
                        // Handle different photo storage formats (same logic as getTeams)
                        if (strpos($photoValue, '/photos/members/') === 0) {
                            $photoValue = basename($photoValue);
                        } elseif (strpos($photoValue, '/api/photos') === 0) {
                            $parsedUrl = parse_url($photoValue);
                            if ($parsedUrl && isset($parsedUrl['query'])) {
                                parse_str($parsedUrl['query'], $query);
                                if (isset($query['filename'])) {
                                    $photoValue = $query['filename'];
                                    // Clean recursively in case of nested URLs
                                    while (strpos($photoValue, '/api/photos') === 0) {
                                        $nestedUrl = parse_url($photoValue);
                                        if ($nestedUrl && isset($nestedUrl['query'])) {
                                            parse_str($nestedUrl['query'], $nestedQuery);
                                            if (isset($nestedQuery['filename'])) {
                                                $photoValue = $nestedQuery['filename'];
                                            } else {
                                                break;
                                            }
                                        } else {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Check if it already starts with /photos/ to avoid double prefix
                        if (strpos($photoValue, '/photos/') === 0) {
                            $photo = $photoValue;
                        } else {
                            $photo = '/photos/' . $photoValue;
                        }
                    }
                }
            } elseif ($row['photo_data']) {
                // Fallback to member_photos table data (backup) only if no filename in team_members
                $photo = $row['photo_data'];
            } elseif ($row['photo_flag'] === 'has_photo') {
                // Member has photo in member_photos table but photo_data was NULL
                $photo = getDefaultPhoto($row['gender']);
            } else {
                $photo = getDefaultPhoto($row['gender']);
            }
            
            $currentTeam['members'][] = [
                'id' => $row['member_id'],
                'name' => $row['member_name'],
                'jerseyNumber' => $row['jersey_number'] ? (int)$row['jersey_number'] : null,
                'gender' => $row['gender'],
                'photo' => $photo,
                'hasCustomPhoto' => $row['has_photo'] ? true : false
            ];
        }
    }
    
    // Don't forget the last team
    if ($currentTeam) {
        $teams[] = $currentTeam;
    }
    
    // Add captain information from new team_captains table
    $allCaptains = getTeamCaptains($db);
    foreach ($teams as &$team) {
        $team['captains'] = $allCaptains[$team['id']] ?? [];
        
        // For backward compatibility, also check if any of the captains match the legacy captainId
        if ($team['captainId'] && empty($team['captains'])) {
            // Legacy captain exists but not in new table - migrate it
            addTeamCaptain($db, $team['id'], $team['captainId']);
            $team['captains'] = getTeamCaptains($db, $team['id']);
        }
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
        
        // Clean up teams that are no longer in the input data
        // First collect all team IDs from input
        $incomingTeamIds = [];
        foreach ($input as $team) {
            $incomingTeamIds[] = $team['id'];
        }
        
        // Delete teams that are not in the incoming data
        // This is safe because we use UPSERT for members, preserving disciplinary records
        if (!empty($incomingTeamIds)) {
            $placeholders = str_repeat('?,', count($incomingTeamIds) - 1) . '?';
            $stmt = $db->prepare("DELETE FROM teams WHERE id NOT IN ({$placeholders})");
            $stmt->execute($incomingTeamIds);
        }
        
        foreach ($input as $team) {
            // Use UPSERT for teams too to avoid deletion cascades
            $stmt = $db->prepare('
                INSERT INTO teams (id, name, category, color, description, captain_id)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    category = EXCLUDED.category,
                    color = EXCLUDED.color,
                    description = EXCLUDED.description,
                    captain_id = EXCLUDED.captain_id
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
                    // Clean photo value before storing - only store filenames, not URLs
                    $photoValue = $member['photo'] ?? null;
                    if ($photoValue) {
                        // Extract filename from various formats
                        if (strpos($photoValue, '/photos/members/') === 0) {
                            $photoValue = basename($photoValue);
                        } elseif (strpos($photoValue, '/api/photos') === 0) {
                            $parsedUrl = parse_url($photoValue);
                            if ($parsedUrl && isset($parsedUrl['query'])) {
                                parse_str($parsedUrl['query'], $query);
                                if (isset($query['filename'])) {
                                    $photoValue = $query['filename'];
                                }
                            }
                        }
                        // If it's already just a filename, use as-is
                    }
                    
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
                        $photoValue
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
    // Step 1: Get all events with pure epoch timestamps
    $stmt = $db->query('SELECT id, name, description, date_epoch FROM events ORDER BY date_epoch');
    $events = [];
    $eventIds = [];
    
    while ($event = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Use epoch timestamp directly (pure epoch system)
        $eventEpoch = $event['date_epoch'];
        
        $events[$event['id']] = [
            'id' => $event['id'],
            'name' => $event['name'],
            'date_epoch' => $eventEpoch, // Pure epoch timestamp (UTC)
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
    
    // Step 2: Get all matches with pure epoch timestamps
    $eventIdsPlaceholder = str_repeat('?,', count($eventIds) - 1) . '?';
    $stmt = $db->prepare("
        SELECT id, event_id, home_team_id, away_team_id, field, match_time_epoch,
               main_referee_id, assistant_referee_id, notes, home_score, away_score, match_status
        FROM matches 
        WHERE event_id IN ({$eventIdsPlaceholder}) 
        ORDER BY event_id, match_time_epoch
    ");
    $stmt->execute($eventIds);
    
    $matches = [];
    $matchIds = [];
    while ($match = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Use epoch timestamp directly (pure epoch system)
        $matchEpoch = $match['match_time_epoch'];
        
        $matches[$match['id']] = [
            'id' => $match['id'],
            'eventId' => $match['event_id'],
            'homeTeamId' => $match['home_team_id'],
            'awayTeamId' => $match['away_team_id'],
            'field' => $match['field'],
            'time_epoch' => $matchEpoch, // Pure epoch timestamp (UTC)
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
        // Step 3: Get all attendees with epoch timestamps
        $matchIdsPlaceholder = str_repeat('?,', count($matchIds) - 1) . '?';
        $stmt = $db->prepare("
            SELECT ma.*, tm.name as member_name
            FROM match_attendees ma
            JOIN team_members tm ON ma.member_id = tm.id
            WHERE ma.match_id IN ({$matchIdsPlaceholder})
        ");
        $stmt->execute($matchIds);
        
        while ($attendee = $stmt->fetch(PDO::FETCH_ASSOC)) {
            // Use epoch timestamp directly (pure epoch system)
            $checkedInEpoch = $attendee['checked_in_at_epoch'];
            
            $attendeeData = [
                'memberId' => $attendee['member_id'],
                'name' => $attendee['member_name'],
                'checkedInAt_epoch' => $checkedInEpoch // Pure epoch timestamp (UTC)
            ];
            
            if ($attendee['team_type'] === 'home') {
                $matches[$attendee['match_id']]['homeTeamAttendees'][] = $attendeeData;
            } else {
                $matches[$attendee['match_id']]['awayTeamAttendees'][] = $attendeeData;
            }
        }
        
        // Step 4: Get all cards (no timestamps to convert here)
        $stmt = $db->prepare("
            SELECT mc.*, tm.name as member_name
            FROM match_cards mc
            LEFT JOIN team_members tm ON mc.member_id = tm.id
            WHERE mc.match_id IN ({$matchIdsPlaceholder})
            ORDER BY mc.match_id, mc.minute ASC
        ");
        $stmt->execute($matchIds);
        
        while ($card = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $matches[$card['match_id']]['cards'][] = [
                'id' => $card['id'],
                'memberId' => $card['member_id'],
                'memberName' => $card['member_name'] ?? 'Unknown Player',
                'teamType' => $card['team_type'],
                'cardType' => $card['card_type'],
                'reason' => $card['reason'],
                'notes' => $card['notes'],
                'minute' => $card['minute'] ? (int)$card['minute'] : null
            ];
        }
    }
    
    // Step 5: Get all general attendees with pure epoch timestamps
    $stmt = $db->prepare("
        SELECT event_id, member_id, name, team_name, status, checked_in_at_epoch
        FROM general_attendees 
        WHERE event_id IN ({$eventIdsPlaceholder})
    ");
    $stmt->execute($eventIds);
    
    while ($attendee = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Use epoch timestamp directly (pure epoch system)
        $checkedInEpoch = $attendee['checked_in_at_epoch'];
        
        $events[$attendee['event_id']]['attendees'][] = [
            'memberId' => $attendee['member_id'],
            'name' => $attendee['name'],
            'team' => $attendee['team_name'],
            'status' => $attendee['status'],
            'checkedInAt_epoch' => $checkedInEpoch // Pure epoch timestamp (UTC)
        ];
    }
    
    // Step 6: Assemble matches into events
    foreach ($matches as $match) {
        $events[$match['eventId']]['matches'][] = $match;
    }
    
    // Convert to array and return
    echo json_encode(array_values($events));
}

function getCurrentSeason($db) {
    // Define current season logic - two seasons per year
    $currentYear = date('Y');
    $currentMonth = (int)date('n'); // 1-12
    
    // Determine current season based on month
    if ($currentMonth >= 1 && $currentMonth <= 6) {
        // January 1st to June 30th -> Spring Season
        $seasonType = 'Spring';
        $seasonStart = strtotime("{$currentYear}-01-01");
        $seasonEnd = strtotime("{$currentYear}-06-30 23:59:59");
    } else {
        // July 1st to December 31st -> Fall Season
        $seasonType = 'Fall';
        $seasonStart = strtotime("{$currentYear}-07-01");
        $seasonEnd = strtotime("{$currentYear}-12-31 23:59:59");
    }
    
    $currentSeason = "{$currentYear}-{$seasonType}";
    
    echo json_encode([
        'season' => $currentSeason,
        'season_name' => "{$seasonType} {$currentYear}",
        'season_type' => $seasonType,
        'year' => $currentYear,
        'season_start' => $seasonStart,
        'season_end' => $seasonEnd
    ]);
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
        $db->exec('DELETE FROM player_suspensions'); // Clear suspensions when rebuilding all events
        $db->exec('DELETE FROM match_cards');
        $db->exec('DELETE FROM general_attendees');
        $db->exec('DELETE FROM match_attendees');
        $db->exec('DELETE FROM matches');
        $db->exec('DELETE FROM events');
        
        foreach ($input as $event) {
            // Use epoch timestamp directly (no more string date conversion)
            $dateEpoch = $event['date_epoch'] ?? time();
            
            // Store pure epoch format
            $stmt = $db->prepare('
                INSERT INTO events (id, name, date_epoch, description)
                VALUES (?, ?, ?, ?)
            ');
            $stmt->execute([
                $event['id'],
                $event['name'],
                $dateEpoch, // Pure epoch storage
                $event['description'] ?? ''
            ]);
            
            if (isset($event['matches']) && is_array($event['matches'])) {
                foreach ($event['matches'] as $match) {
                    // Use epoch timestamp directly (no more string time conversion)
                    $matchTimeEpoch = $match['time_epoch'] ?? time();
                    
                    // Store pure epoch format
                    $stmt = $db->prepare('
                        INSERT INTO matches (id, event_id, home_team_id, away_team_id, field, match_time_epoch, main_referee_id, assistant_referee_id, notes, home_score, away_score, match_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $match['id'],
                        $event['id'],
                        $match['homeTeamId'],
                        $match['awayTeamId'],
                        $match['field'] ?? null,
                        $matchTimeEpoch, // Pure epoch storage
                        $match['mainRefereeId'] ?? null,
                        $match['assistantRefereeId'] ?? null,
                        $match['notes'] ?? null,
                        $match['homeScore'] ?? null,
                        $match['awayScore'] ?? null,
                        $match['matchStatus'] ?? 'scheduled'
                    ]);
                    
                    // Save attendees with epoch timestamps
                    if (isset($match['homeTeamAttendees'])) {
                        foreach ($match['homeTeamAttendees'] as $attendee) {
                            try {
                                // Use epoch timestamp directly (no more string conversion)
                                $checkedInEpoch = $attendee['checkedInAt_epoch'] ?? time();
                                
                                $stmt = $db->prepare('
                                    INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at_epoch)
                                    VALUES (?, ?, ?, ?)
                                ');
                                $stmt->execute([
                                    $match['id'],
                                    $attendee['memberId'],
                                    'home',
                                    $checkedInEpoch // Pure epoch storage
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
                                // Use epoch timestamp directly (no more string conversion)
                                $checkedInEpoch = $attendee['checkedInAt_epoch'] ?? time();
                                
                                $stmt = $db->prepare('
                                    INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at_epoch)
                                    VALUES (?, ?, ?, ?)
                                ');
                                $stmt->execute([
                                    $match['id'],
                                    $attendee['memberId'],
                                    'away',
                                    $checkedInEpoch // Pure epoch storage
                                ]);
                            } catch (Exception $e) {
                                error_log("Error saving away attendee: " . $e->getMessage());
                                error_log("Match ID: " . $match['id'] . ", Member ID: " . $attendee['memberId']);
                                throw $e;
                            }
                        }
                    }
                    
                    // Save cards (no timestamp conversion needed)
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
            
            // Save general attendees with epoch timestamps
            if (isset($event['attendees']) && is_array($event['attendees'])) {
                foreach ($event['attendees'] as $attendee) {
                    // Use epoch timestamp directly (no more string conversion)
                    $checkedInEpoch = $attendee['checkedInAt_epoch'] ?? time();
                    
                    $stmt = $db->prepare('
                        INSERT INTO general_attendees (event_id, member_id, name, team_name, status, checked_in_at_epoch)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $event['id'],
                        $attendee['memberId'],
                        $attendee['name'],
                        $attendee['team'] ?? null,
                        $attendee['status'] ?? 'present',
                        $checkedInEpoch // Pure epoch storage
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

function getDisciplinaryRecords($db) {
    $memberId = $_GET['member_id'] ?? null;
    $teamId = $_GET['team_id'] ?? null;
    
    if ($memberId) {
        // Get records for specific member
        $stmt = $db->prepare('
            SELECT pdr.*, tm.name as member_name, t.name as team_name
            FROM player_disciplinary_records pdr
            LEFT JOIN team_members tm ON pdr.member_id = tm.id
            LEFT JOIN teams t ON tm.team_id = t.id
            WHERE pdr.member_id = ?
            ORDER BY pdr.incident_date_epoch DESC, pdr.created_at_epoch DESC
        ');
        $stmt->execute([$memberId]);
    } elseif ($teamId) {
        // Get records for all members of a specific team
        $stmt = $db->prepare('
            SELECT pdr.*, tm.name as member_name, t.name as team_name
            FROM player_disciplinary_records pdr
            LEFT JOIN team_members tm ON pdr.member_id = tm.id
            LEFT JOIN teams t ON tm.team_id = t.id
            WHERE t.id = ?
            ORDER BY pdr.incident_date_epoch DESC, pdr.created_at_epoch DESC
        ');
        $stmt->execute([$teamId]);
    } else {
        // Get all records
        $stmt = $db->query('
            SELECT pdr.*, tm.name as member_name, t.name as team_name
            FROM player_disciplinary_records pdr
            LEFT JOIN team_members tm ON pdr.member_id = tm.id
            LEFT JOIN teams t ON tm.team_id = t.id
            ORDER BY pdr.incident_date_epoch DESC, pdr.created_at_epoch DESC
        ');
    }
    
    $records = [];
    while ($record = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $records[] = [
            'id' => $record['id'],
            'memberId' => $record['member_id'],
            'memberName' => $record['member_name'] ?? 'Unknown Player',
            'teamName' => $record['team_name'] ?? 'Unknown Team',
            'cardType' => $record['card_type'],
            'reason' => $record['reason'],
            'notes' => $record['notes'],
            'incident_date_epoch' => $record['incident_date_epoch'], // Use epoch timestamp
            'suspensionMatches' => $record['suspension_matches'] ? (int)$record['suspension_matches'] : null,
            'suspensionServed' => $record['suspension_served'] ? true : false,
            'suspension_served_date_epoch' => $record['suspension_served_date_epoch'], // Use epoch timestamp
            'created_at_epoch' => $record['created_at_epoch'] // Use epoch timestamp
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
            $result = $stmt->execute([$input['record_id']]);
            $deletedRows = $stmt->rowCount();
            echo json_encode(['success' => true, 'deleted_rows' => $deletedRows]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete record: ' . $e->getMessage()]);
        }
        return;
    }
    
    if (!$memberId || !isset($input['records'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields']);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        // Simple approach: Always replace all records for this member
        $db->prepare('DELETE FROM player_disciplinary_records WHERE member_id = ?')->execute([$memberId]);
        
        // Insert new records
        $stmt = $db->prepare('
            INSERT INTO player_disciplinary_records (member_id, card_type, reason, notes, incident_date_epoch, suspension_matches, suspension_served, suspension_served_date_epoch)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ');
        
        foreach ($input['records'] as $record) {
            // Enhanced boolean handling for PostgreSQL compatibility
            $suspensionServed = false;
            if (isset($record['suspensionServed'])) {
                if (is_bool($record['suspensionServed'])) {
                    $suspensionServed = $record['suspensionServed'];
                } elseif (is_string($record['suspensionServed'])) {
                    $suspensionServed = in_array(strtolower($record['suspensionServed']), ['true', '1', 'yes']);
                } else {
                    $suspensionServed = (bool)$record['suspensionServed'];
                }
            }
            
            $suspensionServedDate = ($suspensionServed && !empty($record['suspensionServedDate_epoch'])) ? $record['suspensionServedDate_epoch'] : null;
            
            // Convert suspension matches to integer or null
            $suspensionMatches = null;
            if (isset($record['suspensionMatches']) && $record['suspensionMatches'] !== '' && $record['suspensionMatches'] !== null) {
                $suspensionMatches = (int)$record['suspensionMatches'];
            }
            
            $stmt->execute([
                $memberId,
                $record['cardType'] ?? '',
                $record['reason'] ?? null,
                $record['notes'] ?? null,
                $record['incident_date_epoch'] ?? null, // Use epoch timestamp
                $suspensionMatches,
                $suspensionServed ? 1 : 0, // Explicit 1/0 for PostgreSQL
                $suspensionServedDate // Already epoch timestamp
            ]);
        }
        
        $db->commit();
        echo json_encode(['success' => true, 'saved_records' => count($input['records'])]);
        
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage(), 'trace' => $e->getTraceAsString()]);
    }
}

/**
 * Get efficient card summary for a team - avoids client-side processing
 * Returns pre-calculated card counts for all team members
 */
function getTeamCardSummary($db) {
    $teamId = $_GET['team_id'] ?? null;
    
    if (!$teamId) {
        http_response_code(400);
        echo json_encode(['error' => 'team_id parameter is required']);
        return;
    }
    
    try {
        // Use centralized season logic matching frontend JavaScript
        $currentSeasonStart = getCurrentSeasonStartEpoch();
        
        $stmt = $db->prepare('
            SELECT 
                tm.id as member_id,
                tm.name as member_name,
                
                -- Match cards (from match_cards table only)
                COALESCE(match_data.match_yellow_total, 0) as match_yellow_total,
                COALESCE(match_data.match_red_total, 0) as match_red_total,
                COALESCE(match_data.match_yellow_current, 0) as match_yellow_current,
                COALESCE(match_data.match_red_current, 0) as match_red_current,
                
                -- Lifetime disciplinary records (from player_disciplinary_records table only)
                COALESCE(disciplinary_data.lifetime_yellow, 0) as lifetime_yellow,
                COALESCE(disciplinary_data.lifetime_red, 0) as lifetime_red
                
            FROM team_members tm
            
            -- Separate subquery for match cards to avoid cross-join issues
            LEFT JOIN (
                SELECT 
                    mc.member_id,
                    SUM(CASE WHEN mc.card_type = \'yellow\' THEN 1 ELSE 0 END) as match_yellow_total,
                    SUM(CASE WHEN mc.card_type = \'red\' THEN 1 ELSE 0 END) as match_red_total,
                    SUM(CASE WHEN mc.card_type = \'yellow\' AND e.date_epoch >= ? THEN 1 ELSE 0 END) as match_yellow_current,
                    SUM(CASE WHEN mc.card_type = \'red\' AND e.date_epoch >= ? THEN 1 ELSE 0 END) as match_red_current
                FROM match_cards mc
                JOIN matches m ON mc.match_id = m.id
                JOIN events e ON m.event_id = e.id
                GROUP BY mc.member_id
            ) match_data ON tm.id = match_data.member_id
            
            -- Separate subquery for disciplinary records
            LEFT JOIN (
                SELECT 
                    pdr.member_id,
                    COUNT(CASE WHEN pdr.card_type = \'yellow\' THEN 1 END) as lifetime_yellow,
                    COUNT(CASE WHEN pdr.card_type = \'red\' THEN 1 END) as lifetime_red
                FROM player_disciplinary_records pdr
                GROUP BY pdr.member_id
            ) disciplinary_data ON tm.id = disciplinary_data.member_id
            
            WHERE tm.team_id = ? AND tm.active = true
            ORDER BY tm.name
        ');
        
        $stmt->execute([$currentSeasonStart, $currentSeasonStart, $teamId]);
        
        $results = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            // Only include players with any cards
            $hasCards = $row['match_yellow_total'] > 0 || 
                       $row['match_red_total'] > 0 || 
                       $row['lifetime_yellow'] > 0 || 
                       $row['lifetime_red'] > 0;
                       
            if ($hasCards) {
                $results[] = [
                    'memberId' => $row['member_id'],
                    'memberName' => $row['member_name'],
                    'allMatchYellow' => (int)$row['match_yellow_total'],
                    'allMatchRed' => (int)$row['match_red_total'],
                    'currentSeasonYellow' => (int)$row['match_yellow_current'],
                    'currentSeasonRed' => (int)$row['match_red_current'],
                    'lifetimeYellow' => (int)$row['lifetime_yellow'],
                    'lifetimeRed' => (int)$row['lifetime_red']
                ];
            }
        }
        
        echo json_encode($results);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
}

function servePhoto($db) {
    $filename = $_GET['filename'] ?? '';
    
    if (empty($filename)) {
        http_response_code(400);
        echo json_encode(['error' => 'Filename required']);
        return;
    }
    
    // Clean up filename if it has a full path or nested URLs (fix multiple encoding issues)
    $originalFilename = $filename;
    $maxDepth = 5; // Prevent infinite loops
    
    for ($i = 0; $i < $maxDepth; $i++) {
        if (strpos($filename, '/photos/members/') === 0) {
            $filename = basename($filename);
        } elseif (strpos($filename, '/api/photos') === 0) {
            // Handle case where full API URL was passed as filename
            $parsedUrl = parse_url($filename);
            if ($parsedUrl && isset($parsedUrl['query'])) {
                parse_str($parsedUrl['query'], $query);
                if (isset($query['filename'])) {
                    $filename = $query['filename'];
                    continue; // Check if we need to clean further
                }
            }
            // If we can't parse it properly, break
            break;
        } else {
            // No more cleaning needed
            break;
        }
    }
    
    // Handle special "default" filename for default avatars
    if ($filename === 'default') {
        $gender = $_GET['gender'] ?? 'male';
        $photoPath = __DIR__ . '/photos/defaults/' . ($gender === 'female' ? 'female.svg' : 'male.svg');
    } else {
        // Sanitize filename - only allow alphanumeric, dashes, dots
        if (!preg_match('/^[a-zA-Z0-9\-_.]+$/', $filename)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid filename: ' . $filename]);
            return;
        }
        
        // Check Railway volume first, then fallback, then legacy locations
        $volumePhotoPath = '/app/storage/photos/' . $filename;
        $fallbackPhotoPath = '/tmp/photos/' . $filename;
        $legacyPhotoPath = __DIR__ . '/photos/members/' . $filename;
        
        if (file_exists($volumePhotoPath)) {
            $photoPath = $volumePhotoPath;
        } elseif (file_exists($fallbackPhotoPath)) {
            $photoPath = $fallbackPhotoPath;
        } elseif (file_exists($legacyPhotoPath)) {
            $photoPath = $legacyPhotoPath;
        } else {
            $photoPath = null;
        }
        
        // If the exact filename doesn't exist, try to find any photo for this member
        if (!$photoPath) {
            $filenameWithoutExt = pathinfo($filename, PATHINFO_FILENAME);
            
            // Handle both old format (memberId.ext) and new format (memberId_timestamp.ext)
            $memberId = $filenameWithoutExt;
            if (strpos($filenameWithoutExt, '_') !== false) {
                // New format: extract memberId from memberId_timestamp
                $memberId = substr($filenameWithoutExt, 0, strrpos($filenameWithoutExt, '_'));
            }
            
            // Try to find any existing photo file for this member in volume, fallback, then legacy
            $volumeDir = '/app/storage/photos';
            $fallbackDir = '/tmp/photos';
            $legacyDir = __DIR__ . '/photos/members';
            
            $volumeFiles = is_dir($volumeDir) ? glob($volumeDir . '/' . $memberId . '_*') : [];
            $fallbackFiles = is_dir($fallbackDir) ? glob($fallbackDir . '/' . $memberId . '_*') : [];
            $legacyFiles = glob($legacyDir . '/' . $memberId . '*');
            
            if (!empty($volumeFiles)) {
                // Use the most recent file from volume
                $photoPath = end($volumeFiles);
            } elseif (!empty($fallbackFiles)) {
                // Use the most recent file from fallback
                $photoPath = end($fallbackFiles);
            } elseif (!empty($legacyFiles)) {
                // Fallback to legacy files
                $photoPath = end($legacyFiles);
            } else {
                // No photo file found, fall back to gender-appropriate default
                $stmt = $db->prepare('SELECT gender FROM team_members WHERE id = ?');
                $stmt->execute([$memberId]);
                $member = $stmt->fetch(PDO::FETCH_ASSOC);
                
                $gender = ($member && $member['gender'] === 'female') ? 'female' : 'male';
                $photoPath = __DIR__ . '/photos/defaults/' . ($gender === 'female' ? 'female.svg' : 'male.svg');
            }
        }
    }
    
    if (!$photoPath || !file_exists($photoPath)) {
        http_response_code(404);
        echo json_encode(['error' => 'Photo not found']);
        return;
    }
    
    // Get file info
    $fileInfo = pathinfo($photoPath);
    $extension = strtolower($fileInfo['extension']);
    
    // Set appropriate content type
    $contentTypes = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml'
    ];
    
    $contentType = $contentTypes[$extension] ?? 'application/octet-stream';
    
    // Set headers for caching and content type
    header('Content-Type: ' . $contentType);
    header('Content-Length: ' . filesize($photoPath));
    header('Cache-Control: public, max-age=31536000'); // Cache for 1 year
    header('ETag: "' . md5_file($photoPath) . '"');
    
    // Check if client has cached version
    $clientETag = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
    $serverETag = '"' . md5_file($photoPath) . '"';
    
    if ($clientETag === $serverETag) {
        http_response_code(304); // Not Modified
        return;
    }
    
    // Output the file
    readfile($photoPath);
}

function uploadPhoto($db) {
    try {
        // Check if member_id is provided
        $memberId = $_POST['member_id'] ?? '';
        
        if (empty($memberId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Member ID required']);
            return;
        }
        
        // Verify member exists (with retry for new members)
        $member = null;
        $maxRetries = 3;
        for ($retry = 0; $retry < $maxRetries; $retry++) {
            $stmt = $db->prepare('SELECT id, name FROM team_members WHERE id = ?');
            $stmt->execute([$memberId]);
            $member = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($member) {
                break; // Member found
            }
            
            if ($retry < $maxRetries - 1) {
                usleep(100000); // Wait 100ms before retry
            }
        }
        
        if (!$member) {
            http_response_code(404);
            echo json_encode(['error' => 'Member not found - ensure member is created before uploading photo']);
            return;
        }
    
    // Check if file was uploaded
    if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
        $errorMsg = isset($_FILES['photo']) ? 'Upload error: ' . $_FILES['photo']['error'] : 'No file uploaded';
        http_response_code(400);
        echo json_encode(['error' => 'No valid file uploaded', 'details' => $errorMsg]);
        return;
    }
    
    $file = $_FILES['photo'];
    
    // Validate file size (2MB max)
    if ($file['size'] > 2 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => 'File too large (max 2MB)']);
        return;
    }
    
    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mimeType, $allowedTypes)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid file type. Only JPEG, PNG, and WebP allowed']);
        return;
    }
    
    // Generate filename with timestamp to ensure uniqueness
    switch($mimeType) {
        case 'image/jpeg':
            $extension = 'jpg';
            break;
        case 'image/png':
            $extension = 'png';
            break;
        case 'image/webp':
            $extension = 'webp';
            break;
        default:
            $extension = 'jpg';
    }
    
    $timestamp = time();
    $filename = $memberId . '_' . $timestamp . '.' . $extension;
    
    // Ensure photos directory exists - Railway volume should be mounted at /app/storage/photos
    $photosDir = '/app/storage/photos';
    $fallbackDir = '/tmp/photos'; // Fallback for permission issues
    
    // Check if Railway volume exists and is accessible
    if (!is_dir($photosDir)) {
        $photosDir = $fallbackDir;
    } else {
        // Test write access without trying to change permissions
        $testFile = $photosDir . '/write_test_' . time();
        $canWrite = @file_put_contents($testFile, 'test');
        
        if ($canWrite === false) {
            $photosDir = $fallbackDir;
        } else {
            // Clean up test file
            @unlink($testFile);
        }
    }
    
    // Ensure fallback directory exists if we're using it
    if ($photosDir === $fallbackDir && !is_dir($photosDir)) {
        mkdir($photosDir, 0777, true);
    }
    
    // Final check that we have a writable directory
    if (!is_writable($photosDir)) {
        http_response_code(500);
        echo json_encode([
            'error' => 'No writable directory available for photos',
            'tried_volume' => '/app/storage/photos',
            'tried_fallback' => $fallbackDir,
            'current_directory' => $photosDir,
            'directory_exists' => is_dir($photosDir),
            'directory_writable' => is_writable($photosDir)
        ]);
        return;
    }
    
    $photoPath = $photosDir . '/' . $filename;
    
    // Move uploaded file to Railway volume
    if (!move_uploaded_file($file['tmp_name'], $photoPath)) {
        // Try creating the file with different approach
        $tempData = file_get_contents($file['tmp_name']);
        if ($tempData !== false && file_put_contents($photoPath, $tempData) !== false) {
            // Success with alternative method
        } else {
            http_response_code(500);
            echo json_encode([
                'error' => 'Failed to save photo to volume',
                'details' => 'Both move_uploaded_file and file_put_contents failed'
            ]);
            return;
        }
    }
    
    // Remove any existing photo files for this member (cleanup old files from volume)
    $existingFiles = glob($photosDir . '/' . $memberId . '_*');
    foreach ($existingFiles as $existingFile) {
        if ($existingFile !== $photoPath) { // Don't delete the file we just created
            unlink($existingFile);
        }
    }
    
    // Update database - store filename only (not base64)
    try {
        // Remove old photo data from member_photos table (if exists)
        $deleteStmt = $db->prepare('DELETE FROM member_photos WHERE member_id = ?');
        $deleteStmt->execute([$memberId]);
        
        // Update team_members table with filename
        $stmt = $db->prepare('UPDATE team_members SET photo = ? WHERE id = ?');
        $result = $stmt->execute([$filename, $memberId]);
        
        if (!$result) {
            throw new Exception("Failed to update team_members table");
        }
        
        $responseData = [
            'success' => true,
            'member_id' => $memberId,
            'url' => '/api/photos?filename=' . urlencode($filename),
            'storage_type' => 'railway_volume',
            'filename' => $filename
        ];
        
        echo json_encode($responseData);
        
    } catch (Exception $e) {
        // Clean up the uploaded file if database update fails
        if (file_exists($photoPath)) {
            unlink($photoPath);
        }
        throw $e;
    }
    
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Photo upload failed: ' . $e->getMessage(),
            'member_id' => $memberId ?? 'unknown'
        ]);
    }
}

function deletePhoto($db) {
    $memberId = $_GET['member_id'] ?? '';
    
    if (empty($memberId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Member ID required']);
        return;
    }
    
    // Get current photo filename
    $stmt = $db->prepare('SELECT photo FROM team_members WHERE id = ?');
    $stmt->execute([$memberId]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$member) {
        http_response_code(404);
        echo json_encode(['error' => 'Member not found']);
        return;
    }
    
    // Remove photo file if exists
    if ($member['photo']) {
        $photoPath = __DIR__ . '/photos/members/' . $member['photo'];
        if (file_exists($photoPath)) {
            unlink($photoPath);
        }
    }
    
    // Update database to remove photo reference
    $stmt = $db->prepare('UPDATE team_members SET photo = NULL WHERE id = ?');
    $stmt->execute([$memberId]);
    
    echo json_encode(['success' => true]);
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
    
    // Separate photos table for better performance with 720+ players
    $db->exec('
        CREATE TABLE IF NOT EXISTS member_photos (
            member_id TEXT PRIMARY KEY,
            photo_data TEXT NOT NULL,
            content_type VARCHAR(50),
            file_size INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE
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
            suspension_matches INTEGER DEFAULT NULL,
            suspension_served BOOLEAN DEFAULT FALSE,
            suspension_served_date DATE DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE
        )
    ');
    
    // Create player_suspensions table for tracking event-based suspensions
    $db->exec('
        CREATE TABLE IF NOT EXISTS player_suspensions (
            id SERIAL PRIMARY KEY,
            member_id TEXT NOT NULL,
            card_type TEXT NOT NULL CHECK(card_type IN (\'red\', \'yellow_accumulation\')),
            card_source TEXT, -- \'match_card\' or \'disciplinary_record\' 
            card_source_id TEXT, -- ID from match cards or disciplinary records
            suspension_events INTEGER NOT NULL,
            suspension_start_date_epoch INTEGER NOT NULL,
            suspension_end_date_epoch INTEGER,
            events_remaining INTEGER NOT NULL,
            status TEXT DEFAULT \'active\' CHECK(status IN (\'active\', \'served\')),
            created_at_epoch INTEGER DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP),
            served_at_epoch INTEGER DEFAULT NULL,
            notes TEXT,
            FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE
        )
    ');
    
    // Create team_captains table for multiple captains support
    $db->exec('
        CREATE TABLE IF NOT EXISTS team_captains (
            id SERIAL PRIMARY KEY,
            team_id TEXT NOT NULL,
            member_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
            FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE CASCADE,
            UNIQUE(team_id, member_id)
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
        $db->exec('CREATE INDEX IF NOT EXISTS idx_matches_event_time ON matches(event_id, match_time_epoch)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_team_members_name ON team_members(team_id, name)');
        
        // Critical indexes for disciplinary records performance
        $db->exec('CREATE INDEX IF NOT EXISTS idx_team_members_id_team_id ON team_members(id, team_id)'); // For JOIN optimization
        $db->exec('CREATE INDEX IF NOT EXISTS idx_teams_id_name ON teams(id, name)'); // For team lookup optimization
        $db->exec('CREATE INDEX IF NOT EXISTS idx_player_disciplinary_sort ON player_disciplinary_records(member_id, incident_date_epoch DESC, created_at_epoch DESC)'); // For sorted queries
        $db->exec('CREATE INDEX IF NOT EXISTS idx_player_disciplinary_team_sort ON player_disciplinary_records(incident_date_epoch DESC, created_at_epoch DESC)'); // For team-based queries
        
        // Epoch timestamp indexes for time-based queries
        $db->exec('CREATE INDEX IF NOT EXISTS idx_events_date_epoch ON events(date_epoch)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_matches_time_epoch ON matches(match_time_epoch)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_match_attendees_time ON match_attendees(checked_in_at_epoch)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_general_attendees_time ON general_attendees(checked_in_at_epoch)');
        
        // Active members optimization
        $db->exec('CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(active, team_id) WHERE active IS NULL OR active = TRUE');
        
        // Team captains indexes
        $db->exec('CREATE INDEX IF NOT EXISTS idx_team_captains_team_id ON team_captains(team_id)');
        $db->exec('CREATE INDEX IF NOT EXISTS idx_team_captains_member_id ON team_captains(member_id)');
        
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
        
        // Add epoch timestamp columns
        $db->exec('ALTER TABLE events ADD COLUMN IF NOT EXISTS date_epoch INTEGER');
        $db->exec('ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_time_epoch INTEGER');
        $db->exec('ALTER TABLE general_attendees ADD COLUMN IF NOT EXISTS checked_in_at_epoch INTEGER');
        $db->exec('ALTER TABLE match_attendees ADD COLUMN IF NOT EXISTS checked_in_at_epoch INTEGER');
        $db->exec('ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS incident_date_epoch INTEGER');
        $db->exec('ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS suspension_served_date_epoch INTEGER');
        $db->exec('ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER');
        $db->exec('ALTER TABLE team_members ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE');
        
        // Add indexes for new tables
        $db->exec('CREATE INDEX IF NOT EXISTS idx_match_cards_match_id ON match_cards(match_id)');
    } catch (Exception $e) {
        // Columns might already exist, ignore errors
    }
}

// Attendance-only update function for view.html (no admin auth required)
function updateAttendanceOnly($db) {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    
    if (!$input || !isset($input['eventId']) || !isset($input['matchId']) || !isset($input['memberId']) || !isset($input['teamType'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required parameters', 'received' => $input]);
        return;
    }
    
    $eventId = $input['eventId'];
    $matchId = $input['matchId'];
    $memberId = $input['memberId'];
    $teamType = $input['teamType'];
    $action = $input['action'] ?? 'toggle'; // 'add', 'remove', or 'toggle'
    $bypassLock = $input['bypass_lock'] ?? false; // Allow main app to bypass lock
    
    try {
        // First check if check-in is locked for this match
        // Get match details to check lock status
        $stmt = $db->prepare('
            SELECT e.date_epoch as event_date_epoch, m.match_time_epoch 
            FROM events e 
            JOIN matches m ON e.id = m.event_id 
            WHERE e.id = ? AND m.id = ?
        ');
        $stmt->execute([$eventId, $matchId]);
        $matchInfo = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($matchInfo) {
            // Use epoch timestamp (more reliable)
            $isLocked = false;
            if ($matchInfo['match_time_epoch']) {
                // Use epoch-based lock function
                $isLocked = isCheckInLockedForMatchEpoch($matchInfo['match_time_epoch']);
            } else {
                // No match time available - don't lock
                $isLocked = false;
            }
            
            if (!$bypassLock && $isLocked) {
                http_response_code(423); // 423 Locked (more appropriate than 403)
                echo json_encode([
                    'error' => 'Check-in is locked for this match',
                    'message' => 'This match check-in was automatically locked 2 hours and 40 minutes after the scheduled start of the game.',
                    'locked' => true
                ]);
                return;
            }
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
            return;
        }
        
        $db->beginTransaction();
        
        // Check if attendee already exists
        $stmt = $db->prepare('
            SELECT id FROM match_attendees 
            WHERE match_id = ? AND member_id = ? AND team_type = ?
        ');
        $stmt->execute([$matchId, $memberId, $teamType]);
        $existingAttendee = $stmt->fetch();
        
        if ($action === 'toggle') {
            if ($existingAttendee) {
                // Remove attendance
                $stmt = $db->prepare('
                    DELETE FROM match_attendees 
                    WHERE match_id = ? AND member_id = ? AND team_type = ?
                ');
                $stmt->execute([$matchId, $memberId, $teamType]);
                $result = ['action' => 'removed', 'success' => true];
            } else {
                // Add attendance with epoch timestamp
                $currentEpoch = time();
                $stmt = $db->prepare('
                    INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at_epoch)
                    VALUES (?, ?, ?, ?)
                ');
                $stmt->execute([$matchId, $memberId, $teamType, $currentEpoch]);
                $result = ['action' => 'added', 'success' => true];
            }
        } elseif ($action === 'add' && !$existingAttendee) {
            // Add attendance with epoch timestamp
            $currentEpoch = time();
            $stmt = $db->prepare('
                INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at_epoch)
                VALUES (?, ?, ?, ?)
            ');
            $stmt->execute([$matchId, $memberId, $teamType, $currentEpoch]);
            $result = ['action' => 'added', 'success' => true];
        } elseif ($action === 'remove' && $existingAttendee) {
            // Remove attendance
            $stmt = $db->prepare('
                DELETE FROM match_attendees 
                WHERE match_id = ? AND member_id = ? AND team_type = ?
            ');
            $stmt->execute([$matchId, $memberId, $teamType]);
            $result = ['action' => 'removed', 'success' => true];
        } else {
            $result = ['action' => 'none', 'success' => true, 'message' => 'No change needed'];
        }
        
        $db->commit();
        echo json_encode($result);
        
    } catch (Exception $e) {
        // Only rollback if there's an active transaction
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        
        http_response_code(500);
        echo json_encode([
            'error' => 'Failed to update attendance: ' . $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'has_transaction' => $db->inTransaction()
        ]);
    }
}

// Update member profile data (name, jersey number, gender) - enhanced for admin app
function updateMemberProfile($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $teamId = $input['teamId'] ?? null;
        $memberId = $input['memberId'] ?? null;
        $name = $input['name'] ?? null;
        $jerseyNumber = $input['jerseyNumber'] ?? null;
        $gender = $input['gender'] ?? null;
        
        if (!$teamId || !$memberId) {
            http_response_code(400);
            echo json_encode(['error' => 'Team ID and Member ID are required']);
            return;
        }
        
        // Update member profile (supports name, jersey number, and gender)
        $stmt = $db->prepare('UPDATE team_members SET name = ?, jersey_number = ?, gender = ? WHERE id = ? AND team_id = ?');
        $result = $stmt->execute([$name, $jerseyNumber, $gender, $memberId, $teamId]);
        
        if ($result) {
            echo json_encode(['success' => true, 'message' => 'Member profile updated successfully']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update member profile']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update member profile: ' . $e->getMessage()]);
    }
}

// Create new team member - for admin app
function createMemberProfile($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $teamId = $input['teamId'] ?? null;
        $member = $input['member'] ?? null;
        
        if (!$teamId || !$member || !$member['id'] || !$member['name']) {
            http_response_code(400);
            echo json_encode(['error' => 'Team ID and member data are required']);
            return;
        }
        
        // Insert new member
        $stmt = $db->prepare('INSERT INTO team_members (id, team_id, name, jersey_number, gender) VALUES (?, ?, ?, ?, ?)');
        $result = $stmt->execute([
            $member['id'],
            $teamId,
            $member['name'],
            $member['jerseyNumber'],
            $member['gender']
        ]);
        
        if ($result) {
            echo json_encode(['success' => true, 'message' => 'Member created successfully']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create member']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create member: ' . $e->getMessage()]);
    }
}

// Delete team member - for admin app
function deleteMemberProfile($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $teamId = $input['teamId'] ?? null;
        $memberId = $input['memberId'] ?? null;
        
        if (!$teamId || !$memberId) {
            http_response_code(400);
            echo json_encode(['error' => 'Team ID and Member ID are required']);
            return;
        }
        
        // Delete member
        $stmt = $db->prepare('DELETE FROM team_members WHERE id = ? AND team_id = ?');
        $result = $stmt->execute([$memberId, $teamId]);
        
        if ($result) {
            echo json_encode(['success' => true, 'message' => 'Member deleted successfully']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete member']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete member: ' . $e->getMessage()]);
    }
}

// Deactivate team member (soft delete) - for admin app
function deactivateMemberProfile($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $teamId = $input['teamId'] ?? null;
        $memberId = $input['memberId'] ?? null;
        
        if (!$teamId || !$memberId) {
            http_response_code(400);
            echo json_encode(['error' => 'Team ID and Member ID are required']);
            return;
        }
        
        // Mark member as inactive instead of deleting
        $stmt = $db->prepare('UPDATE team_members SET active = FALSE WHERE id = ? AND team_id = ?');
        $result = $stmt->execute([$memberId, $teamId]);
        
        if ($result) {
            echo json_encode(['success' => true, 'message' => 'Member deactivated successfully']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to deactivate member']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to deactivate member: ' . $e->getMessage()]);
    }
}

// Search for inactive members by name
function searchInactiveMembers($db) {
    try {
        $name = $_GET['name'] ?? '';
        
        if (empty($name)) {
            http_response_code(400);
            echo json_encode(['error' => 'Name parameter is required']);
            return;
        }
        
        // Search for inactive members with similar names
        $stmt = $db->prepare('
            SELECT tm.id, tm.name, tm.jersey_number, tm.gender, tm.team_id, tm.photo,
                   t.name as team_name, t.category as team_category,
                   mp.photo_data
            FROM team_members tm 
            JOIN teams t ON tm.team_id = t.id
            LEFT JOIN member_photos mp ON tm.id = mp.member_id
            WHERE tm.active = FALSE AND LOWER(tm.name) = LOWER(?)
            ORDER BY tm.name
        ');
        $stmt->execute([$name]);
        $inactiveMembers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Get disciplinary records for each inactive member
        foreach ($inactiveMembers as &$member) {
            // Process photo data similar to getTeams() function
            if ($member['photo_data']) {
                // Photo exists in member_photos table - use base64 data directly
                $member['photo'] = $member['photo_data'];
            } elseif ($member['photo'] && $member['photo'] !== 'has_photo') {
                // Legacy photo stored in team_members.photo field
                $photoValue = $member['photo'];
                
                // Check if it's already base64 data
                if (strpos($photoValue, 'data:image/') === 0) {
                    // It's base64 data, use directly
                    $member['photo'] = $photoValue;
                } else {
                    // Legacy file-based storage - convert to API URL
                    if (strpos($photoValue, '/photos/members/') === 0) {
                        $photoValue = basename($photoValue);
                    } elseif (strpos($photoValue, '/api/photos') === 0) {
                        $parsedUrl = parse_url($photoValue);
                        if ($parsedUrl && isset($parsedUrl['query'])) {
                            parse_str($parsedUrl['query'], $query);
                            if (isset($query['filename'])) {
                                $photoValue = $query['filename'];
                            }
                        }
                    }
                    $member['photo'] = '/api/photos?filename=' . urlencode($photoValue);
                }
            } elseif ($member['photo'] === 'has_photo') {
                // Member has photo in member_photos table but photo_data was NULL
                $member['photo'] = getDefaultPhoto($member['gender']);
            } else {
                $member['photo'] = getDefaultPhoto($member['gender']);
            }
            
            // Remove photo_data from response to keep it clean
            unset($member['photo_data']);
            
            $recordsStmt = $db->prepare('
                SELECT card_type, reason, notes, incident_date_epoch, 
                       suspension_matches, suspension_served, suspension_served_date_epoch, created_at_epoch
                FROM player_disciplinary_records 
                WHERE member_id = ?
                ORDER BY incident_date_epoch DESC, created_at_epoch DESC
            ');
            $recordsStmt->execute([$member['id']]);
            $member['disciplinary_records'] = $recordsStmt->fetchAll(PDO::FETCH_ASSOC);
        }
        
        echo json_encode([
            'success' => true,
            'inactive_members' => $inactiveMembers
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to search inactive members: ' . $e->getMessage()]);
    }
}

// Reactivate member and add to team
function reactivateMemberProfile($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $memberId = $input['memberId'] ?? null;
        $newTeamId = $input['newTeamId'] ?? null;
        $newJerseyNumber = $input['newJerseyNumber'] ?? null;
        
        if (!$memberId || !$newTeamId) {
            http_response_code(400);
            echo json_encode(['error' => 'Member ID and new team ID are required']);
            return;
        }
        
        // Update member: reactivate, move to new team, update jersey number
        $stmt = $db->prepare('
            UPDATE team_members 
            SET active = TRUE, team_id = ?, jersey_number = ? 
            WHERE id = ?
        ');
        $result = $stmt->execute([$newTeamId, $newJerseyNumber, $memberId]);
        
        if ($result) {
            // Get updated member info
            $memberStmt = $db->prepare('
                SELECT tm.*, t.name as team_name 
                FROM team_members tm 
                JOIN teams t ON tm.team_id = t.id 
                WHERE tm.id = ?
            ');
            $memberStmt->execute([$memberId]);
            $member = $memberStmt->fetch(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true, 
                'message' => 'Member reactivated successfully',
                'member' => $member
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to reactivate member']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to reactivate member: ' . $e->getMessage()]);
    }
}

// Update match results (scores, status, notes, cards) - for view.html
function updateMatchResults($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $eventId = $input['eventId'] ?? null;
        $matchId = $input['matchId'] ?? null;
        $homeScore = ($input['homeScore'] !== '' && $input['homeScore'] !== null) ? (int)$input['homeScore'] : null;
        $awayScore = ($input['awayScore'] !== '' && $input['awayScore'] !== null) ? (int)$input['awayScore'] : null;
        $matchStatus = $input['matchStatus'] ?? 'scheduled';
        $matchNotes = $input['matchNotes'] ?? '';
        $cards = $input['cards'] ?? [];
        
        if (!$eventId || !$matchId) {
            http_response_code(400);
            echo json_encode(['error' => 'Event ID and Match ID are required']);
            return;
        }
        
        $db->beginTransaction();
        
        // Update match directly in matches table
        $stmt = $db->prepare('
            UPDATE matches 
            SET home_score = ?, away_score = ?, match_status = ?, notes = ?
            WHERE id = ?
        ');
        $result = $stmt->execute([$homeScore, $awayScore, $matchStatus, $matchNotes, $matchId]);
        
        // Update cards - always process cards array (even if empty to allow deletion)
        // Remove existing cards for this match first, and cleanup related suspensions
        $db->prepare('DELETE FROM player_suspensions WHERE card_source_id = ?')->execute([$matchId]);
        $db->prepare('DELETE FROM match_cards WHERE match_id = ?')->execute([$matchId]);
        
        // Add new cards (if any)
        if (!empty($cards)) {
            foreach ($cards as $card) {
                $stmt = $db->prepare('
                    INSERT INTO match_cards (match_id, member_id, team_type, card_type, reason, notes, minute)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ');
                $stmt->execute([
                    $matchId,
                    $card['memberId'],
                    $card['teamType'],
                    $card['cardType'],
                    $card['reason'] ?? null,
                    $card['notes'] ?? null,
                    $card['minute'] ?? null
                ]);
            }
        }
        
        if ($result) {
            $db->commit();
            echo json_encode(['success' => true, 'message' => 'Match results updated successfully']);
        } else {
            $db->rollback();
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update match results']);
        }
        
    } catch (Exception $e) {
        $db->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update match results: ' . $e->getMessage()]);
    }
}

// Add cards to players - for view.html referees
function addPlayerCards($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $matchId = $input['matchId'] ?? null;
        $cards = $input['cards'] ?? [];
        
        if (!$matchId || empty($cards)) {
            http_response_code(400);
            echo json_encode(['error' => 'Match ID and cards data are required']);
            return;
        }
        
        $db->beginTransaction();
        
        // Add new cards to match_cards table
        foreach ($cards as $card) {
            $stmt = $db->prepare('
                INSERT INTO match_cards (match_id, member_id, team_type, card_type, reason, notes, minute)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ');
            $stmt->execute([
                $matchId,
                $card['memberId'],
                $card['teamType'],
                $card['cardType'],
                $card['reason'] ?? null,
                $card['notes'] ?? null,
                $card['minute'] ?? null
            ]);
        }
        
        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Cards added successfully']);
        
    } catch (Exception $e) {
        $db->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Failed to add cards: ' . $e->getMessage()]);
    }
}

// Helper function to check if check-in is locked for a match (EPOCH-based)
function isCheckInLockedForMatchEpoch($gameStartEpoch) {
    if (!$gameStartEpoch) {
        return false; // Don't lock if we don't have time info
    }
    
    try {
        // Simple epoch arithmetic!
        $lockTimeEpoch = $gameStartEpoch + (2 * 60 * 60 + 40 * 60); // 2h 40m after game start
        
        $currentEpoch = time();
        $isLocked = $currentEpoch > $lockTimeEpoch;
        
        return $isLocked;
    } catch (Exception $e) {
        return false; // Don't lock on error
    }
}

// Individual match operations for efficient match management
function createSingleMatch($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    $eventId = $_GET['event_id'] ?? $input['eventId'] ?? null;
    
    if (!$eventId) {
        http_response_code(400);
        echo json_encode(['error' => 'Event ID is required']);
        return;
    }
    
    if (!$input || !isset($input['homeTeamId']) || !isset($input['awayTeamId'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Home team ID and away team ID are required']);
        return;
    }
    
    try {
        $matchId = $input['id'] ?? generateUUID();
        $matchTimeEpoch = $input['time_epoch'] ?? null;
        
        // Insert the new match
        $stmt = $db->prepare('
            INSERT INTO matches (id, event_id, home_team_id, away_team_id, field, match_time_epoch, main_referee_id, assistant_referee_id, notes, home_score, away_score, match_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $matchId,
            $eventId,
            $input['homeTeamId'],
            $input['awayTeamId'],
            $input['field'] ?? null,
            $matchTimeEpoch,
            $input['mainRefereeId'] ?? null,
            $input['assistantRefereeId'] ?? null,
            $input['notes'] ?? null,
            $input['homeScore'] ?? null,
            $input['awayScore'] ?? null,
            $input['matchStatus'] ?? 'scheduled'
        ]);
        
        echo json_encode([
            'success' => true,
            'message' => 'Match created successfully',
            'match_id' => $matchId
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create match: ' . $e->getMessage()]);
    }
}

function updateSingleMatch($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    $matchId = $_GET['match_id'] ?? $input['matchId'] ?? null;
    
    if (!$matchId) {
        http_response_code(400);
        echo json_encode(['error' => 'Match ID is required']);
        return;
    }
    
    try {
        // Build dynamic update query based on provided fields
        $updates = [];
        $params = [];
        
        $updatableFields = [
            'home_team_id' => 'homeTeamId',
            'away_team_id' => 'awayTeamId', 
            'field' => 'field',
            'match_time_epoch' => 'time_epoch',
            'main_referee_id' => 'mainRefereeId',
            'assistant_referee_id' => 'assistantRefereeId',
            'notes' => 'notes',
            'home_score' => 'homeScore',
            'away_score' => 'awayScore',
            'match_status' => 'matchStatus'
        ];
        
        foreach ($updatableFields as $dbField => $inputField) {
            if (array_key_exists($inputField, $input)) {
                $updates[] = $dbField . ' = ?';
                $params[] = $input[$inputField];
            }
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['error' => 'No fields to update']);
            return;
        }
        
        $params[] = $matchId;
        $sql = 'UPDATE matches SET ' . implode(', ', $updates) . ' WHERE id = ?';
        $stmt = $db->prepare($sql);
        $result = $stmt->execute($params);
        
        // Handle cards if provided
        if (array_key_exists('cards', $input)) {
            $cards = $input['cards'] ?? [];
            
            // Always delete existing cards first (allows card removal) and cleanup related suspensions
            $db->prepare('DELETE FROM player_suspensions WHERE card_source_id = ?')->execute([$matchId]);
            $db->prepare('DELETE FROM match_cards WHERE match_id = ?')->execute([$matchId]);
            
            // Add new cards (if any)
            if (!empty($cards)) {
                foreach ($cards as $card) {
                    $stmt = $db->prepare('
                        INSERT INTO match_cards (match_id, member_id, team_type, card_type, reason, notes, minute)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $matchId,
                        $card['memberId'],
                        $card['teamType'],
                        $card['cardType'],
                        $card['reason'] ?? null,
                        $card['notes'] ?? null,
                        $card['minute'] ?? null
                    ]);
                }
            }
        }
        
        if ($result && $stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Match updated successfully']);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Match not found or no changes made']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update match: ' . $e->getMessage()]);
    }
}

function deleteSingleMatch($db) {
    $matchId = $_GET['match_id'] ?? null;
    
    if (!$matchId) {
        http_response_code(400);
        echo json_encode(['error' => 'Match ID is required']);
        return;
    }
    
    try {
        // Delete match (cascading deletes will handle attendees and cards)
        $stmt = $db->prepare('DELETE FROM matches WHERE id = ?');
        $result = $stmt->execute([$matchId]);
        
        if ($result && $stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Match deleted successfully']);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete match: ' . $e->getMessage()]);
    }
}

// Helper function to get team captains
function getTeamCaptains($db, $teamId = null) {
    if ($teamId) {
        // Get captains for specific team
        $stmt = $db->prepare('
            SELECT tc.team_id, tc.member_id, tm.name as member_name
            FROM team_captains tc
            JOIN team_members tm ON tc.member_id = tm.id
            WHERE tc.team_id = ? AND (tm.active IS NULL OR tm.active = TRUE)
            ORDER BY tc.created_at
        ');
        $stmt->execute([$teamId]);
    } else {
        // Get all captains
        $stmt = $db->query('
            SELECT tc.team_id, tc.member_id, tm.name as member_name
            FROM team_captains tc
            JOIN team_members tm ON tc.member_id = tm.id
            WHERE tm.active IS NULL OR tm.active = TRUE
            ORDER BY tc.team_id, tc.created_at
        ');
    }
    
    $captains = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (!isset($captains[$row['team_id']])) {
            $captains[$row['team_id']] = [];
        }
        $captains[$row['team_id']][] = [
            'memberId' => $row['member_id'],
            'memberName' => $row['member_name']
        ];
    }
    
    if ($teamId) {
        return $captains[$teamId] ?? [];
    }
    
    return $captains;
}

// Add captain to team
function addTeamCaptain($db, $teamId, $memberId) {
    try {
        $stmt = $db->prepare('
            INSERT INTO team_captains (team_id, member_id)
            VALUES (?, ?)
            ON CONFLICT (team_id, member_id) DO NOTHING
        ');
        return $stmt->execute([$teamId, $memberId]);
    } catch (Exception $e) {
        error_log("Error adding captain: " . $e->getMessage());
        return false;
    }
}

// Remove captain from team
function removeTeamCaptain($db, $teamId, $memberId) {
    try {
        $stmt = $db->prepare('DELETE FROM team_captains WHERE team_id = ? AND member_id = ?');
        return $stmt->execute([$teamId, $memberId]);
    } catch (Exception $e) {
        error_log("Error removing captain: " . $e->getMessage());
        return false;
    }
}

// Migrate legacy captain data to new table (one-time operation)
function migrateLegacyCaptains($db) {
    try {
        // Get all teams with legacy captain_id
        $stmt = $db->query('SELECT id, captain_id FROM teams WHERE captain_id IS NOT NULL');
        $migrated = 0;
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (addTeamCaptain($db, $row['id'], $row['captain_id'])) {
                $migrated++;
            }
        }
        
        return $migrated;
    } catch (Exception $e) {
        error_log("Error migrating legacy captains: " . $e->getMessage());
        return 0;
    }
}

// Suspension Management Functions
function applySuspension($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $memberId = $input['memberId'] ?? null;
    $cardType = $input['cardType'] ?? null;
    $cardSourceId = $input['cardSourceId'] ?? null;
    $suspensionEvents = (int)($input['suspensionEvents'] ?? 0);
    $suspensionStartEpoch = $input['suspensionStartEpoch'] ?? null; // Use provided start date
    $notes = $input['notes'] ?? null;
    
    if (!$memberId || !$cardType || $suspensionEvents < 1) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: memberId, cardType, suspensionEvents']);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        // Use the provided suspension start date (event date) or fall back to current time
        $suspensionStartDate = $suspensionStartEpoch ?: time();
        
        // Insert suspension record
        $stmt = $db->prepare('
            INSERT INTO player_suspensions (
                member_id, card_type, card_source_id, suspension_events,
                suspension_start_date_epoch, events_remaining, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, \'active\', ?)
        ');
        
        $stmt->execute([
            $memberId,
            $cardType,
            $cardSourceId,
            $suspensionEvents,
            $suspensionStartDate, // Use event date instead of current time
            $suspensionEvents,
            $notes
        ]);
        
        $suspensionId = $db->lastInsertId();
        
        $db->commit();
        
        echo json_encode([
            'success' => true,
            'suspensionId' => $suspensionId,
            'message' => "Applied {$suspensionEvents} event suspension"
        ]);
        
    } catch (Exception $e) {
        $db->rollback();
        error_log("Error applying suspension: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Database error while applying suspension']);
    }
}

function updateSuspension($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $suspensionId = $input['suspensionId'] ?? null;
    $action = $input['action'] ?? null; // 'mark_served' or 'update_events'
    
    if (!$suspensionId || !$action) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: suspensionId, action']);
        return;
    }
    
    try {
        $db->beginTransaction();
        
        if ($action === 'mark_served') {
            $stmt = $db->prepare('
                UPDATE player_suspensions 
                SET status = \'served\', served_at_epoch = ?, events_remaining = 0
                WHERE id = ?
            ');
            $stmt->execute([time(), $suspensionId]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Suspension marked as served'
            ]);
            
        } elseif ($action === 'reduce_events') {
            // Reduce events remaining (called when player misses an event)
            $stmt = $db->prepare('
                UPDATE player_suspensions 
                SET events_remaining = GREATEST(events_remaining - 1, 0),
                    status = CASE WHEN events_remaining <= 1 THEN \'served\' ELSE \'active\' END,
                    served_at_epoch = CASE WHEN events_remaining <= 1 THEN ? ELSE served_at_epoch END
                WHERE id = ? AND status = \'active\'
            ');
            $stmt->execute([time(), $suspensionId]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Suspension events reduced'
            ]);
        }
        
        $db->commit();
        
    } catch (Exception $e) {
        $db->rollback();
        error_log("Error updating suspension: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Database error while updating suspension']);
    }
}

function getSuspensions($db) {
    $memberId = $_GET['memberId'] ?? null;
    $status = $_GET['status'] ?? 'active'; // 'active', 'served', 'all'
    
    try {
        $sql = '
            SELECT 
                ps.id,
                ps.member_id,
                ps.card_type,
                ps.card_source_id,
                ps.suspension_events,
                ps.suspension_start_date_epoch,
                ps.events_remaining,
                ps.status,
                ps.created_at_epoch,
                ps.served_at_epoch,
                ps.notes,
                tm.name as member_name,
                t.name as team_name
            FROM player_suspensions ps
            JOIN team_members tm ON ps.member_id = tm.id
            JOIN teams t ON tm.team_id = t.id
            WHERE 1=1
        ';
        
        $params = [];
        
        if ($memberId) {
            $sql .= ' AND ps.member_id = ?';
            $params[] = $memberId;
        }
        
        if ($status !== 'all') {
            $sql .= ' AND ps.status = ?';
            $params[] = $status;
        }
        
        $sql .= ' ORDER BY ps.created_at_epoch DESC';
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        
        $suspensions = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $suspensions[] = [
                'id' => (int)$row['id'],
                'memberId' => $row['member_id'],
                'memberName' => $row['member_name'],
                'teamName' => $row['team_name'],
                'cardType' => $row['card_type'],
                'cardSourceId' => $row['card_source_id'],
                'suspensionEvents' => (int)$row['suspension_events'],
                'suspensionStartEpoch' => (int)$row['suspension_start_date_epoch'],
                'eventsRemaining' => (int)$row['events_remaining'],
                'status' => $row['status'],
                'createdAtEpoch' => (int)$row['created_at_epoch'],
                'servedAtEpoch' => $row['served_at_epoch'] ? (int)$row['served_at_epoch'] : null,
                'notes' => $row['notes']
            ];
        }
        
        echo json_encode($suspensions);
        
    } catch (Exception $e) {
        error_log("Error getting suspensions: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Database error while retrieving suspensions']);
    }
}

// Delete a specific suspension by ID
function deleteSuspension($db) {
    try {
        // Get suspension ID from query parameters
        $suspensionId = $_GET['id'] ?? null;
        
        if (!$suspensionId) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing suspension ID']);
            return;
        }
        
        // Delete the suspension record
        $stmt = $db->prepare('DELETE FROM player_suspensions WHERE id = ?');
        $result = $stmt->execute([$suspensionId]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'success' => true,
                'message' => 'Suspension deleted successfully',
                'deletedId' => (int)$suspensionId
            ]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Suspension not found']);
        }
        
    } catch (Exception $e) {
        error_log("Error deleting suspension: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Database error while deleting suspension']);
    }
}

// Check for orphaned suspensions (suspensions without corresponding cards)
function checkOrphanedSuspensions($db) {
    try {
        // Find suspensions that reference card_source_id but no corresponding card exists
        // The improved logic checks if the card_source_id corresponds to any existing card
        $stmt = $db->query('
            SELECT ps.*, tm.name as member_name, t.name as team_name
            FROM player_suspensions ps
            JOIN team_members tm ON ps.member_id = tm.id
            JOIN teams t ON tm.team_id = t.id
            WHERE ps.status = \'active\'
            AND ps.card_source_id IS NOT NULL 
            AND NOT EXISTS (
                -- Check if there\'s a match card that could correspond to this suspension
                SELECT 1 
                FROM match_cards mc
                JOIN matches m ON mc.match_id = m.id
                WHERE mc.member_id = ps.member_id 
                AND mc.card_type = \'red\'
                AND ps.card_type = \'red\'
                -- Allow some flexibility in matching by checking recent cards for the same player
                AND m.match_time_epoch >= ps.suspension_start_date_epoch - 86400 -- Within 24 hours
                AND m.match_time_epoch <= ps.suspension_start_date_epoch + 86400
            )
            ORDER BY ps.created_at_epoch DESC
        ');
        
        $orphanedSuspensions = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $orphanedSuspensions[] = [
                'id' => (int)$row['id'],
                'memberId' => $row['member_id'],
                'memberName' => $row['member_name'],
                'teamName' => $row['team_name'],
                'cardType' => $row['card_type'],
                'cardSourceId' => $row['card_source_id'],
                'suspensionEvents' => (int)$row['suspension_events'],
                'eventsRemaining' => (int)$row['events_remaining'],
                'status' => $row['status'],
                'createdAt' => (int)$row['created_at_epoch']
            ];
        }
        
        echo json_encode([
            'orphanedCount' => count($orphanedSuspensions),
            'orphanedSuspensions' => $orphanedSuspensions
        ]);
        
    } catch (Exception $e) {
        error_log("Error checking orphaned suspensions: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Database error while checking orphaned suspensions']);
    }
}

// Clean up orphaned suspensions
function cleanupOrphanedSuspensions($db) {
    try {
        $db->beginTransaction();
        
        // Delete suspensions using the same improved logic as the check function
        $stmt = $db->prepare('
            DELETE FROM player_suspensions
            WHERE status = \'active\'
            AND card_source_id IS NOT NULL 
            AND NOT EXISTS (
                -- Check if there\'s a match card that could correspond to this suspension
                SELECT 1 
                FROM match_cards mc
                JOIN matches m ON mc.match_id = m.id
                WHERE mc.member_id = player_suspensions.member_id 
                AND mc.card_type = \'red\'
                AND player_suspensions.card_type = \'red\'
                -- Allow some flexibility in matching by checking recent cards for the same player
                AND m.match_time_epoch >= player_suspensions.suspension_start_date_epoch - 86400 -- Within 24 hours
                AND m.match_time_epoch <= player_suspensions.suspension_start_date_epoch + 86400
            )
        ');
        
        $result = $stmt->execute();
        $deletedCount = $stmt->rowCount();
        
        $db->commit();
        
        echo json_encode([
            'success' => true,
            'message' => "Cleaned up {$deletedCount} orphaned suspension records",
            'deletedCount' => $deletedCount
        ]);
        
    } catch (Exception $e) {
        $db->rollback();
        error_log("Error cleaning up orphaned suspensions: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Database error while cleaning up orphaned suspensions']);
    }
}

// Database schema inspection function
function getDbSchema($db) {
    try {
        $schema = [];
        $timestamp = time();
        
        // Get all tables
        $stmt = $db->query("
            SELECT table_name, table_type 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        ");
        $tables = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $totalTables = count($tables);
        $totalRows = 0;
        $totalColumns = 0;
        $totalConstraints = 0;
        
        foreach ($tables as $table) {
            $tableName = $table['table_name'];
            
            // Get table row count
            try {
                $countStmt = $db->query("SELECT COUNT(*) as row_count FROM {$tableName}");
                $rowCount = (int)$countStmt->fetch(PDO::FETCH_ASSOC)['row_count'];
                $totalRows += $rowCount;
            } catch (Exception $e) {
                $rowCount = 0; // Handle tables with no access
            }
            
            // Get column information
            $colStmt = $db->prepare("
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = ?
                ORDER BY ordinal_position
            ");
            $colStmt->execute([$tableName]);
            $columns = $colStmt->fetchAll(PDO::FETCH_ASSOC);
            $totalColumns += count($columns);
            
            // Get constraints
            $constraintStmt = $db->prepare("
                SELECT DISTINCT
                    tc.constraint_name,
                    tc.constraint_type,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints tc
                LEFT JOIN information_schema.key_column_usage kcu 
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                LEFT JOIN information_schema.constraint_column_usage ccu 
                    ON tc.constraint_name = ccu.constraint_name
                    AND tc.table_schema = ccu.table_schema
                WHERE tc.table_schema = 'public' AND tc.table_name = ?
                ORDER BY tc.constraint_type, kcu.column_name
            ");
            $constraintStmt->execute([$tableName]);
            $constraints = $constraintStmt->fetchAll(PDO::FETCH_ASSOC);
            $totalConstraints += count($constraints);
            
            $schema[$tableName] = [
                'table_name' => $tableName,
                'table_type' => $table['table_type'],
                'row_count' => $rowCount,
                'columns' => $columns,
                'constraints' => $constraints
            ];
        }
        
        echo json_encode([
            'success' => true,
            'timestamp' => $timestamp,
            'table_count' => $totalTables,
            'total_rows' => $totalRows,
            'total_columns' => $totalColumns,
            'total_constraints' => $totalConstraints,
            'schema' => $schema
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to retrieve database schema: ' . $e->getMessage()
        ]);
    }
}

// Database maintenance operations
function executeDbMaintenance($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON data']);
            return;
        }
        
        // Support both formats: {query: "..."} from HTML and {operation: "...", sql: "..."} from API
        $sql = $input['query'] ?? $input['sql'] ?? '';
        $operation = $input['operation'] ?? 'QUERY';
        
        if (empty($sql)) {
            http_response_code(400);
            echo json_encode(['error' => 'SQL statement is required']);
            return;
        }
        
        // Security: Only allow safe operations
        $allowedOperations = [
            'SELECT',
            'UPDATE',
            'DELETE',
            'CREATE INDEX',
            'CREATE TABLE',  // Temporary: Allow table creation for team_managers
            'DROP INDEX', 
            'ANALYZE',
            'VACUUM',
            'REINDEX'
        ];
        
        $operationAllowed = false;
        $sqlUpper = strtoupper(trim($sql));
        
        foreach ($allowedOperations as $allowed) {
            if (strpos($sqlUpper, $allowed) === 0) {
                $operationAllowed = true;
                break;
            }
        }
        
        // Also block dangerous keywords
        $dangerousKeywords = [
            'DROP TABLE',
            'DROP DATABASE',
            'TRUNCATE',
            'ALTER TABLE',
            // 'CREATE TABLE',  // Temporarily removed to allow team_managers table creation
            'CREATE DATABASE'
        ];
        
        foreach ($dangerousKeywords as $dangerous) {
            if (strpos($sqlUpper, $dangerous) !== false) {
                $operationAllowed = false;
                break;
            }
        }
        
        if (!$operationAllowed) {
            http_response_code(400);
            echo json_encode([
                'error' => 'Operation not allowed. Only SELECT, UPDATE, DELETE, CREATE INDEX, DROP INDEX, ANALYZE, VACUUM, and REINDEX are permitted. Dangerous operations like DROP TABLE, TRUNCATE, etc. are blocked.',
                'allowed_operations' => $allowedOperations
            ]);
            return;
        }
        
        // Execute the maintenance operation
        $startTime = microtime(true);
        
        try {
            $stmt = $db->prepare($sql);
            $result = $stmt->execute();
            $endTime = microtime(true);
            $executionTime = round(($endTime - $startTime) * 1000, 2);
            
            if ($result) {
                $rowCount = $stmt->rowCount();
                $data = null;
                
                // For SELECT queries, fetch the results
                if (strpos($sqlUpper, 'SELECT') === 0) {
                    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $rowCount = count($data);
                }
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Query executed successfully',
                    'operation' => $operation,
                    'execution_time_ms' => $executionTime,
                    'rowCount' => $rowCount,
                    'data' => $data
                ]);
            } else {
                throw new Exception('Query execution failed');
            }
            
        } catch (Exception $e) {
            $endTime = microtime(true);
            $executionTime = round(($endTime - $startTime) * 1000, 2);
            
            throw new Exception('SQL execution failed: ' . $e->getMessage() . ' (executed in ' . $executionTime . 'ms)');
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// Team managers endpoint handler
function handleTeamManagers($db, $method, $path) {
    // Parse the path to get the manager ID if provided
    $segments = explode('/', trim($path, '/'));
    $managerId = null;
    $teamId = null;
    
    // Check for team-managers/{id} or team-managers/team/{teamId}
    if (count($segments) >= 2) {
        if ($segments[1] === 'team' && isset($segments[2])) {
            $teamId = intval($segments[2]);
        } else {
            $managerId = intval($segments[1]);
        }
    }
    
    switch ($method) {
        case 'GET':
            if ($teamId) {
                getTeamManagers($db, $teamId);
            } else {
                getAllTeamManagers($db);
            }
            break;
        case 'POST':
            createTeamManager($db);
            break;
        case 'PUT':
            if ($managerId) {
                updateTeamManager($db, $managerId);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Manager ID required for update']);
            }
            break;
        case 'DELETE':
            if ($managerId) {
                deleteTeamManager($db, $managerId);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Manager ID required for deletion']);
            }
            break;
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
}

function getAllTeamManagers($db) {
    try {
        $stmt = $db->query("
            SELECT tm.*, t.name as team_name 
            FROM team_managers tm 
            LEFT JOIN teams t ON tm.team_id = t.id 
            ORDER BY t.name, tm.last_name, tm.first_name
        ");
        $managers = $stmt->fetchAll();
        echo json_encode($managers);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch team managers: ' . $e->getMessage()]);
    }
}

function getTeamManagers($db, $teamId) {
    try {
        $stmt = $db->prepare("
            SELECT tm.*, t.name as team_name 
            FROM team_managers tm 
            LEFT JOIN teams t ON tm.team_id = t.id 
            WHERE tm.team_id = ? 
            ORDER BY tm.last_name, tm.first_name
        ");
        $stmt->execute([$teamId]);
        $managers = $stmt->fetchAll();
        echo json_encode($managers);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch team managers: ' . $e->getMessage()]);
    }
}

function createTeamManager($db) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input || !isset($input['team_id'], $input['first_name'], $input['last_name'])) {
            http_response_code(400);
            echo json_encode(['error' => 'team_id, first_name, and last_name are required']);
            return;
        }
        
        $stmt = $db->prepare("
            INSERT INTO team_managers (team_id, first_name, last_name, phone_number, email_address) 
            VALUES (?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $input['team_id'],
            $input['first_name'],
            $input['last_name'],
            $input['phone_number'] ?? null,
            $input['email_address'] ?? null
        ]);
        
        $managerId = $db->lastInsertId();
        
        // Return the created manager
        $stmt = $db->prepare("
            SELECT tm.*, t.name as team_name 
            FROM team_managers tm 
            LEFT JOIN teams t ON tm.team_id = t.id 
            WHERE tm.id = ?
        ");
        $stmt->execute([$managerId]);
        $manager = $stmt->fetch();
        
        // Send email notification
        sendManagerNotification('created', [
            'first_name' => $input['first_name'],
            'last_name' => $input['last_name'],
            'team_id' => $input['team_id'],
            'phone_number' => $input['phone_number'] ?? null,
            'email_address' => $input['email_address'] ?? null
        ], $manager['team_name'] ?? null);
        
        echo json_encode($manager);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create team manager: ' . $e->getMessage()]);
    }
}

function updateTeamManager($db, $managerId) {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode(['error' => 'No data provided']);
            return;
        }
        
        $stmt = $db->prepare("
            UPDATE team_managers 
            SET first_name = ?, last_name = ?, phone_number = ?, email_address = ?, updated_at = NOW() 
            WHERE id = ?
        ");
        
        $stmt->execute([
            $input['first_name'],
            $input['last_name'],
            $input['phone_number'] ?? null,
            $input['email_address'] ?? null,
            $managerId
        ]);
        
        // Return the updated manager
        $stmt = $db->prepare("
            SELECT tm.*, t.name as team_name 
            FROM team_managers tm 
            LEFT JOIN teams t ON tm.team_id = t.id 
            WHERE tm.id = ?
        ");
        $stmt->execute([$managerId]);
        $manager = $stmt->fetch();
        
        if ($manager) {
            // Send email notification
            sendManagerNotification('updated', [
                'first_name' => $input['first_name'],
                'last_name' => $input['last_name'],
                'team_id' => $manager['team_id'],
                'phone_number' => $input['phone_number'] ?? null,
                'email_address' => $input['email_address'] ?? null
            ], $manager['team_name'] ?? null);
            
            echo json_encode($manager);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Team manager not found']);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update team manager: ' . $e->getMessage()]);
    }
}

function deleteTeamManager($db, $managerId) {
    try {
        // Get manager data before deleting for email notification
        $stmt = $db->prepare("
            SELECT tm.*, t.name as team_name 
            FROM team_managers tm 
            LEFT JOIN teams t ON tm.team_id = t.id 
            WHERE tm.id = ?
        ");
        $stmt->execute([$managerId]);
        $manager = $stmt->fetch();
        
        if (!$manager) {
            http_response_code(404);
            echo json_encode(['error' => 'Team manager not found']);
            return;
        }
        
        // Delete the manager
        $stmt = $db->prepare("DELETE FROM team_managers WHERE id = ?");
        $stmt->execute([$managerId]);
        
        if ($stmt->rowCount() > 0) {
            // Send email notification
            sendManagerNotification('deleted', [
                'first_name' => $manager['first_name'],
                'last_name' => $manager['last_name'],
                'team_id' => $manager['team_id'],
                'phone_number' => $manager['phone_number'],
                'email_address' => $manager['email_address']
            ], $manager['team_name'] ?? null);
            
            echo json_encode(['success' => true, 'message' => 'Team manager deleted successfully']);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Team manager not found']);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete team manager: ' . $e->getMessage()]);
    }
}

// Email notification function using Resend
function sendManagerNotification($action, $managerData, $teamName = null) {
    $apiKey = 're_DgSt5TMx_7DRHWdP9TKqyzhA2h34fTpxU';
    $toEmail = 'lionel@gentil.name';
    
    // Build email subject and content based on action
    switch ($action) {
        case 'created':
            $subject = "New Team Manager Added - {$managerData['first_name']} {$managerData['last_name']}";
            $content = "
                <h3>New Team Manager Added</h3>
                <p><strong>Manager:</strong> {$managerData['first_name']} {$managerData['last_name']}</p>
                <p><strong>Team:</strong> " . ($teamName ?: 'Team ID: ' . $managerData['team_id']) . "</p>
                <p><strong>Phone:</strong> " . ($managerData['phone_number'] ?: 'Not provided') . "</p>
                <p><strong>Email:</strong> " . ($managerData['email_address'] ?: 'Not provided') . "</p>
                <p><strong>Time:</strong> " . date('Y-m-d H:i:s T') . "</p>
            ";
            break;
            
        case 'updated':
            $subject = "Team Manager Updated - {$managerData['first_name']} {$managerData['last_name']}";
            $content = "
                <h3>Team Manager Updated</h3>
                <p><strong>Manager:</strong> {$managerData['first_name']} {$managerData['last_name']}</p>
                <p><strong>Team:</strong> " . ($teamName ?: 'Team ID: ' . $managerData['team_id']) . "</p>
                <p><strong>Phone:</strong> " . ($managerData['phone_number'] ?: 'Not provided') . "</p>
                <p><strong>Email:</strong> " . ($managerData['email_address'] ?: 'Not provided') . "</p>
                <p><strong>Time:</strong> " . date('Y-m-d H:i:s T') . "</p>
            ";
            break;
            
        case 'deleted':
            $subject = "Team Manager Removed - {$managerData['first_name']} {$managerData['last_name']}";
            $content = "
                <h3>Team Manager Removed</h3>
                <p><strong>Removed Manager:</strong> {$managerData['first_name']} {$managerData['last_name']}</p>
                <p><strong>Team:</strong> " . ($teamName ?: 'Team ID: ' . $managerData['team_id']) . "</p>
                <p><strong>Time:</strong> " . date('Y-m-d H:i:s T') . "</p>
            ";
            break;
            
        default:
            return false;
    }
    
    // Prepare email data for Resend API
    $emailData = [
        'from' => 'CheckIn App <lionel@gentil.name>',
        'to' => [$toEmail],
        'subject' => $subject,
        'html' => $content
    ];
    
    // Send via Resend API
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($emailData));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    // Log the result for debugging
    error_log("Manager notification email - Action: $action, HTTP Code: $httpCode, Response: $response");
    
    return $httpCode === 200;
}
?>
