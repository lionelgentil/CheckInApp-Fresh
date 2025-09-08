<?php
/**
 * CheckIn App for BUSC PASS - PHP API
 * RESTful API for team and event management
 */

// Start session for authentication BEFORE any output
session_start();

// Version constant - update this single location to change version everywhere
const APP_VERSION = '5.5.3';

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
    
    // Build PostgreSQL PDO connection string
    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname}";
    
    $db = new PDO($dsn, $user, $password);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
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
    switch ($path) {
        case 'auth/check':
            // Check authentication status
            if ($method === 'GET') {
                echo json_encode(array(
                    'authenticated' => isAuthenticated(),
                    'session_remaining' => isAuthenticated() ? SESSION_TIMEOUT - (time() - $_SESSION['auth_timestamp']) : 0
                ));
            }
            break;
            
        case 'auth/login':
            // Admin login
            if ($method === 'POST') {
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
            }
            break;
            
        case 'auth/logout':
            // Admin logout
            if ($method === 'POST') {
                session_destroy();
                echo json_encode(array('success' => true, 'message' => 'Logged out successfully'));
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
                'persistent' => true
            ));
            break;
            
        case 'teams':
            if ($method === 'GET') {
                getTeams($db);
            } elseif ($method === 'POST') {
                requireAuth(); // Require authentication for modifications
                
                // Log team saves to detect if they're causing the issue
                error_log("=== TEAM SAVE TRIGGERED ===");
                error_log("Team save request detected - this might delete disciplinary records!");
                error_log("Team save data: " . file_get_contents('php://input'));
                
                // Count disciplinary records before team save
                $recordsBeforeTeamSave = getDisciplinaryRecordsCount($db);
                error_log("Disciplinary records before team save: " . $recordsBeforeTeamSave);
                
                saveTeams($db);
                
                // Count disciplinary records after team save (bust cache for fresh count)
                $recordsAfterTeamSave = getDisciplinaryRecordsCount($db, true);
                error_log("Disciplinary records after team save: " . $recordsAfterTeamSave);
                
                if ($recordsAfterTeamSave < $recordsBeforeTeamSave) {
                    error_log("ALERT: Team save deleted " . ($recordsBeforeTeamSave - $recordsAfterTeamSave) . " disciplinary records!");
                }
                error_log("=== TEAM SAVE COMPLETE ===");
            }
            break;
            
        case 'member-photo':
            // DEPRECATED: This endpoint is deprecated after photo migration
            // Use /api/photos?filename= instead for direct file serving with HTTP caching
            if ($method === 'GET') {
                http_response_code(410); // Gone
                echo json_encode([
                    'error' => 'This endpoint is deprecated after photo migration',
                    'message' => 'Use /api/photos?filename= instead for direct file serving with HTTP caching',
                    'migration_info' => 'Photos are now stored as files with direct URLs for better performance'
                ]);
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
                
                // Log events saves to detect if they're causing the issue
                error_log("=== EVENT SAVE TRIGGERED ===");
                
                // Count disciplinary records before event save
                $recordsBeforeEventSave = getDisciplinaryRecordsCount($db);
                error_log("Disciplinary records before event save: " . $recordsBeforeEventSave);
                
                saveEvents($db);
                
                // Count disciplinary records after event save (bust cache for fresh count)
                $recordsAfterEventSave = getDisciplinaryRecordsCount($db, true);
                error_log("Disciplinary records after event save: " . $recordsAfterEventSave);
                
                if ($recordsAfterEventSave < $recordsBeforeEventSave) {
                    error_log("ALERT: Event save deleted " . ($recordsBeforeEventSave - $recordsAfterEventSave) . " disciplinary records!");
                }
                error_log("=== EVENT SAVE COMPLETE ===");
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
            
        case 'disciplinary-records':
            if ($method === 'GET') {
                getDisciplinaryRecords($db);
            } elseif ($method === 'POST') {
                requireAuth(); // Require authentication for modifications
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
            
        case 'migrate-photos':
            // Migrate photos from team_members.photo to member_photos table
            if ($method === 'POST') {
                requireAuth(); // Require authentication for migrations
                migratePhotosToSeparateTable($db);
            }
            break;
            
        case 'fix-photos-directory':
            // Emergency fix to recreate photos directory and clean database
            if ($method === 'POST') {
                $password = isset($_POST['password']) ? $_POST['password'] : '';
                if ($password !== 'fixphotos2024') {
                    http_response_code(401);
                    echo json_encode(['error' => 'Invalid password']);
                    break;
                }
                
                $photosDir = __DIR__ . '/photos/members';
                $defaultsDir = __DIR__ . '/photos/defaults';
                $results = [];
                
                // Create photos directories if they don't exist
                if (!is_dir($photosDir)) {
                    if (mkdir($photosDir, 0755, true)) {
                        $results[] = "Created photos/members directory";
                    } else {
                        $results[] = "ERROR: Could not create photos/members directory";
                    }
                } else {
                    $results[] = "photos/members directory already exists";
                }
                
                if (!is_dir($defaultsDir)) {
                    if (mkdir($defaultsDir, 0755, true)) {
                        $results[] = "Created photos/defaults directory";
                    } else {
                        $results[] = "ERROR: Could not create photos/defaults directory";
                    }
                } else {
                    $results[] = "photos/defaults directory already exists";
                }
                
                // Clean up database - set photo field to NULL for members with missing files
                $stmt = $db->query("SELECT id, name, photo FROM team_members WHERE photo IS NOT NULL");
                $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $cleanedCount = 0;
                
                foreach ($members as $member) {
                    $photoFilename = $member['photo'];
                    
                    // Extract filename if it's a URL
                    if (strpos($photoFilename, '/api/photos?filename=') === 0) {
                        $parsedUrl = parse_url($photoFilename);
                        if ($parsedUrl && isset($parsedUrl['query'])) {
                            parse_str($parsedUrl['query'], $query);
                            if (isset($query['filename'])) {
                                $photoFilename = $query['filename'];
                            }
                        }
                    }
                    
                    $photoPath = $photosDir . '/' . $photoFilename;
                    
                    // If file doesn't exist, clear the database reference
                    if (!file_exists($photoPath)) {
                        $updateStmt = $db->prepare('UPDATE team_members SET photo = NULL WHERE id = ?');
                        $updateStmt->execute([$member['id']]);
                        $cleanedCount++;
                    }
                }
                
                $results[] = "Cleaned {$cleanedCount} missing photo references from database";
                
                // Create default SVG files if they don't exist
                $maleDefault = $defaultsDir . '/male.svg';
                $femaleDefault = $defaultsDir . '/female.svg';
                
                if (!file_exists($maleDefault)) {
                    $maleSvg = '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#4F80FF"/>
    <circle cx="50" cy="35" r="18" fill="white"/>
    <ellipse cx="50" cy="75" rx="25" ry="20" fill="white"/>
</svg>';
                    if (file_put_contents($maleDefault, $maleSvg)) {
                        $results[] = "Created male.svg default avatar";
                    } else {
                        $results[] = "ERROR: Could not create male.svg";
                    }
                } else {
                    $results[] = "male.svg already exists";
                }
                
                if (!file_exists($femaleDefault)) {
                    $femaleSvg = '<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#FF69B4"/>
    <circle cx="50" cy="35" r="18" fill="white"/>
    <ellipse cx="50" cy="75" rx="25" ry="20" fill="white"/>
</svg>';
                    if (file_put_contents($femaleDefault, $femaleSvg)) {
                        $results[] = "Created female.svg default avatar";
                    } else {
                        $results[] = "ERROR: Could not create female.svg";
                    }
                } else {
                    $results[] = "female.svg already exists";
                }
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Photos directory fix completed',
                    'results' => $results,
                    'cleaned_members' => $cleanedCount
                ]);
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
            }
            break;
            
        case 'debug-photos-detailed':
            // Enhanced debug endpoint to check photo data and files
            if ($method === 'GET') {
                $stmt = $db->query("
                    SELECT id, name, gender, photo, 
                           LENGTH(photo) as photo_length,
                           CASE 
                               WHEN photo LIKE '/api/photos%' THEN 'API_URL'
                               WHEN photo LIKE '/photos/members%' THEN 'FULL_PATH'  
                               WHEN photo LIKE '%.svg' OR photo LIKE '%.jpg' OR photo LIKE '%.png' THEN 'FILENAME'
                               ELSE 'OTHER'
                           END as photo_type
                    FROM team_members 
                    WHERE photo IS NOT NULL 
                    ORDER BY photo_type, id
                    LIMIT 20
                ");
                $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                // Check if files actually exist
                $photosDir = __DIR__ . '/photos/members';
                foreach ($members as &$member) {
                    $photoFilename = $member['photo'];
                    
                    // Extract filename if it's a URL
                    if (strpos($photoFilename, '/api/photos?filename=') === 0) {
                        $parsedUrl = parse_url($photoFilename);
                        if ($parsedUrl && isset($parsedUrl['query'])) {
                            parse_str($parsedUrl['query'], $query);
                            if (isset($query['filename'])) {
                                $photoFilename = $query['filename'];
                            }
                        }
                    }
                    
                    $photoPath = $photosDir . '/' . $photoFilename;
                    $member['file_exists'] = file_exists($photoPath);
                    $member['file_size'] = file_exists($photoPath) ? filesize($photoPath) : 0;
                    $member['expected_path'] = $photoPath;
                    
                    // Check for any files starting with member ID
                    $memberFiles = glob($photosDir . '/' . $member['id'] . '*');
                    $member['found_files'] = array_map('basename', $memberFiles);
                }
                
                echo json_encode([
                    'success' => true,
                    'members' => $members,
                    'photos_directory' => $photosDir,
                    'directory_exists' => is_dir($photosDir),
                    'timestamp' => date('c')
                ]);
            }
            break;
            
        case 'debug-photos':
            // Debug endpoint to check photo data in database
            if ($method === 'GET') {
                $stmt = $db->query("
                    SELECT id, name, gender, photo, 
                           LENGTH(photo) as photo_length,
                           CASE 
                               WHEN photo LIKE '/api/photos%' THEN 'API_URL'
                               WHEN photo LIKE '/photos/members%' THEN 'FULL_PATH'  
                               WHEN photo LIKE '%.svg' OR photo LIKE '%.jpg' OR photo LIKE '%.png' THEN 'FILENAME'
                               ELSE 'OTHER'
                           END as photo_type
                    FROM team_members 
                    WHERE photo IS NOT NULL 
                    ORDER BY photo_type, id
                    LIMIT 20
                ");
                $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode([
                    'success' => true,
                    'members' => $members,
                    'timestamp' => date('c'),
                    'note' => 'Check photo_type: FILENAME is correct, API_URL/FULL_PATH are wrong'
                ]);
            }
            break;
            
        case 'cleanup-photo-paths':
            // Cleanup endpoint to fix photo paths in database
            if ($method === 'POST') {
                $password = isset($_POST['password']) ? $_POST['password'] : '';
                if ($password !== 'cleanup2024') {
                    http_response_code(401);
                    echo json_encode(['error' => 'Invalid password']);
                    break;
                }
                cleanupPhotoPaths($db);
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
            }
            break;
            
        case 'migrate-photos':
            // TEMPORARY: Migration endpoint - remove after use
            if ($method === 'POST') {
                $password = isset($_POST['password']) ? $_POST['password'] : '';
                if ($password !== 'migrate2024') {
                    http_response_code(401);
                    echo json_encode(['error' => 'Invalid password']);
                    break;
                }
                migratePhotos($db);
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
            }
            break;
            
        case 'volume-files':
            // List files in Railway volume
            if ($method === 'GET') {
                listVolumeFiles($db);
            }
            break;
            
        case 'volume-test':
            // Test Railway volume access
            if ($method === 'GET') {
                testVolumeAccess($db);
            }
            break;
            
        case 'db-maintenance':
            // Database maintenance endpoint for SQL execution
            if ($method === 'POST') {
                requireAuth(); // Require authentication for database maintenance
                executeDatabaseMaintenance($db);
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
            }
            break;
            
        case 'migrate-to-epochs':
            // Migrate dates and times to epoch timestamps
            if ($method === 'POST') {
                requireAuth(); // Require authentication for migrations
                migrateToEpochTimestamps($db);
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
            }
            break;
            
        case 'migrate-remaining-epochs':
            // Migrate remaining created_at fields to epoch timestamps  
            if ($method === 'POST') {
                requireAuth(); // Require authentication for migrations
                migrateRemainingEpochTimestamps($db);
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
            }
            break;
            
        case 'cleanup-string-dates':
            // FINAL STEP: Drop all old string date/time columns (IRREVERSIBLE!)
            if ($method === 'POST') {
                requireAuth(); // Require authentication for cleanup
                $password = json_decode(file_get_contents('php://input'), true)['confirm_password'] ?? '';
                if ($password !== 'CLEANUP_DATES_2024') {
                    http_response_code(401);
                    echo json_encode(['error' => 'Confirmation password required for irreversible cleanup']);
                    break;
                }
                cleanupStringDateColumns($db);
            } else {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
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

// Final cleanup function to drop all old string date/time columns (IRREVERSIBLE!)
function cleanupStringDateColumns($db) {
    try {
        error_log("=== STARTING STRING DATE CLEANUP ===" );
        $results = [];
        $errors = [];
        
        $results[] = "⚠️  IRREVERSIBLE OPERATION: Dropping all old string date/time columns";
        $results[] = "This will permanently remove backup columns and switch to pure epoch-based system";
        
        // List all columns to be dropped (IRREVERSIBLE!)
        $columnsToDropByTable = [
            'events' => ['date', 'created_at'],
            'matches' => ['match_time', 'created_at'], 
            'general_attendees' => ['checked_in_at'],
            'match_attendees' => ['checked_in_at'],
            'player_disciplinary_records' => ['incident_date', 'suspension_served_date', 'created_at'],
            'team_members' => ['created_at'],
            'teams' => ['created_at'],
            'referees' => ['created_at'],
            'member_photos' => ['uploaded_at'],
            'match_cards' => ['created_at']
        ];
        
        $totalColumnsDropped = 0;
        
        foreach ($columnsToDropByTable as $table => $columns) {
            $results[] = "\n🗑️  Processing table: $table";
            
            foreach ($columns as $column) {
                try {
                    // Check if column exists before trying to drop it
                    $stmt = $db->prepare("
                        SELECT COUNT(*) as exists 
                        FROM information_schema.columns 
                        WHERE table_name = ? AND column_name = ? AND table_schema = 'public'
                    ");
                    $stmt->execute([$table, $column]);
                    $columnExists = $stmt->fetch(PDO::FETCH_ASSOC)['exists'] > 0;
                    
                    if ($columnExists) {
                        $sql = "ALTER TABLE $table DROP COLUMN $column";
                        $db->exec($sql);
                        $results[] = "   ✅ Dropped $table.$column";
                        $totalColumnsDropped++;
                        error_log("CLEANUP: Dropped $table.$column");
                    } else {
                        $results[] = "   ⏭️  Skipped $table.$column (already removed)";
                    }
                    
                } catch (Exception $e) {
                    $error = "   ❌ Failed to drop $table.$column: " . $e->getMessage();
                    $errors[] = $error;
                    error_log("CLEANUP ERROR: " . $error);
                }
            }
        }
        
        $results[] = "\n=== CLEANUP SUMMARY ===";
        $results[] = "✅ Successfully dropped $totalColumnsDropped string date/time columns";
        $results[] = "🎯 Database is now pure epoch-based!";
        $results[] = "📊 All dates/times are stored as integers (seconds since 1970)";
        $results[] = "⚡ Time calculations use simple arithmetic instead of complex parsing";
        
        if (!empty($errors)) {
            $results[] = "\n⚠️ ERRORS ENCOUNTERED:";
            $results = array_merge($results, $errors);
        } else {
            $results[] = "\n🎉 CLEANUP COMPLETED WITHOUT ERRORS!";
        }
        
        // Verify the cleanup worked by checking remaining columns
        $results[] = "\n🔍 VERIFICATION: Checking for any remaining string date columns...";
        $stringDateColumnsFound = [];
        
        foreach (array_keys($columnsToDropByTable) as $table) {
            $stmt = $db->prepare("
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = ? 
                AND table_schema = 'public'
                AND (column_name LIKE '%date%' OR column_name LIKE '%time%' OR column_name LIKE '%created_at%' OR column_name LIKE '%uploaded_at%')
                AND data_type IN ('timestamp', 'date', 'time')
                ORDER BY column_name
            ");
            $stmt->execute([$table]);
            $remainingColumns = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            if (!empty($remainingColumns)) {
                $stringDateColumnsFound[] = "$table: " . implode(', ', $remainingColumns);
            }
        }
        
        if (empty($stringDateColumnsFound)) {
            $results[] = "✅ PERFECT! No string date/time columns found - cleanup is complete!";
        } else {
            $results[] = "⚠️ Found remaining string date columns:";
            $results = array_merge($results, $stringDateColumnsFound);
        }
        
        error_log("=== STRING DATE CLEANUP COMPLETED ===");
        
        echo json_encode([
            'success' => true,
            'message' => 'String date columns cleanup completed successfully',
            'results' => $results,
            'columns_dropped' => $totalColumnsDropped,
            'error_count' => count($errors),
            'timestamp' => date('c'),
            'database_status' => 'pure_epoch_based'
        ]);
        
    } catch (Exception $e) {
        error_log('STRING DATE CLEANUP FAILED: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Cleanup failed: ' . $e->getMessage(),
            'results' => $results ?? [],
            'timestamp' => date('c')
        ]);
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
                        $photo = '/photos/' . $photoValue;
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
                        
                        $photo = '/photos/' . $photoValue;
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
    
    echo json_encode($teams);
}

// DEPRECATED: This function is deprecated after photo migration to Railway volume
// Photos are now served directly via servePhoto() with /api/photos?filename= URLs
function getMemberPhoto($db) {
    $memberId = $_GET['member_id'] ?? '';
    
    if (empty($memberId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Member ID required']);
        return;
    }
    
    try {
        // First check if member has photo in member_photos table
        $photoStmt = $db->prepare('SELECT photo_data FROM member_photos WHERE member_id = ?');
        $photoStmt->execute([$memberId]);
        $photoData = $photoStmt->fetchColumn();
        
        if ($photoData) {
            // Return base64 photo data
            echo json_encode([
                'success' => true,
                'member_id' => $memberId,
                'photo' => $photoData,
                'source' => 'member_photos_table'
            ]);
            return;
        }
        
        // Fallback: check legacy photo field in team_members
        $memberStmt = $db->prepare('SELECT photo, gender FROM team_members WHERE id = ?');
        $memberStmt->execute([$memberId]);
        $member = $memberStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$member) {
            http_response_code(404);
            echo json_encode(['error' => 'Member not found']);
            return;
        }
        
        if ($member['photo'] && $member['photo'] !== 'has_photo') {
            // Legacy photo data
            $photoValue = $member['photo'];
            
            if (strpos($photoValue, 'data:image/') === 0) {
                // Base64 data in legacy field
                echo json_encode([
                    'success' => true,
                    'member_id' => $memberId,
                    'photo' => $photoValue,
                    'source' => 'legacy_base64'
                ]);
                return;
            } else {
                // File-based photo - convert to API URL
                $cleanFilename = basename($photoValue);
                if (strpos($cleanFilename, '.') !== false) {
                    echo json_encode([
                        'success' => true,
                        'member_id' => $memberId,
                        'photo' => "/api/photos?filename=" . urlencode($cleanFilename),
                        'source' => 'legacy_file'
                    ]);
                    return;
                }
            }
        }
        
        // No custom photo found - return gender default
        echo json_encode([
            'success' => true,
            'member_id' => $memberId,
            'photo' => getDefaultPhoto($member['gender']),
            'source' => 'gender_default'
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to load member photo: ' . $e->getMessage()]);
    }
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
                        $photo = '/photos/' . $row['photo'];
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
                        $photo = '/photos/' . $photoValue;
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
                        $photo = '/photos/' . $photoValue;
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
                        
                        $photo = '/photos/' . $photoValue;
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
        
        // EMERGENCY FIX: Completely disable member deletion to preserve disciplinary records
        // Delete orphaned members (not in incoming data) - this will cascade delete their disciplinary records
        if (!empty($incomingMemberIds)) {
            error_log("SKIPPING: Member cleanup disabled to preserve disciplinary records");
            // $placeholders = str_repeat('?,', count($incomingMemberIds) - 1) . '?';
            // $stmt = $db->prepare("DELETE FROM team_members WHERE id NOT IN ({$placeholders})");
            // $stmt->execute($incomingMemberIds);
        } else {
            error_log("SKIPPING: All member deletion disabled to preserve disciplinary records");
            // // CRITICAL FIX: Only delete all members if we're sure this is intentional
            // // Check if any teams in the input are supposed to have members
            // $hasAnyMembersData = false;
            // foreach ($input as $team) {
            //     if (isset($team['members']) && is_array($team['members'])) {
            //         $hasAnyMembersData = true;
            //         break;
            //     }
            // }
            // 
            // // Only delete all members if teams explicitly have empty members arrays
            // // Don't delete if members key is missing entirely (could be partial update)
            // if ($hasAnyMembersData) {
            //     error_log("WARNING: Deleting all team members due to empty members data");
            //     $db->exec('DELETE FROM team_members');
            // } else {
            //     error_log("SKIPPING: Team save without members data - preserving existing members");
            // }
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
            error_log("Cleaned up teams not in incoming data");
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
    // Step 1: Get all events with epoch timestamps
    $stmt = $db->query('SELECT id, name, description, date, date_epoch FROM events ORDER BY date_epoch, date');
    $events = [];
    $eventIds = [];
    
    while ($event = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Use epoch timestamp if available, fallback to string date
        $eventEpoch = $event['date_epoch'] ?: strtotime($event['date'] . ' 00:00:00 America/Los_Angeles');
        
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
    
    // Step 2: Get all matches with epoch timestamps
    $eventIdsPlaceholder = str_repeat('?,', count($eventIds) - 1) . '?';
    $stmt = $db->prepare("
        SELECT id, event_id, home_team_id, away_team_id, field, match_time, match_time_epoch,
               main_referee_id, assistant_referee_id, notes, home_score, away_score, match_status
        FROM matches 
        WHERE event_id IN ({$eventIdsPlaceholder}) 
        ORDER BY event_id, match_time_epoch, match_time
    ");
    $stmt->execute($eventIds);
    
    $matches = [];
    $matchIds = [];
    while ($match = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Use epoch timestamp if available, fallback to combining event date + match time
        $matchEpoch = $match['match_time_epoch'];
        if (!$matchEpoch && $match['match_time']) {
            // Fallback: combine event date with match time
            $eventDate = $events[$match['event_id']]['date'];
            $cleanDate = date('Y-m-d', strtotime($eventDate));
            $matchEpoch = strtotime($cleanDate . ' ' . $match['match_time'] . ' America/Los_Angeles');
        }
        
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
            // Use epoch timestamp if available, fallback to string timestamp
            $checkedInEpoch = $attendee['checked_in_at_epoch'] ?: strtotime($attendee['checked_in_at'] . ' America/Los_Angeles');
            
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
    
    // Step 5: Get all general attendees with epoch timestamps
    $stmt = $db->prepare("
        SELECT event_id, member_id, name, team_name, status, checked_in_at, checked_in_at_epoch
        FROM general_attendees 
        WHERE event_id IN ({$eventIdsPlaceholder})
    ");
    $stmt->execute($eventIds);
    
    while ($attendee = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Use epoch timestamp if available, fallback to string timestamp
        $checkedInEpoch = $attendee['checked_in_at_epoch'] ?: strtotime($attendee['checked_in_at'] . ' America/Los_Angeles');
        
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
    $teamId = $_GET['team_id'] ?? null;
    
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
    } elseif ($teamId) {
        // Get records for all members of a specific team
        $stmt = $db->prepare('
            SELECT pdr.*, tm.name as member_name, t.name as team_name
            FROM player_disciplinary_records pdr
            JOIN team_members tm ON pdr.member_id = tm.id
            JOIN teams t ON tm.team_id = t.id
            WHERE t.id = ?
            ORDER BY pdr.incident_date DESC, pdr.created_at DESC
        ');
        $stmt->execute([$teamId]);
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
            INSERT INTO player_disciplinary_records (member_id, card_type, reason, notes, incident_date, suspension_matches, suspension_served, suspension_served_date)
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
            
            $suspensionServedDate = ($suspensionServed && !empty($record['suspensionServedDate'])) ? $record['suspensionServedDate'] : null;
            
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
                $record['incidentDate'] ?? null,
                $suspensionMatches,
                $suspensionServed ? 1 : 0, // Explicit 1/0 for PostgreSQL
                $suspensionServedDate
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

function servePhoto($db) {
    $filename = $_GET['filename'] ?? '';
    
    // Debug logging for troubleshooting
    error_log("servePhoto called with filename: " . $filename);
    
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
            error_log("servePhoto: Cleaned path to filename: " . $filename);
        } elseif (strpos($filename, '/api/photos') === 0) {
            // Handle case where full API URL was passed as filename
            $parsedUrl = parse_url($filename);
            if ($parsedUrl && isset($parsedUrl['query'])) {
                parse_str($parsedUrl['query'], $query);
                if (isset($query['filename'])) {
                    $filename = $query['filename'];
                    error_log("servePhoto: Extracted filename from nested URL: " . $filename);
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
    
    if ($originalFilename !== $filename) {
        error_log("servePhoto: Cleaned filename from '{$originalFilename}' to '{$filename}'");
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
            error_log("servePhoto: Found in Railway volume: " . $photoPath);
        } elseif (file_exists($fallbackPhotoPath)) {
            $photoPath = $fallbackPhotoPath;
            error_log("servePhoto: Found in fallback directory: " . $photoPath);
        } elseif (file_exists($legacyPhotoPath)) {
            $photoPath = $legacyPhotoPath;
            error_log("servePhoto: Found in legacy location: " . $photoPath);
        } else {
            $photoPath = null;
            error_log("servePhoto: Photo not found in any location");
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
            
            error_log("servePhoto: Searching volume: " . $volumeDir . '/' . $memberId . '_*');
            error_log("servePhoto: Found " . count($volumeFiles) . " volume files: " . implode(', ', $volumeFiles));
            error_log("servePhoto: Found " . count($fallbackFiles) . " fallback files: " . implode(', ', $fallbackFiles));
            error_log("servePhoto: Found " . count($legacyFiles) . " legacy files: " . implode(', ', $legacyFiles));
            
            if (!empty($volumeFiles)) {
                // Use the most recent file from volume
                $photoPath = end($volumeFiles);
                error_log("servePhoto: Using volume photo for member {$memberId}: " . basename($photoPath));
            } elseif (!empty($fallbackFiles)) {
                // Use the most recent file from fallback
                $photoPath = end($fallbackFiles);
                error_log("servePhoto: Using fallback photo for member {$memberId}: " . basename($photoPath));
            } elseif (!empty($legacyFiles)) {
                // Fallback to legacy files
                $photoPath = end($legacyFiles);
                error_log("servePhoto: Using legacy photo for member {$memberId}: " . basename($photoPath));
            } else {
                // No photo file found, fall back to gender-appropriate default
                error_log("servePhoto: No files found for member {$memberId}, looking up gender for fallback");
                $stmt = $db->prepare('SELECT gender FROM team_members WHERE id = ?');
                $stmt->execute([$memberId]);
                $member = $stmt->fetch(PDO::FETCH_ASSOC);
                
                $gender = ($member && $member['gender'] === 'female') ? 'female' : 'male';
                $photoPath = __DIR__ . '/photos/defaults/' . ($gender === 'female' ? 'female.svg' : 'male.svg');
                error_log("servePhoto: No photo found for member {$memberId}, falling back to {$gender} default: " . $photoPath);
                error_log("servePhoto: WARNING - Serving {$gender}.svg for requested filename: {$filename}");
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
        
        error_log("uploadPhoto: Starting upload for member ID: " . $memberId);
        
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
                error_log("uploadPhoto: Member not found (attempt " . ($retry + 1) . "/$maxRetries), retrying in 100ms...");
                usleep(100000); // Wait 100ms before retry
            }
        }
        
        if (!$member) {
            error_log("uploadPhoto: Member not found after $maxRetries attempts: " . $memberId);
            http_response_code(404);
            echo json_encode(['error' => 'Member not found - ensure member is created before uploading photo']);
            return;
        }
        
        error_log("uploadPhoto: Found member: " . $member['name']);
    
    // Check if file was uploaded
    if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
        $errorMsg = isset($_FILES['photo']) ? 'Upload error: ' . $_FILES['photo']['error'] : 'No file uploaded';
        error_log("uploadPhoto: " . $errorMsg);
        http_response_code(400);
        echo json_encode(['error' => 'No valid file uploaded', 'details' => $errorMsg]);
        return;
    }
    
    $file = $_FILES['photo'];
    error_log("uploadPhoto: File received - name: " . $file['name'] . ", size: " . $file['size'] . " bytes");
    
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
        error_log("uploadPhoto: Railway volume directory not found: " . $photosDir);
        $photosDir = $fallbackDir;
    } else {
        // Test write access without trying to change permissions
        $testFile = $photosDir . '/write_test_' . time();
        $canWrite = @file_put_contents($testFile, 'test');
        
        if ($canWrite === false) {
            error_log("uploadPhoto: Railway volume not writable, using fallback directory");
            error_log("uploadPhoto: Volume owner: " . (posix_getpwuid(fileowner($photosDir))['name'] ?? 'unknown'));
            error_log("uploadPhoto: Volume permissions: " . substr(sprintf('%o', fileperms($photosDir)), -4));
            $photosDir = $fallbackDir;
        } else {
            // Clean up test file
            @unlink($testFile);
            error_log("uploadPhoto: Railway volume is writable");
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
            'directory_writable' => is_writable($photosDir),
            'volume_owner' => is_dir('/app/storage/photos') ? (posix_getpwuid(fileowner('/app/storage/photos'))['name'] ?? 'unknown') : 'N/A',
            'volume_permissions' => is_dir('/app/storage/photos') ? substr(sprintf('%o', fileperms('/app/storage/photos')), -4) : 'N/A'
        ]);
        return;
    }
    
    $photoPath = $photosDir . '/' . $filename;
    
    // Move uploaded file to Railway volume
    if (!move_uploaded_file($file['tmp_name'], $photoPath)) {
        error_log("uploadPhoto: Failed to move file to volume, trying with different permissions");
        error_log("uploadPhoto: Source: " . $file['tmp_name']);
        error_log("uploadPhoto: Destination: " . $photoPath);
        error_log("uploadPhoto: Volume permissions: " . substr(sprintf('%o', fileperms($photosDir)), -4));
        
        // Try creating the file with different approach
        $tempData = file_get_contents($file['tmp_name']);
        if ($tempData !== false && file_put_contents($photoPath, $tempData) !== false) {
            error_log("uploadPhoto: Successfully saved using file_put_contents instead of move_uploaded_file");
        } else {
            http_response_code(500);
            echo json_encode([
                'error' => 'Failed to save photo to volume',
                'details' => 'Both move_uploaded_file and file_put_contents failed',
                'volume_path' => $photosDir,
                'file_path' => $photoPath,
                'volume_exists' => is_dir($photosDir),
                'volume_writable' => is_writable($photosDir),
                'volume_permissions' => is_dir($photosDir) ? substr(sprintf('%o', fileperms($photosDir)), -4) : 'N/A'
            ]);
            return;
        }
    }
    
    error_log("uploadPhoto: Saved file to volume: " . $photoPath);
    
    // Remove any existing photo files for this member (cleanup old files from volume)
    $existingFiles = glob($photosDir . '/' . $memberId . '_*');
    foreach ($existingFiles as $existingFile) {
        if ($existingFile !== $photoPath) { // Don't delete the file we just created
            unlink($existingFile);
        }
    }
    
    // Update database - store filename only (not base64)
    try {
        error_log("uploadPhoto: Storing filename in database: " . $filename);
        
        // Remove old photo data from member_photos table (if exists)
        $deleteStmt = $db->prepare('DELETE FROM member_photos WHERE member_id = ?');
        $deleteStmt->execute([$memberId]);
        
        // Update team_members table with filename
        $stmt = $db->prepare('UPDATE team_members SET photo = ? WHERE id = ?');
        $result = $stmt->execute([$filename, $memberId]);
        
        if ($result) {
            error_log("uploadPhoto: Database updated successfully");
        } else {
            throw new Exception("Failed to update team_members table");
        }
        
        $responseData = [
            'success' => true,
            'member_id' => $memberId,
            'url' => '/api/photos?filename=' . urlencode($filename),
            'storage_type' => 'railway_volume',
            'filename' => $filename
        ];
        
        error_log("uploadPhoto: Success response (volume storage)");
        echo json_encode($responseData);
        
    } catch (Exception $e) {
        error_log("uploadPhoto: Database error: " . $e->getMessage());
        // Clean up the uploaded file if database update fails
        if (file_exists($photoPath)) {
            unlink($photoPath);
        }
        throw $e;
    }
    
    } catch (Exception $e) {
        error_log("uploadPhoto: Unexpected error: " . $e->getMessage());
        error_log("uploadPhoto: Stack trace: " . $e->getTraceAsString());
        http_response_code(500);
        echo json_encode([
            'error' => 'Photo upload failed: ' . $e->getMessage(),
            'member_id' => $memberId ?? 'unknown'
        ]);
    }
}

function migratePhotosToSeparateTable($db) {
    try {
        $results = [];
        
        // Get all members with photo data
        $stmt = $db->prepare('SELECT id, photo FROM team_members WHERE photo IS NOT NULL AND photo != \'\'');
        $stmt->execute();
        $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $migratedCount = 0;
        $skippedCount = 0;
        
        foreach ($members as $member) {
            $memberId = $member['id'];
            $photoData = $member['photo'];
            
            // Check if it's base64 data that should be migrated
            if (strpos($photoData, 'data:image/') === 0) {
                // Extract content type and file size
                $contentType = '';
                $fileSize = strlen($photoData);
                
                if (preg_match('/^data:([^;]+);/', $photoData, $matches)) {
                    $contentType = $matches[1];
                }
                
                // Insert into member_photos table
                $insertStmt = $db->prepare('
                    INSERT INTO member_photos (member_id, photo_data, content_type, file_size, uploaded_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT (member_id) DO UPDATE SET
                        photo_data = EXCLUDED.photo_data,
                        content_type = EXCLUDED.content_type,
                        file_size = EXCLUDED.file_size,
                        uploaded_at = CURRENT_TIMESTAMP
                ');
                
                $insertStmt->execute([$memberId, $photoData, $contentType, $fileSize]);
                
                // Clear photo from team_members table
                $updateStmt = $db->prepare('UPDATE team_members SET photo = NULL WHERE id = ?');
                $updateStmt->execute([$memberId]);
                
                $migratedCount++;
            } else {
                // Skip filename-based photos (legacy file system photos)
                $skippedCount++;
            }
        }
        
        $results[] = "Migration completed successfully";
        $results[] = "Migrated {$migratedCount} base64 photos to member_photos table";
        $results[] = "Skipped {$skippedCount} filename-based photos (legacy file system)";
        
        echo json_encode([
            'success' => true,
            'results' => $results,
            'migrated_count' => $migratedCount,
            'skipped_count' => $skippedCount
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Migration failed: ' . $e->getMessage()
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

function migratePhotos($db) {
    // Create photos directories if they don't exist
    $photosDir = __DIR__ . '/photos/members';
    if (!is_dir($photosDir)) {
        mkdir($photosDir, 0755, true);
    }

    // Get all members with base64 photos
    $stmt = $db->query("
        SELECT id, name, gender, photo 
        FROM team_members 
        WHERE photo IS NOT NULL 
        AND photo LIKE 'data:image/%'
    ");

    $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $totalMembers = count($members);
    $convertedCount = 0;
    $errorCount = 0;
    $errors = array();

    if ($totalMembers === 0) {
        echo json_encode(array(
            'success' => true,
            'message' => 'No base64 photos found. Migration already complete.',
            'converted' => 0,
            'errors' => 0,
            'total' => 0
        ));
        return;
    }

    $db->beginTransaction();

    try {
        foreach ($members as $member) {
            $base64Photo = $member['photo'];
            
            // Extract image data from base64
            if (!preg_match('/^data:image\/(\w+);base64,(.+)$/', $base64Photo, $matches)) {
                $errors[] = "Invalid base64 format for {$member['name']}";
                $errorCount++;
                continue;
            }
            
            $imageType = strtolower($matches[1]);
            $imageData = base64_decode($matches[2]);
            
            if ($imageData === false) {
                $errors[] = "Failed to decode base64 for {$member['name']}";
                $errorCount++;
                continue;
            }
            
            // Map image types to file extensions
            $extensions = array(
                'jpeg' => 'jpg',
                'jpg' => 'jpg', 
                'png' => 'png',
                'webp' => 'webp',
                'svg+xml' => 'svg'
            );
            
            $extension = isset($extensions[$imageType]) ? $extensions[$imageType] : 'jpg';
            $filename = $member['id'] . '.' . $extension;
            $filePath = $photosDir . '/' . $filename;
            
            // Save image file
            if (file_put_contents($filePath, $imageData) === false) {
                $errors[] = "Failed to save file for {$member['name']}";
                $errorCount++;
                continue;
            }
            
            // Update database record
            $updateStmt = $db->prepare("UPDATE team_members SET photo = ? WHERE id = ?");
            $updateStmt->execute(array($filename, $member['id']));
            
            $convertedCount++;
        }
        
        $db->commit();
        
        echo json_encode(array(
            'success' => true,
            'message' => 'Photo migration completed successfully!',
            'converted' => $convertedCount,
            'errors' => $errorCount,
            'total' => $totalMembers,
            'error_details' => $errors
        ));
        
    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(array(
            'success' => false,
            'error' => 'Migration failed: ' . $e->getMessage()
        ));
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

function cleanupPhotoPaths($db) {
    try {
        // Find all members with photo paths that need cleaning
        $stmt = $db->query("
            SELECT id, name, photo 
            FROM team_members 
            WHERE photo IS NOT NULL 
            AND (photo LIKE '/photos/members/%' OR photo LIKE '/api/photos%')
        ");
        
        $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $cleanedCount = 0;
        
        if (empty($members)) {
            echo json_encode([
                'success' => true,
                'message' => 'No photo paths need cleaning',
                'cleaned' => 0
            ]);
            return;
        }
        
        $db->beginTransaction();
        
        foreach ($members as $member) {
            $oldPath = $member['photo'];
            $newPath = $oldPath;
            
            // Clean nested API URLs
            $maxDepth = 5;
            for ($i = 0; $i < $maxDepth; $i++) {
                if (strpos($newPath, '/photos/members/') === 0) {
                    $newPath = basename($newPath);
                    break;
                } elseif (strpos($newPath, '/api/photos') === 0) {
                    $parsedUrl = parse_url($newPath);
                    if ($parsedUrl && isset($parsedUrl['query'])) {
                        parse_str($parsedUrl['query'], $query);
                        if (isset($query['filename'])) {
                            $newPath = $query['filename'];
                            continue; // Check if we need to clean further
                        }
                    }
                    break;
                } else {
                    break;
                }
            }
            
            if ($oldPath !== $newPath) {
                $stmt = $db->prepare("UPDATE team_members SET photo = ? WHERE id = ?");
                $stmt->execute([$newPath, $member['id']]);
                $cleanedCount++;
                error_log("Cleaned photo path for {$member['name']}: {$oldPath} -> {$newPath}");
            }
        }
        
        $db->commit();
        
        echo json_encode([
            'success' => true,
            'message' => 'Photo paths cleaned successfully',
            'cleaned' => $cleanedCount,
            'members' => array_map(function($m) use ($members) { 
                $oldPath = $m['photo'];
                $newPath = $oldPath;
                
                // Apply same cleaning logic for reporting
                $maxDepth = 5;
                for ($i = 0; $i < $maxDepth; $i++) {
                    if (strpos($newPath, '/photos/members/') === 0) {
                        $newPath = basename($newPath);
                        break;
                    } elseif (strpos($newPath, '/api/photos') === 0) {
                        $parsedUrl = parse_url($newPath);
                        if ($parsedUrl && isset($parsedUrl['query'])) {
                            parse_str($parsedUrl['query'], $query);
                            if (isset($query['filename'])) {
                                $newPath = $query['filename'];
                                continue;
                            }
                        }
                        break;
                    } else {
                        break;
                    }
                }
                
                return [
                    'name' => $m['name'],
                    'old_path' => $oldPath,
                    'new_path' => $newPath
                ];
            }, $members)
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode([
            'success' => false,
            'error' => 'Cleanup failed: ' . $e->getMessage()
        ]);
    }
}

function executeDatabaseMaintenance($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['query'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Query is required']);
        return;
    }
    
    $query = trim($input['query']);
    
    if (empty($query)) {
        http_response_code(400);
        echo json_encode(['error' => 'Query cannot be empty']);
        return;
    }
    
    // Basic security: only allow certain operations
    $query_upper = strtoupper($query);
    $allowed_operations = ['SELECT', 'UPDATE', 'DELETE', 'INSERT', 'CREATE INDEX', 'ALTER TABLE'];
    $is_allowed = false;
    
    foreach ($allowed_operations as $op) {
        if (strpos($query_upper, $op) === 0) {
            $is_allowed = true;
            break;
        }
    }
    
    if (!$is_allowed) {
        http_response_code(400);
        echo json_encode(['error' => 'Only SELECT, UPDATE, DELETE, INSERT, CREATE INDEX, and ALTER TABLE operations are allowed']);
        return;
    }
    
    // Prevent dangerous operations (but allow CREATE INDEX and ALTER TABLE specifically)
    $dangerous_keywords = ['DROP', 'TRUNCATE', 'GRANT', 'REVOKE'];
    
    // Special handling for CREATE - only allow CREATE INDEX
    if (strpos($query_upper, 'CREATE') !== false && strpos($query_upper, 'CREATE INDEX') !== 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Only CREATE INDEX is allowed, other CREATE operations are forbidden']);
        return;
    }
    
    // Special handling for ALTER - only allow ALTER TABLE
    if (strpos($query_upper, 'ALTER') !== false && strpos($query_upper, 'ALTER TABLE') !== 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Only ALTER TABLE is allowed, other ALTER operations are forbidden']);
        return;
    }
    
    foreach ($dangerous_keywords as $keyword) {
        if (strpos($query_upper, $keyword) !== false) {
            http_response_code(400);
            echo json_encode(['error' => "Operation contains forbidden keyword: $keyword"]);
            return;
        }
    }
    
    try {
        $db->beginTransaction();
        
        if (strpos($query_upper, 'SELECT') === 0) {
            // For SELECT queries, return the data
            $stmt = $db->prepare($query);
            $stmt->execute();
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $db->commit();
            echo json_encode([
                'success' => true,
                'data' => $data,
                'rowCount' => count($data)
            ]);
        } else {
            // For other queries (UPDATE, DELETE, INSERT), return affected rows
            $stmt = $db->prepare($query);
            $stmt->execute();
            $rowCount = $stmt->rowCount();
            
            $db->commit();
            echo json_encode([
                'success' => true,
                'rowCount' => $rowCount,
                'message' => "Query executed successfully. $rowCount row(s) affected."
            ]);
        }
        
    } catch (PDOException $e) {
        $db->rollBack();
        http_response_code(400);
        echo json_encode([
            'error' => 'Database error: ' . $e->getMessage()
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode([
            'error' => 'Server error: ' . $e->getMessage()
        ]);
    }
}

// Attendance-only update function for view.html (no admin auth required)
function updateAttendanceOnly($db) {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    
    error_log('=== ATTENDANCE UPDATE DEBUG ===');
    error_log('Raw input: ' . $rawInput);
    error_log('Parsed input: ' . json_encode($input));
    
    if (!$input || !isset($input['eventId']) || !isset($input['matchId']) || !isset($input['memberId']) || !isset($input['teamType'])) {
        error_log('Missing required parameters');
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
    
    error_log('Processing attendance: eventId=' . $eventId . ', matchId=' . $matchId . ', memberId=' . $memberId . ', teamType=' . $teamType . ', action=' . $action . ', bypassLock=' . ($bypassLock ? 'true' : 'false'));
    
    try {
        error_log('Starting match lookup...');
        // First check if check-in is locked for this match
        // Get match details to check lock status
        $stmt = $db->prepare('
            SELECT e.date as event_date, m.match_time 
            FROM events e 
            JOIN matches m ON e.id = m.event_id 
            WHERE e.id = ? AND m.id = ?
        ');
        $stmt->execute([$eventId, $matchId]);
        $matchInfo = $stmt->fetch(PDO::FETCH_ASSOC);
        
        error_log('Match info: ' . json_encode($matchInfo));
        
        if ($matchInfo) {
            // NEW: Try to use epoch timestamp first (more reliable)
            $stmt = $db->prepare('SELECT match_time_epoch FROM matches WHERE id = ?');
            $stmt->execute([$matchId]);
            $matchEpochResult = $stmt->fetch(PDO::FETCH_ASSOC);
            
            error_log('DEBUG: Match epoch result: ' . json_encode($matchEpochResult));
            
            $isLocked = false;
            if ($matchEpochResult && $matchEpochResult['match_time_epoch']) {
                // Use new epoch-based lock function (much more reliable!)
                error_log('DEBUG: Using EPOCH-based lock check with timestamp: ' . $matchEpochResult['match_time_epoch']);
                $isLocked = isCheckInLockedForMatchEpoch($matchEpochResult['match_time_epoch']);
                $lockMethod = 'epoch';
            } else {
                // Fallback to legacy string-based lock function
                error_log('DEBUG: Using LEGACY string-based lock check - bypassLock=' . ($bypassLock ? 'true' : 'false'));
                $isLocked = isCheckInLockedForMatch($matchInfo['event_date'], $matchInfo['match_time']);
                $lockMethod = 'legacy';
            }
            
            error_log('DEBUG: Lock result: ' . ($isLocked ? 'LOCKED' : 'UNLOCKED') . ' (method: ' . $lockMethod . ')');
            
            // Add debug info to response (will be visible in browser console)
            $debugInfo = [
                'match_date' => $matchInfo['event_date'],
                'match_time' => $matchInfo['match_time'],
                'match_time_epoch' => $matchEpochResult['match_time_epoch'] ?? null,
                'bypass_lock' => $bypassLock,
                'is_locked' => $isLocked,
                'lock_method' => $lockMethod,
                'current_time_pdt' => (new DateTime('now', new DateTimeZone('America/Los_Angeles')))->format('Y-m-d H:i:s T'),
                'debug_message' => $isLocked ? 'LOCK SHOULD BE ACTIVE' : 'LOCK NOT ACTIVE YET'
            ];
            error_log('DEBUG: Full debug info: ' . json_encode($debugInfo));
            
            if (!$bypassLock && $isLocked) {
                error_log('Check-in is locked for this match (no bypass)');
                http_response_code(423); // 423 Locked (more appropriate than 403)
                echo json_encode([
                    'error' => 'Check-in is locked for this match',
                    'message' => 'This match check-in was automatically locked 5 minutes after the scheduled start of the game (TEST MODE).',
                    'locked' => true,
                    'debug' => $debugInfo
                ]);
                return;
            } elseif ($bypassLock) {
                error_log('Check-in lock bypassed (admin privileges)');
            } else {
                error_log('Check-in is not locked - access allowed');
            }
        } else {
            error_log('Match not found in database');
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
            return;
        }
        
        error_log('Starting database transaction...');
        $db->beginTransaction();
        error_log('Transaction started successfully');
        
        // Check if attendee already exists
        error_log('Checking existing attendance...');
        $stmt = $db->prepare('
            SELECT id FROM match_attendees 
            WHERE match_id = ? AND member_id = ? AND team_type = ?
        ');
        $stmt->execute([$matchId, $memberId, $teamType]);
        $existingAttendee = $stmt->fetch();
        error_log('Existing attendee: ' . json_encode($existingAttendee));
        
        if ($action === 'toggle') {
            if ($existingAttendee) {
                // Remove attendance
                error_log('Removing attendance...');
                $stmt = $db->prepare('
                    DELETE FROM match_attendees 
                    WHERE match_id = ? AND member_id = ? AND team_type = ?
                ');
                $stmt->execute([$matchId, $memberId, $teamType]);
                $result = ['action' => 'removed', 'success' => true];
                error_log('Attendance removed successfully');
            } else {
                // Add attendance with epoch timestamp
                error_log('Adding attendance...');
                $currentEpoch = time();
                $stmt = $db->prepare('
                    INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at, checked_in_at_epoch)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
                ');
                $stmt->execute([$matchId, $memberId, $teamType, $currentEpoch]);
                $result = ['action' => 'added', 'success' => true];
                error_log('Attendance added successfully with epoch: ' . $currentEpoch);
            }
        } elseif ($action === 'add' && !$existingAttendee) {
            // Add attendance with epoch timestamp
            $currentEpoch = time();
            $stmt = $db->prepare('
                INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at, checked_in_at_epoch)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
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
        
        error_log('Committing transaction...');
        $db->commit();
        
        // Add debug info to successful response
        $result['debug'] = $debugInfo ?? [
            'match_date' => $matchInfo['event_date'] ?? 'unknown',
            'match_time' => $matchInfo['match_time'] ?? 'unknown',
            'bypass_lock' => $bypassLock,
            'is_locked' => false,
            'current_time_pdt' => (new DateTime('now', new DateTimeZone('America/Los_Angeles')))->format('Y-m-d H:i:s T')
        ];
        
        error_log('Attendance update successful: ' . json_encode($result));
        echo json_encode($result);
        
    } catch (Exception $e) {
        error_log('Exception caught: ' . $e->getMessage());
        error_log('Exception file: ' . $e->getFile() . ' line: ' . $e->getLine());
        
        // Only rollback if there's an active transaction
        if ($db->inTransaction()) {
            error_log('Rolling back transaction...');
            $db->rollBack();
            error_log('Transaction rolled back');
        } else {
            error_log('No active transaction to rollback');
        }
        
        error_log('Attendance update failed: ' . $e->getMessage());
        error_log('Stack trace: ' . $e->getTraceAsString());
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
                SELECT card_type, reason, notes, incident_date, 
                       suspension_matches, suspension_served, suspension_served_date, created_at
                FROM player_disciplinary_records 
                WHERE member_id = ?
                ORDER BY incident_date DESC, created_at DESC
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
        $homeScore = $input['homeScore'] ?? null;
        $awayScore = $input['awayScore'] ?? null;
        $matchStatus = $input['matchStatus'] ?? 'scheduled';
        $matchNotes = $input['matchNotes'] ?? '';
        $cards = $input['cards'] ?? [];
        
        if (!$eventId || !$matchId) {
            http_response_code(400);
            echo json_encode(['error' => 'Event ID and Match ID are required']);
            return;
        }
        
        $db->beginTransaction();
        
        // Get current events data
        $stmt = $db->prepare('SELECT events_data FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$result) {
            $db->rollback();
            http_response_code(404);
            echo json_encode(['error' => 'Event not found']);
            return;
        }
        
        $eventsData = json_decode($result['events_data'], true);
        
        // Find and update the specific match
        $matchFound = false;
        foreach ($eventsData as &$event) {
            if ($event['id'] === $eventId) {
                foreach ($event['matches'] as &$match) {
                    if ($match['id'] === $matchId) {
                        $match['homeScore'] = $homeScore !== '' ? (int)$homeScore : null;
                        $match['awayScore'] = $awayScore !== '' ? (int)$awayScore : null;
                        $match['matchStatus'] = $matchStatus;
                        $match['matchNotes'] = $matchNotes;
                        $match['cards'] = $cards;
                        $matchFound = true;
                        break;
                    }
                }
                break;
            }
        }
        
        if (!$matchFound) {
            $db->rollback();
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
            return;
        }
        
        // Update the database
        $stmt = $db->prepare('UPDATE events SET events_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $result = $stmt->execute([json_encode($eventsData), $eventId]);
        
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
        
        $eventId = $input['eventId'] ?? null;
        $matchId = $input['matchId'] ?? null;
        $cards = $input['cards'] ?? [];
        
        if (!$eventId || !$matchId || empty($cards)) {
            http_response_code(400);
            echo json_encode(['error' => 'Event ID, Match ID, and cards data are required']);
            return;
        }
        
        $db->beginTransaction();
        
        // Get current events data
        $stmt = $db->prepare('SELECT events_data FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$result) {
            $db->rollback();
            http_response_code(404);
            echo json_encode(['error' => 'Event not found']);
            return;
        }
        
        $eventsData = json_decode($result['events_data'], true);
        
        // Find and update the specific match cards
        $matchFound = false;
        foreach ($eventsData as &$event) {
            if ($event['id'] === $eventId) {
                foreach ($event['matches'] as &$match) {
                    if ($match['id'] === $matchId) {
                        // Append new cards to existing ones
                        if (!isset($match['cards'])) {
                            $match['cards'] = [];
                        }
                        $match['cards'] = array_merge($match['cards'], $cards);
                        $matchFound = true;
                        break;
                    }
                }
                break;
            }
        }
        
        if (!$matchFound) {
            $db->rollback();
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
            return;
        }
        
        // Update the database
        $stmt = $db->prepare('UPDATE events SET events_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $result = $stmt->execute([json_encode($eventsData), $eventId]);
        
        if ($result) {
            $db->commit();
            echo json_encode(['success' => true, 'message' => 'Cards added successfully']);
        } else {
            $db->rollback();
            http_response_code(500);
            echo json_encode(['error' => 'Failed to add cards']);
        }
        
    } catch (Exception $e) {
        $db->rollback();
        http_response_code(500);
        echo json_encode(['error' => 'Failed to add cards: ' . $e->getMessage()]);
    }
}

// List files in Railway volume
function listVolumeFiles($db) {
    try {
        $volumeDir = '/app/storage/photos';
        
        if (!is_dir($volumeDir)) {
            echo json_encode([
                'success' => false,
                'error' => 'Volume directory does not exist',
                'path' => $volumeDir
            ]);
            return;
        }
        
        $files = [];
        $iterator = new DirectoryIterator($volumeDir);
        
        foreach ($iterator as $fileInfo) {
            if ($fileInfo->isFile()) {
                $files[] = [
                    'name' => $fileInfo->getFilename(),
                    'size' => $fileInfo->getSize(),
                    'modified' => date('Y-m-d H:i:s', $fileInfo->getMTime()),
                    'path' => $fileInfo->getPathname()
                ];
            }
        }
        
        // Sort by modification time (newest first)
        usort($files, function($a, $b) {
            return strtotime($b['modified']) - strtotime($a['modified']);
        });
        
        echo json_encode([
            'success' => true,
            'files' => $files,
            'count' => count($files),
            'volume_path' => $volumeDir
        ]);
        
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'error' => 'Failed to list volume files: ' . $e->getMessage()
        ]);
    }
}

// Test Railway volume access
function testVolumeAccess($db) {
    try {
        $volumeDir = '/app/storage/photos';
        $testFile = $volumeDir . '/test_' . time() . '.txt';
        
        $results = [];
        
        // Test 1: Check if volume directory exists
        $results['directory_exists'] = is_dir($volumeDir);
        
        // Test 2: Check if volume is writable
        $results['directory_writable'] = is_writable($volumeDir);
        
        // Test 3: Try to create directory if it doesn't exist
        if (!$results['directory_exists']) {
            $results['create_directory'] = mkdir($volumeDir, 0755, true);
        }
        
        // Test 4: Try to write a test file
        $testContent = 'Railway volume test - ' . date('Y-m-d H:i:s');
        $results['write_test'] = file_put_contents($testFile, $testContent) !== false;
        
        // Test 5: Try to read the test file
        if ($results['write_test']) {
            $readContent = file_get_contents($testFile);
            $results['read_test'] = ($readContent === $testContent);
            
            // Clean up test file
            $results['cleanup_test'] = unlink($testFile);
        }
        
        // Test 6: Check disk space
        $results['disk_free'] = disk_free_space($volumeDir);
        $results['disk_total'] = disk_total_space($volumeDir);
        
        $allTestsPassed = $results['directory_exists'] && 
                          $results['directory_writable'] && 
                          $results['write_test'] && 
                          $results['read_test'] && 
                          $results['cleanup_test'];
        
        echo json_encode([
            'success' => $allTestsPassed,
            'message' => $allTestsPassed ? 
                'Railway volume is working correctly!' : 
                'Some volume tests failed - check details',
            'details' => $results,
            'volume_path' => $volumeDir
        ]);
        
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'message' => 'Volume test failed: ' . $e->getMessage(),
            'volume_path' => $volumeDir ?? 'unknown'
        ]);
    }
}

// Supplementary migration for remaining created_at fields
function migrateRemainingEpochTimestamps($db) {
    try {
        error_log("=== STARTING SUPPLEMENTARY EPOCH MIGRATION ===");
        $results = [];
        $errors = [];
        
        // Phase 1: Add missing epoch columns
        $results[] = "Phase 1: Adding missing epoch columns...";
        
        $schemaUpdates = [
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER",
            "ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER",
            "ALTER TABLE match_cards ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER", 
            "ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER"
        ];
        
        foreach ($schemaUpdates as $sql) {
            try {
                $db->exec($sql);
                $results[] = "✅ " . $sql;
            } catch (Exception $e) {
                $error = "❌ Failed: $sql - " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        
        // Phase 2: Migrate remaining created_at timestamps
        $results[] = "\nPhase 2: Converting remaining created_at timestamps to epochs...";
        
        // Convert events created_at timestamps
        $stmt = $db->query("SELECT id, created_at FROM events WHERE created_at IS NOT NULL AND created_at_epoch IS NULL");
        $eventCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $epoch = strtotime($row['created_at'] . ' America/Los_Angeles');
                if ($epoch !== false) {
                    $updateStmt = $db->prepare("UPDATE events SET created_at_epoch = ? WHERE id = ?");
                    $updateStmt->execute([$epoch, $row['id']]);
                    $eventCount++;
                    error_log("Converted event created_at: {$row['id']} -> {$row['created_at']} -> $epoch (" . date('Y-m-d H:i:s T', $epoch) . ")");
                }
            } catch (Exception $e) {
                $error = "Failed to convert event {$row['id']}: " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        $results[] = "✅ Converted $eventCount events created_at timestamps";
        
        // Convert matches created_at timestamps
        $stmt = $db->query("SELECT id, created_at FROM matches WHERE created_at IS NOT NULL AND created_at_epoch IS NULL");
        $matchCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $epoch = strtotime($row['created_at'] . ' America/Los_Angeles');
                if ($epoch !== false) {
                    $updateStmt = $db->prepare("UPDATE matches SET created_at_epoch = ? WHERE id = ?");
                    $updateStmt->execute([$epoch, $row['id']]);
                    $matchCount++;
                    error_log("Converted match created_at: {$row['id']} -> {$row['created_at']} -> $epoch (" . date('Y-m-d H:i:s T', $epoch) . ")");
                }
            } catch (Exception $e) {
                $error = "Failed to convert match {$row['id']}: " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        $results[] = "✅ Converted $matchCount matches created_at timestamps";
        
        // Convert match_cards created_at timestamps
        $stmt = $db->query("SELECT id, created_at FROM match_cards WHERE created_at IS NOT NULL AND created_at_epoch IS NULL");
        $cardCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $epoch = strtotime($row['created_at'] . ' America/Los_Angeles');
                if ($epoch !== false) {
                    $updateStmt = $db->prepare("UPDATE match_cards SET created_at_epoch = ? WHERE id = ?");
                    $updateStmt->execute([$epoch, $row['id']]);
                    $cardCount++;
                }
            } catch (Exception $e) {
                $error = "Failed to convert match_card {$row['id']}: " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        $results[] = "✅ Converted $cardCount match_cards created_at timestamps";
        
        // Convert player_disciplinary_records created_at timestamps
        $stmt = $db->query("SELECT id, created_at FROM player_disciplinary_records WHERE created_at IS NOT NULL AND created_at_epoch IS NULL");
        $recordCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $epoch = strtotime($row['created_at'] . ' America/Los_Angeles');
                if ($epoch !== false) {
                    $updateStmt = $db->prepare("UPDATE player_disciplinary_records SET created_at_epoch = ? WHERE id = ?");
                    $updateStmt->execute([$epoch, $row['id']]);
                    $recordCount++;
                }
            } catch (Exception $e) {
                $error = "Failed to convert disciplinary record {$row['id']}: " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        $results[] = "✅ Converted $recordCount disciplinary records created_at timestamps";
        
        $results[] = "\n=== SUPPLEMENTARY MIGRATION COMPLETED ===";
        
        if (!empty($errors)) {
            $results[] = "\n⚠️ ERRORS ENCOUNTERED:";
            $results = array_merge($results, $errors);
        }
        
        error_log("=== SUPPLEMENTARY EPOCH MIGRATION COMPLETED ===");
        
        echo json_encode([
            'success' => true,
            'message' => 'Supplementary epoch timestamp migration completed',
            'results' => $results,
            'error_count' => count($errors),
            'timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        error_log('SUPPLEMENTARY EPOCH MIGRATION FAILED: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Supplementary migration failed: ' . $e->getMessage(),
            'results' => $results ?? [],
            'timestamp' => date('c')
        ]);
    }
}

// Epoch timestamp migration function
function migrateToEpochTimestamps($db) {
    try {
        error_log("=== STARTING EPOCH MIGRATION ===");
        $results = [];
        $errors = [];
        
        // Phase 1: Add epoch columns to all tables
        $results[] = "Phase 1: Adding epoch columns...";
        
        $schemaUpdates = [
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS date_epoch INTEGER",
            "ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_time_epoch INTEGER", 
            "ALTER TABLE general_attendees ADD COLUMN IF NOT EXISTS checked_in_at_epoch INTEGER",
            "ALTER TABLE match_attendees ADD COLUMN IF NOT EXISTS checked_in_at_epoch INTEGER",
            "ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS incident_date_epoch INTEGER",
            "ALTER TABLE player_disciplinary_records ADD COLUMN IF NOT EXISTS suspension_served_date_epoch INTEGER",
            "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER",
            "ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER",
            "ALTER TABLE referees ADD COLUMN IF NOT EXISTS created_at_epoch INTEGER", 
            "ALTER TABLE member_photos ADD COLUMN IF NOT EXISTS uploaded_at_epoch INTEGER"
        ];
        
        foreach ($schemaUpdates as $sql) {
            try {
                $db->exec($sql);
                $results[] = "✅ " . $sql;
            } catch (Exception $e) {
                $error = "❌ Failed: $sql - " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        
        // Phase 2: Migrate existing data
        $results[] = "\nPhase 2: Converting existing data to epochs...";
        
        // Convert events (date field)
        $stmt = $db->query("SELECT id, date FROM events WHERE date IS NOT NULL AND date_epoch IS NULL");
        $eventCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                // Parse date assuming it's in Pacific timezone at midnight
                $dateStr = $row['date'];
                // Handle both "YYYY-MM-DD" and "YYYY-MM-DD HH:MM:SS" formats
                $cleanDate = date('Y-m-d', strtotime($dateStr));
                $epoch = strtotime($cleanDate . ' 00:00:00 America/Los_Angeles');
                
                if ($epoch === false) {
                    throw new Exception("Failed to parse date: $dateStr");
                }
                
                $updateStmt = $db->prepare("UPDATE events SET date_epoch = ? WHERE id = ?");
                $updateStmt->execute([$epoch, $row['id']]);
                $eventCount++;
                
                error_log("Converted event date: {$row['id']} -> $dateStr -> $epoch (" . date('Y-m-d H:i:s T', $epoch) . ")");
            } catch (Exception $e) {
                $error = "Failed to convert event {$row['id']}: " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        $results[] = "✅ Converted $eventCount events";
        
        // Convert matches (combine event date + match time)
        $stmt = $db->query("
            SELECT m.id, e.date as event_date, m.match_time 
            FROM matches m 
            JOIN events e ON m.event_id = e.id 
            WHERE m.match_time IS NOT NULL AND m.match_time_epoch IS NULL
        ");
        $matchCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                // Combine event date with match time
                $eventDate = $row['event_date'];
                $matchTime = $row['match_time'];
                
                // Clean the date part and combine with time
                $cleanDate = date('Y-m-d', strtotime($eventDate));
                $dateTimeStr = $cleanDate . ' ' . $matchTime . ' America/Los_Angeles';
                $epoch = strtotime($dateTimeStr);
                
                if ($epoch === false) {
                    throw new Exception("Failed to parse datetime: $dateTimeStr");
                }
                
                $updateStmt = $db->prepare("UPDATE matches SET match_time_epoch = ? WHERE id = ?");
                $updateStmt->execute([$epoch, $row['id']]);
                $matchCount++;
                
                error_log("Converted match time: {$row['id']} -> $dateTimeStr -> $epoch (" . date('Y-m-d H:i:s T', $epoch) . ")");
            } catch (Exception $e) {
                $error = "Failed to convert match {$row['id']}: " . $e->getMessage();
                $errors[] = $error;
                error_log($error);
            }
        }
        $results[] = "✅ Converted $matchCount matches";
        
        // Convert general attendees check-in times
        $stmt = $db->query("SELECT id, checked_in_at FROM general_attendees WHERE checked_in_at IS NOT NULL AND checked_in_at_epoch IS NULL");
        $attendeeCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $epoch = strtotime($row['checked_in_at'] . ' America/Los_Angeles');
                if ($epoch === false) {
                    throw new Exception("Failed to parse timestamp: {$row['checked_in_at']}");
                }
                
                $updateStmt = $db->prepare("UPDATE general_attendees SET checked_in_at_epoch = ? WHERE id = ?");
                $updateStmt->execute([$epoch, $row['id']]);
                $attendeeCount++;
            } catch (Exception $e) {
                $errors[] = "Failed to convert general attendee {$row['id']}: " . $e->getMessage();
            }
        }
        $results[] = "✅ Converted $attendeeCount general attendee timestamps";
        
        // Convert match attendees check-in times  
        $stmt = $db->query("SELECT id, checked_in_at FROM match_attendees WHERE checked_in_at IS NOT NULL AND checked_in_at_epoch IS NULL");
        $matchAttendeeCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $epoch = strtotime($row['checked_in_at'] . ' America/Los_Angeles');
                if ($epoch === false) {
                    throw new Exception("Failed to parse timestamp: {$row['checked_in_at']}");
                }
                
                $updateStmt = $db->prepare("UPDATE match_attendees SET checked_in_at_epoch = ? WHERE id = ?");
                $updateStmt->execute([$epoch, $row['id']]);
                $matchAttendeeCount++;
            } catch (Exception $e) {
                $errors[] = "Failed to convert match attendee {$row['id']}: " . $e->getMessage();
            }
        }
        $results[] = "✅ Converted $matchAttendeeCount match attendee timestamps";
        
        // Convert disciplinary records
        $stmt = $db->query("SELECT id, incident_date, suspension_served_date FROM player_disciplinary_records WHERE (incident_date IS NOT NULL AND incident_date_epoch IS NULL) OR (suspension_served_date IS NOT NULL AND suspension_served_date_epoch IS NULL)");
        $disciplinaryCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $updates = [];
                $params = [];
                
                if ($row['incident_date'] && !$row['incident_date_epoch']) {
                    $epoch = strtotime($row['incident_date'] . ' 00:00:00 America/Los_Angeles');
                    if ($epoch !== false) {
                        $updates[] = "incident_date_epoch = ?";
                        $params[] = $epoch;
                    }
                }
                
                if ($row['suspension_served_date'] && !$row['suspension_served_date_epoch']) {
                    $epoch = strtotime($row['suspension_served_date'] . ' 00:00:00 America/Los_Angeles');
                    if ($epoch !== false) {
                        $updates[] = "suspension_served_date_epoch = ?";
                        $params[] = $epoch;
                    }
                }
                
                if (!empty($updates)) {
                    $params[] = $row['id'];
                    $sql = "UPDATE player_disciplinary_records SET " . implode(', ', $updates) . " WHERE id = ?";
                    $updateStmt = $db->prepare($sql);
                    $updateStmt->execute($params);
                    $disciplinaryCount++;
                }
            } catch (Exception $e) {
                $errors[] = "Failed to convert disciplinary record {$row['id']}: " . $e->getMessage();
            }
        }
        $results[] = "✅ Converted $disciplinaryCount disciplinary records";
        
        // Convert created_at timestamps for various tables
        $createdAtTables = ['team_members', 'teams', 'referees'];
        foreach ($createdAtTables as $table) {
            $stmt = $db->query("SELECT id, created_at FROM $table WHERE created_at IS NOT NULL AND created_at_epoch IS NULL");
            $count = 0;
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                try {
                    $epoch = strtotime($row['created_at'] . ' America/Los_Angeles');
                    if ($epoch !== false) {
                        $updateStmt = $db->prepare("UPDATE $table SET created_at_epoch = ? WHERE id = ?");
                        $updateStmt->execute([$epoch, $row['id']]);
                        $count++;
                    }
                } catch (Exception $e) {
                    $errors[] = "Failed to convert $table {$row['id']}: " . $e->getMessage();
                }
            }
            $results[] = "✅ Converted $count $table created_at timestamps";
        }
        
        // Convert member_photos uploaded_at
        $stmt = $db->query("SELECT member_id, uploaded_at FROM member_photos WHERE uploaded_at IS NOT NULL AND uploaded_at_epoch IS NULL");
        $photoCount = 0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            try {
                $epoch = strtotime($row['uploaded_at'] . ' America/Los_Angeles');
                if ($epoch !== false) {
                    $updateStmt = $db->prepare("UPDATE member_photos SET uploaded_at_epoch = ? WHERE member_id = ?");
                    $updateStmt->execute([$epoch, $row['member_id']]);
                    $photoCount++;
                }
            } catch (Exception $e) {
                $errors[] = "Failed to convert photo {$row['member_id']}: " . $e->getMessage();
            }
        }
        $results[] = "✅ Converted $photoCount photo uploaded_at timestamps";
        
        $results[] = "\n=== MIGRATION COMPLETED ===";
        
        if (!empty($errors)) {
            $results[] = "\n⚠️ ERRORS ENCOUNTERED:";
            $results = array_merge($results, $errors);
        }
        
        error_log("=== EPOCH MIGRATION COMPLETED ===");
        
        echo json_encode([
            'success' => true,
            'message' => 'Epoch timestamp migration completed',
            'results' => $results,
            'error_count' => count($errors),
            'timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        error_log('EPOCH MIGRATION FAILED: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Migration failed: ' . $e->getMessage(),
            'results' => $results ?? [],
            'timestamp' => date('c')
        ]);
    }
}

// Helper function to check if check-in is locked for a match (LEGACY - uses string dates)
function isCheckInLockedForMatch($eventDate, $matchTime) {
    if (!$matchTime || !$eventDate) {
        return false; // Don't lock if we don't have time info
    }
    
    try {
        // Set timezone to Pacific Time (PDT/PST) since all times in the app are Pacific
        $pacificTimezone = new DateTimeZone('America/Los_Angeles');
        
        // Parse game start time in Pacific timezone
        // Extract just the date part in case eventDate includes timestamp
        $dateOnly = date('Y-m-d', strtotime($eventDate));
        $gameStart = new DateTime($dateOnly . 'T' . $matchTime, $pacificTimezone);
        
        // Convert to epoch and use the new epoch-based function
        return isCheckInLockedForMatchEpoch($gameStart->getTimestamp());
        
    } catch (Exception $e) {
        error_log('Error calculating lock time (legacy): ' . $e->getMessage());
        return false; // Don't lock on error
    }
}

// NEW: Epoch-based lock function (much simpler and more reliable!)
function isCheckInLockedForMatchEpoch($gameStartEpoch) {
    if (!$gameStartEpoch) {
        error_log("Lock check: No game start epoch provided");
        return false; // Don't lock if we don't have time info
    }
    
    try {
        // Simple epoch arithmetic!
        $lockTimeEpoch = $gameStartEpoch + (5 * 60); // TEST: Lock 5 minutes after game start
        // Production: $lockTimeEpoch = $gameStartEpoch + (2 * 60 * 60 + 40 * 60); // 2h 40m after game start
        
        $currentEpoch = time();
        $isLocked = $currentEpoch > $lockTimeEpoch;
        
        // Convert back to readable times for logging (Pacific timezone)
        $gameStartReadable = date('Y-m-d H:i:s T', $gameStartEpoch);
        $lockTimeReadable = date('Y-m-d H:i:s T', $lockTimeEpoch);
        $currentTimeReadable = date('Y-m-d H:i:s T', $currentEpoch);
        
        error_log("EPOCH Lock check: Game start: $gameStartReadable, Lock time: $lockTimeReadable, Current: $currentTimeReadable, Locked: " . ($isLocked ? 'YES' : 'NO'));
        
        // Add more detailed logging
        if ($isLocked) {
            $minutesPastLock = ($currentEpoch - $lockTimeEpoch) / 60;
            error_log("ATTENDANCE LOCK: Check-in is LOCKED - current time is " . round($minutesPastLock) . " minutes past lock time");
        } else {
            $minutesUntilLock = ($lockTimeEpoch - $currentEpoch) / 60;
            error_log("ATTENDANCE LOCK: Check-in is ALLOWED - lock will activate in " . round($minutesUntilLock) . " minutes");
        }
        
        return $isLocked;
    } catch (Exception $e) {
        error_log('Error calculating epoch lock time: ' . $e->getMessage());
        return false; // Don't lock on error
    }
}
?>
