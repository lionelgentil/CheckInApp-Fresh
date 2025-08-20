<?php
/**
 * Migration Script: Convert Base64 Photos to File-based System
 * Run this once to migrate from the old base64 system to the new file-based system
 */

// Include the main API configuration
require_once 'api.php';

echo "🔄 Starting photo migration from base64 to file-based system...\n\n";

// Connect to database using the same logic as api.php
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
    exit(1);
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
    exit(1);
}

// Create photos directories if they don't exist
$photosDir = __DIR__ . '/photos/members';
if (!is_dir($photosDir)) {
    mkdir($photosDir, 0755, true);
    echo "📁 Created photos/members directory\n";
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

echo "📊 Found {$totalMembers} members with base64 photos to convert\n\n";

if ($totalMembers === 0) {
    echo "✅ No base64 photos found. Migration already complete or no photos to migrate.\n";
    exit(0);
}

$db->beginTransaction();

try {
    foreach ($members as $member) {
        echo "🔄 Converting photo for: {$member['name']} ({$member['id']})... ";
        
        $base64Photo = $member['photo'];
        
        // Extract image data from base64
        if (!preg_match('/^data:image\/(\w+);base64,(.+)$/', $base64Photo, $matches)) {
            echo "❌ Invalid base64 format\n";
            $errorCount++;
            continue;
        }
        
        $imageType = strtolower($matches[1]);
        $imageData = base64_decode($matches[2]);
        
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
    echo "📊 Total processed: {$totalMembers} members\n\n";
    
    if ($convertedCount > 0) {
        echo "📝 Next steps:\n";
        echo "1. Update your frontend to use the new photo URLs\n";
        echo "2. Test the photo display and upload functionality\n";
        echo "3. Consider backing up the database before removing this script\n\n";
    }
    
} catch (Exception $e) {
    $db->rollBack();
    echo "\n❌ Migration failed: " . $e->getMessage() . "\n";
    echo "🔄 Database changes have been rolled back\n";
    exit(1);
}