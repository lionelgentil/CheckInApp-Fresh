<?php
/**
 * Migration Script: Convert Base64 Photos to File-based System (PHP 5.3 Compatible)
 * Run this once to migrate from the old base64 system to the new file-based system
 */

echo "🔄 Starting photo migration from base64 to file-based system...\n\n";

// Simple database connection for migration
$host = 'localhost';
$port = 5432;
$dbname = 'your_database';
$user = 'your_username';  
$password = 'your_password';

// You'll need to manually set your database credentials above
echo "⚠️  Please edit migrate-photos-simple.php and set your database credentials first!\n";
echo "Then run: php migrate-photos-simple.php\n\n";

// Uncomment the following lines after setting credentials:
/*
try {
    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname}";
    $db = new PDO($dsn, $user, $password);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "✅ Database connected successfully\n";
    
} catch (PDOException $e) {
    echo "❌ Database connection failed: " . $e->getMessage() . "\n";
    exit(1);
}

// Create photos directories if they don't exist
$photosDir = dirname(__FILE__) . '/photos/members';
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
        echo "🔄 Converting photo for: " . $member['name'] . " (" . $member['id'] . ")... ";
        
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
        echo "1. Test the photo display in your app\n";
        echo "2. Verify photos are loading from /api/photos URLs\n";
        echo "3. Consider upgrading to PHP 7+ for better performance\n\n";
    }
    
} catch (Exception $e) {
    $db->rollBack();
    echo "\n❌ Migration failed: " . $e->getMessage() . "\n";
    echo "🔄 Database changes have been rolled back\n";
    exit(1);
}
*/