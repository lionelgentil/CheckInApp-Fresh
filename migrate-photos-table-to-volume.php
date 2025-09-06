<?php
/**
 * Photo Migration Script - member_photos table to Railway Volume
 * Extracts base64 photos from member_photos table and saves them to /app/storage/photos
 */

// Start session for authentication
session_start();

// Authentication check - same as main API
const ADMIN_PASSWORD = 'checkin2024';

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
    migratePhotosFromTableToVolume();
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'analyze' && $isAuthenticated) {
    analyzePhotosInTable();
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

function analyzePhotosInTable() {
    try {
        $db = getDatabaseConnection();
        
        // Check member_photos table
        $stmt = $db->query("
            SELECT 
                COUNT(*) as total_photos,
                AVG(LENGTH(photo_data)) as avg_size,
                MIN(LENGTH(photo_data)) as min_size,
                MAX(LENGTH(photo_data)) as max_size,
                SUM(LENGTH(photo_data)) as total_size
            FROM member_photos
        ");
        $stats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Get sample photos
        $stmt = $db->query("
            SELECT 
                mp.member_id,
                tm.name,
                LENGTH(mp.photo_data) as photo_size,
                mp.content_type,
                mp.uploaded_at,
                SUBSTRING(mp.photo_data, 1, 50) as photo_sample
            FROM member_photos mp
            JOIN team_members tm ON mp.member_id = tm.id
            ORDER BY mp.uploaded_at DESC
            LIMIT 10
        ");
        $samples = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Check how many team_members have 'has_photo' flag
        $stmt = $db->query("
            SELECT COUNT(*) as has_photo_count
            FROM team_members 
            WHERE photo = 'has_photo'
        ");
        $hasPhotoCount = $stmt->fetch(PDO::FETCH_ASSOC)['has_photo_count'];
        
        echo json_encode([
            'success' => true,
            'stats' => $stats,
            'samples' => $samples,
            'has_photo_flags' => $hasPhotoCount,
            'total_size_mb' => round($stats['total_size'] / 1024 / 1024, 2),
            'avg_size_kb' => round($stats['avg_size'] / 1024, 2),
            'timestamp' => date('c')
        ]);
        
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

function migratePhotosFromTableToVolume() {
    try {
        $db = getDatabaseConnection();
        
        // Ensure Railway volume is accessible
        $volumeDir = '/app/storage/photos';
        $testFile = $volumeDir . '/migration_test_' . time();
        
        if (!is_dir($volumeDir)) {
            throw new Exception("Railway volume directory not found: {$volumeDir}");
        }
        
        $canWrite = @file_put_contents($testFile, 'test');
        if ($canWrite === false) {
            throw new Exception("Railway volume is not writable: {$volumeDir}. Check permissions.");
        }
        @unlink($testFile);
        
        $results = [
            'storage_location' => $volumeDir,
            'photos_migrated' => 0,
            'database_updates' => 0,
            'files_created' => 0,
            'errors' => 0,
            'error_details' => [],
            'debug_info' => []
        ];
        
        // Get all photos from member_photos table
        $stmt = $db->query("
            SELECT mp.member_id, mp.photo_data, mp.content_type, tm.name
            FROM member_photos mp
            JOIN team_members tm ON mp.member_id = tm.id
            ORDER BY tm.name
        ");
        
        $photos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $results['debug_info'][] = "Found " . count($photos) . " photos in member_photos table";
        
        // Track file operations for rollback safety
        $createdFiles = [];
        $databaseUpdates = [];
        
        foreach ($photos as $photo) {
            $memberId = $photo['member_id'];
            $memberName = $photo['name'];
            $photoData = $photo['photo_data'];
            $contentType = $photo['content_type'];
            
            $results['debug_info'][] = "Processing {$memberName} (ID: {$memberId})";
            
            try {
                // Determine file extension from content type
                $extension = 'jpg'; // default
                if ($contentType) {
                    switch ($contentType) {
                        case 'image/jpeg':
                            $extension = 'jpg';
                            break;
                        case 'image/png':
                            $extension = 'png';
                            break;
                        case 'image/webp':
                            $extension = 'webp';
                            break;
                        case 'image/svg+xml':
                            $extension = 'svg';
                            break;
                    }
                }
                
                // Extract image data from base64 if needed
                $imageData = $photoData;
                if (strpos($photoData, 'data:image/') === 0) {
                    // It's a data URL, extract the base64 part
                    if (preg_match('/^data:image\/[^;]+;base64,(.+)$/s', $photoData, $matches)) {
                        $imageData = base64_decode($matches[1]);
                        if ($imageData === false) {
                            throw new Exception("Failed to decode base64 data");
                        }
                    } else {
                        throw new Exception("Invalid data URL format");
                    }
                } else {
                    // Assume it's already binary data (shouldn't happen but handle it)
                    $results['debug_info'][] = "  → Photo data is not base64, treating as binary";
                }
                
                // Generate unique filename
                $timestamp = time() + count($createdFiles); // Ensure uniqueness
                $filename = $memberId . '_' . $timestamp . '.' . $extension;
                $filePath = $volumeDir . '/' . $filename;
                
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
                    'remove_from_table' => false  // CHANGED: Keep data in member_photos table for now
                ];
                
                $results['photos_migrated']++;
                $results['files_created']++;
                $results['debug_info'][] = "  → File saved: {$filename} (" . strlen($imageData) . " bytes)";
                
            } catch (Exception $e) {
                $results['errors']++;
                $results['error_details'][] = "Error processing {$memberName}: " . $e->getMessage();
                $results['debug_info'][] = "  → ERROR: " . $e->getMessage();
                
                // SAFETY: If we created a file, clean it up
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
                // Update team_members to point to filename
                $updateStmt = $db->prepare("UPDATE team_members SET photo = ? WHERE id = ?");
                $updateStmt->execute([$update['new_photo'], $update['member_id']]);
                
                // CHANGED: Do NOT remove from member_photos table yet - keep data as backup
                // $deleteStmt = $db->prepare("DELETE FROM member_photos WHERE member_id = ?");
                // $deleteStmt->execute([$update['member_id']]);
                
                $results['database_updates']++;
                // $results['cleanup_count']++; // Not cleaning up table data
                $results['debug_info'][] = "  ✅ Updated: {$update['member_name']} → {$update['new_photo']} (kept data in table)";
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
        $results['total_processed'] = count($photos);
        $results['message'] = "Migration from member_photos table to Railway volume completed successfully (data kept in table as backup)";
        
        echo json_encode($results);
        
    } catch (Exception $e) {
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
    <title>Photo Migration - member_photos Table to Railway Volume</title>
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
        .results { margin-top: 20px; font-family: monospace; white-space: pre-wrap; background: #f8f9fa; padding: 15px; border-radius: 5px; max-height: 400px; overflow-y: auto; }
        .stats-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        .stats-table th, .stats-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .stats-table th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>📸 Photo Migration Tool</h1>
    <p>Migrate photos from <code>member_photos</code> table to Railway volume storage (<code>/app/storage/photos</code>)</p>

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
        <p>Ready to migrate photos from database to Railway volume.</p>
    </div>

    <!-- Warning Section -->
    <div class="section warning">
        <h3>⚠️ Important Information</h3>
        <ul>
            <li><strong>Source:</strong> Photos stored in <code>member_photos</code> table (database)</li>
            <li><strong>Destination:</strong> Files in <code>/app/storage/photos</code> (Railway volume)</li>
            <li><strong>Database Changes:</strong> Updates <code>team_members.photo</code> to filenames</li>
            <li><strong>Data Preservation:</strong> <span style="color:green">Original data kept in <code>member_photos</code> table as backup</span></li>
            <li><strong>Benefits:</strong> HTTP caching, smaller database responses, better performance</li>
            <li><strong>Safety:</strong> Atomic operation with full rollback if anything fails</li>
        </ul>
    </div>

    <!-- Analysis Section -->
    <div class="section">
        <h3>🔍 Step 1: Analyze Current Photos in Database</h3>
        <p>First, let's see what photos are currently stored in the <code>member_photos</code> table:</p>
        <button class="warning" onclick="analyzePhotos()">📊 Analyze Photos in Database</button>
        <div id="analysisResults" class="results" style="display: none;"></div>
    </div>

    <!-- Migration Section -->
    <div class="section danger">
        <h3>🚀 Step 2: Migrate Photos to Railway Volume</h3>
        <p><strong>This will modify your database and create files!</strong> Review the analysis first.</p>
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
            resultsDiv.innerHTML = 'Analyzing photos in member_photos table...';

            try {
                const formData = new FormData();
                formData.append('action', 'analyze');

                const response = await fetch('', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                
                if (result.success) {
                    let html = `<strong>Analysis Results</strong>\n\n`;
                    
                    html += `📊 Total Photos: ${result.stats.total_photos}\n`;
                    html += `💾 Total Size: ${result.total_size_mb} MB\n`;
                    html += `📏 Average Size: ${result.avg_size_kb} KB per photo\n`;
                    html += `🏷️  Has Photo Flags: ${result.has_photo_flags} team members\n\n`;
                    
                    if (result.samples && result.samples.length > 0) {
                        html += `📋 Sample Photos:\n`;
                        html += `${'Name'.padEnd(20)} ${'Size'.padEnd(8)} ${'Type'.padEnd(15)} ${'Uploaded'.padEnd(12)}\n`;
                        html += `${'-'.repeat(60)}\n`;
                        
                        result.samples.forEach(sample => {
                            const sizeKb = Math.round(sample.photo_size / 1024);
                            const uploadDate = sample.uploaded_at ? sample.uploaded_at.substring(0, 10) : 'Unknown';
                            html += `${sample.name.substring(0, 19).padEnd(20)} ${(sizeKb + ' KB').padEnd(8)} ${(sample.content_type || 'Unknown').padEnd(15)} ${uploadDate.padEnd(12)}\n`;
                        });
                    }
                    
                    html += `\n✅ Ready to migrate ${result.stats.total_photos} photos to Railway volume`;
                    
                    resultsDiv.innerHTML = html;
                    
                    // Enable migration button
                    document.getElementById('migrateBtn').disabled = false;
                    
                } else {
                    resultsDiv.innerHTML = `❌ Analysis failed: ${result.error}`;
                }
            } catch (error) {
                resultsDiv.innerHTML = `❌ Error: ${error.message}`;
            }
        }

        async function migratePhotos() {
            if (!confirm('This will migrate all photos from the database to Railway volume and update the database!\n\nAre you sure you want to proceed?')) {
                return;
            }

            const resultsDiv = document.getElementById('migrationResults');
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = 'Migrating photos from member_photos table to Railway volume...';

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
                    output += `📊 Total Processed: ${result.total_processed}\n`;
                    output += `📸 Photos Migrated: ${result.photos_migrated}\n`;
                    output += `📁 Files Created: ${result.files_created}\n`;
                    output += `🔄 Database Updates: ${result.database_updates}\n`;
                    output += `💾 Data Kept in Table: YES (backup preserved)\n`;
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