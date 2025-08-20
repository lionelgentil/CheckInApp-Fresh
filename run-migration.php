<?php
/**
 * Web Migration Endpoint - DELETE THIS FILE AFTER USE!
 * Visit: https://your-app.railway.app/run-migration.php
 */

// Security check - you can add a simple password or remove this file after use
$password = isset($_GET['password']) ? $_GET['password'] : '';
if ($password !== 'migrate2024') {
    http_response_code(401);
    die('<h1>❌ Access Denied</h1><p>Add ?password=migrate2024 to the URL</p>');
}

// Set up output buffering to capture the migration output
ob_start();

// Capture the migration output from our custom function
function runMigration() {
    // Database connection - same logic as api.php but standalone
    $databaseUrl = null;
    $possibleVars = array('DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL');
    foreach ($possibleVars as $var) {
        if (isset($_ENV[$var])) {
            $databaseUrl = $_ENV[$var];
            break;
        }
    }
    
    foreach ($_ENV as $key => $value) {
        if ((strpos($key, 'DATABASE_URL') !== false || 
             strpos($key, 'POSTGRES') !== false) && 
            strpos($value, 'postgres://') === 0) {
            $databaseUrl = $value;
            break;
        }
    }
    
    if (!$databaseUrl) {
        echo "❌ Error: No PostgreSQL database URL found\n";
        return false;
    }
    
    try {
        $parsedUrl = parse_url($databaseUrl);
        $host = $parsedUrl['host'];
        $port = isset($parsedUrl['port']) ? $parsedUrl['port'] : 5432;
        $dbname = ltrim($parsedUrl['path'], '/');
        $user = $parsedUrl['user'];
        $password = $parsedUrl['pass'];
        
        $dsn = "pgsql:host={$host};port={$port};dbname={$dbname}";
        $db = new PDO($dsn, $user, $password);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        echo "✅ Database connected successfully\n";
        
    } catch (PDOException $e) {
        echo "❌ Database connection failed: " . $e->getMessage() . "\n";
        return false;
    }
    
    // Create photos directories if they don't exist
    $photosDir = dirname(__FILE__) . '/photos/members';
    if (!is_dir($photosDir)) {
        mkdir($photosDir, 0755, true);
        echo "📁 Created photos/members directory\n";
    }
    
    // Get all members with base64 photos - more flexible regex
    $stmt = $db->query("
        SELECT id, name, gender, photo 
        FROM team_members 
        WHERE photo IS NOT NULL 
        AND (photo LIKE 'data:image/%' OR photo LIKE '%base64%')
    ");
    
    $members = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $totalMembers = count($members);
    $convertedCount = 0;
    $errorCount = 0;
    
    echo "📊 Found {$totalMembers} members with photos to check\n\n";
    
    if ($totalMembers === 0) {
        echo "✅ No photos found to migrate.\n";
        return true;
    }
    
    $db->beginTransaction();
    
    try {
        foreach ($members as $member) {
            echo "🔄 Checking photo for: {$member['name']} ({$member['id']})... ";
            
            $photoData = $member['photo'];
            
            // Check if it's already a filename (not base64)
            if (!preg_match('/^data:image/', $photoData)) {
                echo "✅ Already a filename: {$photoData}\n";
                continue;
            }
            
            // More flexible base64 extraction
            if (preg_match('/^data:image\/([^;]+);base64,(.+)$/', $photoData, $matches)) {
                $imageType = strtolower($matches[1]);
                $base64Data = $matches[2];
            } else if (preg_match('/base64,(.+)$/', $photoData, $matches)) {
                $imageType = 'jpeg'; // Default
                $base64Data = $matches[1];
                echo "(assuming JPEG) ";
            } else {
                echo "❌ Invalid format - not base64\n";
                $errorCount++;
                continue;
            }
            
            $imageData = base64_decode($base64Data);
            
            if ($imageData === false) {
                echo "❌ Failed to decode base64\n";
                $errorCount++;
                continue;
            }
            
            // Map image types to file extensions
            $extensions = array(
                'jpeg' => 'jpg',
                'jpg' => 'jpg', 
                'png' => 'png',
                'webp' => 'webp',
                'gif' => 'gif',
                'svg+xml' => 'svg'
            );
            
            $extension = isset($extensions[$imageType]) ? $extensions[$imageType] : 'jpg';
            $filename = $member['id'] . '.' . $extension;
            $filePath = $photosDir . '/' . $filename;
            
            // Save image file
            if (file_put_contents($filePath, $imageData) === false) {
                echo "❌ Failed to save file\n";
                $errorCount++;
                continue;
            }
            
            // Update database record
            $updateStmt = $db->prepare("UPDATE team_members SET photo = ? WHERE id = ?");
            $updateStmt->execute(array($filename, $member['id']));
            
            echo "✅ Saved as {$filename}\n";
            $convertedCount++;
        }
        
        $db->commit();
        
        echo "\n🎉 Migration completed!\n";
        echo "✅ Converted: {$convertedCount} photos\n";
        echo "❌ Errors: {$errorCount} photos\n";
        echo "📊 Total processed: {$totalMembers} members\n";
        
        return true;
        
    } catch (Exception $e) {
        $db->rollBack();
        echo "\n❌ Migration failed: " . $e->getMessage() . "\n";
        return false;
    }
}

$result = runMigration();
$output = ob_get_clean();
?>
<!DOCTYPE html>
<html>
<head>
    <title>Photo Migration</title>
    <style>
        body { font-family: monospace; margin: 20px; }
        pre { background: #f0f0f0; padding: 15px; border-radius: 5px; }
        .success { color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <h1>🔄 Photo Migration Results</h1>
    <pre><?php echo htmlspecialchars($output); ?></pre>
    
    <?php if ($result): ?>
        <h2 class="success">✅ Migration Complete!</h2>
        <p><strong>⚠️ IMPORTANT: Delete this file (run-migration.php) immediately for security!</strong></p>
    <?php else: ?>
        <h2 class="error">❌ Migration Failed</h2>
        <p>Check the output above for error details.</p>
    <?php endif; ?>
</body>
</html>