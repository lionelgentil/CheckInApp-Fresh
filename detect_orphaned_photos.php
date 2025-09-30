<?php
/**
 * Orphaned Photo Detection Script
 *
 * Scans the /app/photos directory for UUID_timestamp.extension files
 * and identifies which UUIDs don't exist in the team_members table.
 */

require_once 'config.php';

echo "=== ORPHANED PHOTO DETECTION ===\n\n";

// Step 1: Scan /app/photos directory for UUID files
echo "1. Scanning /app/photos directory...\n";
$photoDir = '/app/photos/';
$photoFiles = [];
$photoUUIDs = [];

if (!is_dir($photoDir)) {
    die("ERROR: Photos directory not found: $photoDir\n");
}

$files = scandir($photoDir);
foreach ($files as $file) {
    if ($file === '.' || $file === '..') continue;

    // Match UUID_timestamp.extension pattern
    if (preg_match('/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})_\d+\.\w+$/i', $file, $matches)) {
        $uuid = $matches[1];
        $photoFiles[$uuid] = $file;
        $photoUUIDs[] = $uuid;
    }
}

echo "Found " . count($photoFiles) . " photo files with valid UUID naming\n";
echo "Unique member UUIDs: " . count(array_unique($photoUUIDs)) . "\n\n";

// Step 2: Query existing team_members
echo "2. Querying existing team_members...\n";
try {
    $pdo = new PDO($dsn, $username, $password, $options);

    $stmt = $pdo->query("SELECT id FROM team_members");
    $existingMembers = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo "Found " . count($existingMembers) . " existing team members in database\n\n";

} catch (PDOException $e) {
    die("Database error: " . $e->getMessage() . "\n");
}

// Step 3: Identify orphaned photos
echo "3. Identifying orphaned photos...\n";
$orphanedUUIDs = [];
$orphanedPhotos = [];

foreach ($photoUUIDs as $uuid) {
    if (!in_array($uuid, $existingMembers)) {
        $orphanedUUIDs[] = $uuid;
        $orphanedPhotos[$uuid] = $photoFiles[$uuid];
    }
}

// Step 4: Display results
echo "=== RESULTS ===\n";
echo "Total photos found: " . count($photoFiles) . "\n";
echo "Existing members: " . count($existingMembers) . "\n";
echo "Orphaned photos: " . count($orphanedUUIDs) . "\n\n";

if (count($orphanedUUIDs) > 0) {
    echo "=== ORPHANED PHOTOS (UUIDs with photos but no database entry) ===\n";
    foreach ($orphanedPhotos as $uuid => $filename) {
        echo "UUID: $uuid\n";
        echo "File: $filename\n";
        echo "---\n";
    }

    echo "\nNext step: Run the INSERT script to add these " . count($orphanedUUIDs) . " members to the database.\n";
} else {
    echo "No orphaned photos found! All photos have corresponding team_members entries.\n";
}

echo "\n=== DETECTION COMPLETE ===\n";
?>