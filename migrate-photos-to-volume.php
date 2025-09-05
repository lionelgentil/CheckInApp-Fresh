<?php
/**
 * Photo Migration Script - Database to Railway Volume
 * Extracts base64 photos from team_members table and saves them to /app/storage/photos
 */

// Start session for authentication
session_start();

// Authentication check - same as main API
const ADMIN_PASSWORD = 'checkin2024'; // Change this to match your API password

function authenticate($password) {
    return $password === ADMIN_PASSWORD;
}

// Handle authentication
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'authenticate') {
    $password = $_POST['password'] ?? '';
    if (authenticate($password)) {
        $_SESSION['migration_authenticated'] = true;
        echo json_encode(['success' => true]);
        exit();
    } else {
        echo json_encode(['success' => false, 'error' => 'Invalid password']);
        exit();
    }
}

// Check if authenticated
$isAuthenticated = isset($_SESSION['migration_authenticated']) && $_SESSION['migration_authenticated'] === true;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'migrate' && $isAuthenticated) {
    migratePhotosToVolume();
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'analyze' && $isAuthenticated) {
    analyzePhotos();
    exit();
}

function getDatabaseConnection() {
    // Same database connection logic as main API
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
    
    if (!$databaseUrl) {
        throw new Exception('No PostgreSQL database URL found');
    }
    
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
    
    return $db;
}

function analyzePhotos() {
    try {
        $db = getDatabaseConnection();
        
        // Get all members with photo data
        $stmt = $db->query("
            SELECT 
                id, 
                name, 
                gender,
                LENGTH(photo) as photo_length,
                CASE 
                    WHEN photo IS NULL THEN 'NO_PHOTO'
                    WHEN photo = '' THEN 'EMPTY_STRING'
                    WHEN photo = 'has_photo' THEN 'HAS_PHOTO_FLAG'
                    WHEN photo LIKE 'data:image/%' THEN 'BASE64_DATA'
                    WHEN photo LIKE '%.jpg' OR photo LIKE '%.png' OR photo LIKE '%.svg' OR photo LIKE '%.webp' THEN 'FILENAME'
                    WHEN photo LIKE '/api/photos%' THEN 'API_URL'
                    WHEN photo LIKE '/photos/members%' THEN 'FULL_PATH'
                    ELSE 'OTHER'
                END as photo_type
            FROM team_members 
            ORDER BY photo_type, name
        ");
        
        $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Group by photo type
        $analysis = [];
        foreach ($members as $member) {
            $type = $member['photo_type'];
            if (!isset($analysis[$type])) {
                $analysis[$type] = ['count' => 0, 'samples' => []];
            }
            $analysis[$type]['count']++;
            
            // Keep first 3 samples for each type
            if (count($analysis[$type]['samples']) < 3) {
                $analysis[$type]['samples'][] = [
                    'name' => $member['name'],
                    'photo' => substr($member['photo'] ?? '', 0, 100) . (strlen($member['photo'] ?? '') > 100 ? '...' : ''),
                    'photo_length' => $member['photo_length']
                ];
            }
        }
        
        echo json_encode([
            'success' => true,
            'total_members' => count($members),
            'analysis' => $analysis,
            'timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

function migratePhotosToVolume() {
    try {
        $db = getDatabaseConnection();
        
        // Use same volume detection logic as main API
        $volumeDir = '/app/storage/photos';
        $fallbackDir = '/tmp/photos';
        
        $photosDir = $volumeDir;
        $volumeStatus = 'unknown';
        $hasBase64Photos = false;
        
        // First, check if we have any base64 photos that need file storage
        foreach ($members as $member) {
            if (strpos($member['photo'] ?? '', 'data:image/') === 0) {
                $hasBase64Photos = true;
                break;
            }
        }
        
        // Check if Railway volume exists and is accessible
        if (!is_dir($volumeDir)) {
            error_log("migratePhotos: Railway volume directory not found: " . $volumeDir);
            $volumeStatus = 'directory_not_found';
            
            // CRITICAL: If we have base64 photos but no volume, FAIL rather than use /tmp
            if ($hasBase64Photos) {
                throw new Exception("Railway volume not found at {$volumeDir} but base64 photos need permanent storage. Cannot use ephemeral /tmp storage.");
            }
            
            $photosDir = $fallbackDir;
        } else {
            // Test write access without trying to change permissions
            $testFile = $volumeDir . '/migration_test_' . time();
            $canWrite = @file_put_contents($testFile, 'test');
            
            if ($canWrite === false) {
                error_log("migratePhotos: Railway volume not writable, checking if we have base64 photos...");
                error_log("migratePhotos: Volume owner: " . (posix_getpwuid(fileowner($volumeDir))['name'] ?? 'unknown'));
                error_log("migratePhotos: Volume permissions: " . substr(sprintf('%o', fileperms($volumeDir)), -4));
                $volumeStatus = 'not_writable';
                
                // CRITICAL: If we have base64 photos but volume isn't writable, FAIL rather than use /tmp
                if ($hasBase64Photos) {
                    throw new Exception("Railway volume at {$volumeDir} is not writable but base64 photos need permanent storage. Cannot use ephemeral /tmp storage. Check volume permissions.");
                }
                
                $photosDir = $fallbackDir;
            } else {
                // Clean up test file
                @unlink($testFile);
                error_log("migratePhotos: Railway volume is writable");
                $volumeStatus = 'writable';
            }
        }
        
        // Ensure fallback directory exists if we're using it
        if ($photosDir === $fallbackDir && !is_dir($photosDir)) {
            mkdir($photosDir, 0777, true);
        }
        
        $results = [
            'storage_location' => $photosDir,
            'volume_status' => $volumeStatus,
            'volume_directory_exists' => is_dir($volumeDir),
            'volume_writable' => $volumeStatus === 'writable',
            'base64_migrated' => 0,
            'filenames_updated' => 0,
            'api_urls_cleaned' => 0,
            'errors' => 0,
            'skipped' => 0,
            'error_details' => [],
            'debug_info' => []
        ];
        
        // Get all members with photo data that needs migration or analysis
        $stmt = $db->query("
            SELECT id, name, photo, gender
            FROM team_members 
            WHERE photo IS NOT NULL 
            AND photo != ''
            ORDER BY name
        ");
        
        $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Track file operations for rollback safety
        $createdFiles = [];
        $databaseUpdates = [];
        
        foreach ($members as $member) {
            $memberId = $member['id'];
            $memberName = $member['name'];
            $photoData = $member['photo'];
            $originalPhotoData = $photoData; // Keep original for rollback
            
            $results['debug_info'][] = "Processing {$memberName}: " . substr($photoData, 0, 50) . "... (length: " . strlen($photoData) . ", type: " . gettype($photoData) . ")";
            
            try {
                if ($photoData === 'has_photo') {
                    // Skip 'has_photo' flag - this means photo is in member_photos table
                    $results['skipped']++;
                    $results['debug_info'][] = "  → Skipped (has_photo flag)";
                    
                } elseif (strpos($photoData, 'data:image/') === 0) {
                    // BASE64 DATA - Extract and save to file FIRST, then prepare DB update
                    $results['debug_info'][] = "  → Attempting to parse base64 data (length: " . strlen($photoData) . ")";
                    
                    // First check if it looks like a proper data URL
                    if (!preg_match('/^data:image\/[^;]+;base64,/', $photoData)) {
                        throw new Exception("Photo data starts with 'data:image/' but doesn't match expected data URL format. Start: " . substr($photoData, 0, 100));
                    }
                    
                    if (preg_match('/^data:image\/(\w+);base64,(.+)$/s', $photoData, $matches)) {
                        $imageType = strtolower($matches[1]);
                        $imageData = base64_decode($matches[2]);
                        
                        if ($imageData === false) {
                            throw new Exception("Failed to decode base64 data for image type: " . $imageType);
                        }
                        
                        $results['debug_info'][] = "  → Successfully decoded base64 data (" . strlen($imageData) . " bytes, type: " . $imageType . ")";
                        
                        // Map image types to file extensions
                        $extensions = [
                            'jpeg' => 'jpg',
                            'jpg' => 'jpg',
                            'png' => 'png',
                            'webp' => 'webp',
                            'svg+xml' => 'svg'
                        ];
                        
                        $extension = $extensions[$imageType] ?? 'jpg';
                        $timestamp = time() + count($createdFiles); // Ensure unique timestamps
                        $filename = $memberId . '_' . $timestamp . '.' . $extension;
                        $filePath = $photosDir . '/' . $filename;
                        
                        // SAFETY: Write file first
                        $bytesWritten = file_put_contents($filePath, $imageData);
                        if ($bytesWritten === false) {
                            throw new Exception("Failed to save file to " . $filePath);
                        }
                        
                        // SAFETY: Verify file was written correctly
                        if (!file_exists($filePath) || filesize($filePath) !== strlen($imageData)) {
                            throw new Exception("File verification failed for " . $filePath);
                        }
                        
                        // SAFETY: Track created file for potential rollback
                        $createdFiles[] = $filePath;
                        
                        // SAFETY: Prepare database update (don't execute yet)
                        $databaseUpdates[] = [
                            'member_id' => $memberId,
                            'member_name' => $memberName,
                            'new_photo' => $filename,
                            'original_photo' => $originalPhotoData,
                            'action' => 'base64_migrated'
                        ];
                        
                        $results['base64_migrated']++;
                        $results['debug_info'][] = "  → File saved, prepared DB update to {$filename}";
                        
                    } else {
                        // Show more details about why the regex failed
                        $photoStart = substr($photoData, 0, 100);
                        throw new Exception("Invalid base64 format - could not parse data URL. Start of data: " . $photoStart);
                    }
                    
                } elseif (strpos($photoData, '/api/photos') === 0) {
                    // API URL - Extract filename (no file operations, safer)
                    $parsedUrl = parse_url($photoData);
                    if ($parsedUrl && isset($parsedUrl['query'])) {
                        parse_str($parsedUrl['query'], $query);
                        if (isset($query['filename'])) {
                            $cleanFilename = $query['filename'];
                            
                            // SAFETY: Prepare database update (don't execute yet)
                            $databaseUpdates[] = [
                                'member_id' => $memberId,
                                'member_name' => $memberName,
                                'new_photo' => $cleanFilename,
                                'original_photo' => $originalPhotoData,
                                'action' => 'api_urls_cleaned'
                            ];
                            
                            $results['api_urls_cleaned']++;
                            $results['debug_info'][] = "  → Prepared DB update to clean API URL to {$cleanFilename}";
                        } else {
                            throw new Exception("Could not extract filename from API URL");
                        }
                    } else {
                        throw new Exception("Could not parse API URL");
                    }
                    
                } elseif (strpos($photoData, '/photos/members/') === 0) {
                    // FULL PATH - Extract filename (no file operations, safer)
                    $cleanFilename = basename($photoData);
                    
                    // SAFETY: Prepare database update (don't execute yet)
                    $databaseUpdates[] = [
                        'member_id' => $memberId,
                        'member_name' => $memberName,
                        'new_photo' => $cleanFilename,
                        'original_photo' => $originalPhotoData,
                        'action' => 'filenames_updated'
                    ];
                    
                    $results['filenames_updated']++;
                    $results['debug_info'][] = "  → Prepared DB update to clean path to {$cleanFilename}";
                    
                } elseif (preg_match('/^[a-zA-Z0-9\-_.]+\.(jpg|jpeg|png|webp|svg)$/i', $photoData)) {
                    // Already a clean filename - no action needed
                    $results['skipped']++;
                    $results['debug_info'][] = "  → Already clean filename: {$photoData}";
                    
                } else {
                    // Unknown format - log but don't fail
                    $results['skipped']++;
                    $results['debug_info'][] = "  → Unknown format, skipped: " . substr($photoData, 0, 100);
                }
                
            } catch (Exception $e) {
                $results['errors']++;
                $results['error_details'][] = "Error processing {$memberName}: " . $e->getMessage();
                $results['debug_info'][] = "  → ERROR: " . $e->getMessage();
                
                // SAFETY: If this was a base64 operation and we created a file, clean it up
                if (isset($filePath) && file_exists($filePath)) {
                    unlink($filePath);
                    $results['debug_info'][] = "  → Cleaned up failed file: " . basename($filePath);
                }
            }
        }
        
        // SAFETY: Now execute all database updates in a transaction
        $results['debug_info'][] = "\n🔒 Starting database transaction for " . count($databaseUpdates) . " updates...";
        
        $db->beginTransaction();
        
        try {
            foreach ($databaseUpdates as $update) {
                $updateStmt = $db->prepare("UPDATE team_members SET photo = ? WHERE id = ?");
                $updateStmt->execute([$update['new_photo'], $update['member_id']]);
                
                $results['debug_info'][] = "  ✅ DB updated: {$update['member_name']}";
            }
            
            $db->commit();
            $results['debug_info'][] = "🔒 Database transaction committed successfully";
            
        } catch (Exception $e) {
            $db->rollBack();
            $results['debug_info'][] = "🔒 Database transaction failed, rolling back...";
            
            // SAFETY: Clean up any files we created since DB update failed
            foreach ($createdFiles as $filePath) {
                if (file_exists($filePath)) {
                    unlink($filePath);
                    $results['debug_info'][] = "  🧹 Cleaned up file: " . basename($filePath);
                }
            }
            
            throw new Exception("Database transaction failed: " . $e->getMessage());
        }
        
        $results['success'] = true;
        $results['total_processed'] = count($members);
        $results['message'] = "Migration completed successfully";
        
        echo json_encode($results);
        
    } catch (Exception $e) {
        if (isset($db)) {
            $db->rollBack();
        }
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Photo Migration - Database to Railway Volume</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .section { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .section.authenticated { background: #e8f5e8; border-left: 4px solid #4caf50; }
        .section.warning { background: #fff3cd; border-left: 4px solid #ffc107; }
        .section.danger { background: #f8d7da; border-left: 4px solid #dc3545; }
        input[type="password"] { width: 200px; padding: 8px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #2196F3; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
        button:hover { background: #1976D2; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        button.danger { background: #dc3545; }
        button.danger:hover { background: #c82333; }
        button.warning { background: #ffc107; color: #212529; }
        button.warning:hover { background: #e0a800; }
        .success { color: green; }
        .error { color: red; }
        .warning { color: #856404; }
        .status { font-weight: bold; margin: 10px 0; }
        .results { margin-top: 20px; font-family: monospace; white-space: pre-wrap; background: #f8f9fa; padding: 15px; border-radius: 5px; }
        .analysis-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        .analysis-table th, .analysis-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .analysis-table th { background-color: #f2f2f2; }
        .photo-sample { font-size: 0.8em; color: #666; max-width: 300px; word-break: break-all; }
    </style>
</head>
<body>
    <h1>📸 Photo Migration Tool</h1>
    <p>Migrate photos from database storage to Railway volume storage (<code>/app/storage/photos</code>)</p>

    <?php if (!$isAuthenticated): ?>
    <!-- Authentication Section -->
    <div class="section">
        <h3>🔐 Authentication Required</h3>
        <input type="password" id="passwordInput" placeholder="Admin password" onkeypress="handlePasswordKeypress(event)">
        <button onclick="authenticate()">Login</button>
        <div id="authStatus" class="status"></div>
    </div>
    <?php else: ?>
    
    <!-- Authenticated Section -->
    <div class="section authenticated">
        <h3>✅ Authenticated</h3>
        <p>You can now analyze and migrate photos.</p>
    </div>

    <!-- Warning Section -->
    <div class="section warning">
        <h3>⚠️ Important Information</h3>
        <ul>
            <li><strong>Backup First:</strong> This operation modifies your database. Ensure you have a backup.</li>
            <li><strong>Base64 Photos:</strong> Will be extracted and saved as files in <code>/app/storage/photos</code></li>
            <li><strong>API URLs:</strong> Will be cleaned to store only the filename</li>
            <li><strong>File Paths:</strong> Will be cleaned to store only the filename</li>
            <li><strong>Existing Files:</strong> Already clean filenames will be left unchanged</li>
        </ul>
    </div>

    <!-- Analysis Section -->
    <div class="section">
        <h3>🔍 Step 1: Analyze Current Photos</h3>
        <p>First, let's analyze what types of photo data you currently have:</p>
        <button class="warning" onclick="analyzePhotos()">📊 Analyze Photo Data</button>
        <div id="analysisResults" class="results" style="display: none;"></div>
    </div>

    <!-- Migration Section -->
    <div class="section danger">
        <h3>🚀 Step 2: Run Migration</h3>
        <p><strong>This will modify your database!</strong> Make sure you've reviewed the analysis first.</p>
        <button class="danger" onclick="migratePhotos()" id="migrateBtn">🔄 Migrate Photos to Volume</button>
        <div id="migrationResults" class="results" style="display: none;"></div>
    </div>

    <?php endif; ?>

    <script>
        function handlePasswordKeypress(event) {
            if (event.key === 'Enter') {
                authenticate();
            }
        }

        async function authenticate() {
            const password = document.getElementById('passwordInput').value;
            if (!password) {
                alert('Please enter password');
                return;
            }

            try {
                const formData = new FormData();
                formData.append('action', 'authenticate');
                formData.append('password', password);

                const response = await fetch('', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                
                if (result.success) {
                    location.reload(); // Reload to show authenticated interface
                } else {
                    document.getElementById('authStatus').innerHTML = 
                        '<span class="error">❌ Invalid password</span>';
                }
            } catch (error) {
                document.getElementById('authStatus').innerHTML = 
                    '<span class="error">❌ Login failed: ' + error.message + '</span>';
            }
        }

        async function analyzePhotos() {
            const resultsDiv = document.getElementById('analysisResults');
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = 'Analyzing photo data...';

            try {
                const formData = new FormData();
                formData.append('action', 'analyze');

                const response = await fetch('', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                
                if (result.success) {
                    let html = `<strong>Analysis Results (${result.total_members} total members)</strong>\n\n`;
                    
                    html += '<table class="analysis-table">';
                    html += '<tr><th>Photo Type</th><th>Count</th><th>Description</th><th>Sample Data</th></tr>';
                    
                    const descriptions = {
                        'NO_PHOTO': 'Members without any photo data',
                        'EMPTY_STRING': 'Members with empty photo field',
                        'HAS_PHOTO_FLAG': 'Members with "has_photo" flag (should have data in member_photos table)',
                        'BASE64_DATA': '🔄 Base64 encoded photos (WILL BE MIGRATED)',
                        'FILENAME': '✅ Clean filenames (already correct)',
                        'API_URL': '🔧 API URLs (will be cleaned to filename only)',
                        'FULL_PATH': '🔧 Full file paths (will be cleaned to filename only)',
                        'OTHER': '❓ Unknown format (will be logged but not migrated)'
                    };
                    
                    Object.entries(result.analysis || {}).forEach(([type, data]) => {
                        html += '<tr>';
                        html += `<td><strong>${type}</strong></td>`;
                        html += `<td>${data.count}</td>`;
                        html += `<td>${descriptions[type] || 'Unknown'}</td>`;
                        html += '<td>';
                        
                        data.samples.forEach((sample, index) => {
                            if (index > 0) html += '<br><br>';
                            html += `<strong>${sample.name}</strong><br>`;
                            html += `<span class="photo-sample">${sample.photo || 'NULL'}</span><br>`;
                            html += `<small>Length: ${sample.photo_length || 0} chars</small>`;
                        });
                        
                        html += '</td>';
                        html += '</tr>';
                    });
                    
                    html += '</table>';
                    
                    resultsDiv.innerHTML = html;
                    
                    // Enable migration button if there's data to migrate
                    const hasDataToMigrate = result.analysis && (
                        result.analysis['BASE64_DATA'] || 
                        result.analysis['API_URL'] || 
                        result.analysis['FULL_PATH']
                    );
                    
                    if (hasDataToMigrate) {
                        document.getElementById('migrateBtn').style.display = 'inline-block';
                    }
                    
                } else {
                    resultsDiv.innerHTML = `<span class="error">❌ Analysis failed: ${result.error}</span>`;
                }
            } catch (error) {
                resultsDiv.innerHTML = `<span class="error">❌ Error: ${error.message}</span>`;
            }
        }

        async function migratePhotos() {
            if (!confirm('This will modify your database! Are you sure you want to proceed with the migration?')) {
                return;
            }

            const resultsDiv = document.getElementById('migrationResults');
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = 'Migrating photos to Railway volume...';

            try {
                const formData = new FormData();
                formData.append('action', 'migrate');

                const response = await fetch('', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                
                if (result.success) {
                    let output = `✅ Migration completed successfully!\n\n`;
                    output += `📍 Storage Location: ${result.storage_location}\n`;
                    output += `🔧 Volume Status: ${result.volume_status}\n`;
                    output += `📁 Volume Directory Exists: ${result.volume_directory_exists}\n`;
                    output += `✍️  Volume Writable: ${result.volume_writable}\n\n`;
                    output += `📊 Total Processed: ${result.total_processed}\n`;
                    output += `📸 Base64 Photos Migrated: ${result.base64_migrated}\n`;
                    output += `🔧 API URLs Cleaned: ${result.api_urls_cleaned}\n`;
                    output += `📁 Filenames Updated: ${result.filenames_updated}\n`;
                    output += `⏭️  Skipped: ${result.skipped}\n`;
                    output += `❌ Errors: ${result.errors}\n\n`;
                    
                    if (result.error_details && result.error_details.length > 0) {
                        output += `Error Details:\n`;
                        result.error_details.forEach(error => {
                            output += `  • ${error}\n`;
                        });
                        output += `\n`;
                    }
                    
                    if (result.debug_info && result.debug_info.length > 0) {
                        output += `Debug Info (first 20 entries):\n`;
                        result.debug_info.slice(0, 20).forEach(debug => {
                            output += `  ${debug}\n`;
                        });
                        if (result.debug_info.length > 20) {
                            output += `  ... and ${result.debug_info.length - 20} more entries\n`;
                        }
                    }
                    
                    resultsDiv.innerHTML = `<span class="success">${output}</span>`;
                } else {
                    resultsDiv.innerHTML = `<span class="error">❌ Migration failed: ${result.error}</span>`;
                }
            } catch (error) {
                resultsDiv.innerHTML = `<span class="error">❌ Error: ${error.message}</span>`;
            }
        }
    </script>
</body>
</html>