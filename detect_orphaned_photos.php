<?php
/**
 * Orphaned Photo Detection Script
 *
 * Scans the /app/photos directory for UUID_timestamp.extension files
 * and identifies which UUIDs don't exist in the team_members table.
 */

// Database connection - same logic as api.php
$databaseUrl = null;

// Try various environment variable patterns for Railway
$envVars = ['DATABASE_URL', 'DATABASE_PRIVATE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL'];
foreach ($envVars as $var) {
    if (!empty($_ENV[$var])) {
        $databaseUrl = $_ENV[$var];
        break;
    } elseif (!empty(getenv($var))) {
        $databaseUrl = getenv($var);
        break;
    }
}

if (!$databaseUrl) {
    die("ERROR: No database URL found in environment variables\n");
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
    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname};connect_timeout=10";

    // PDO options
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ];

    $pdo = new PDO($dsn, $user, $password, $options);

} catch (PDOException $e) {
    die("Database connection error: " . $e->getMessage() . "\n");
}

echo "=== ORPHANED PHOTO DETECTION ===\n\n";

// Step 1: Scan /app/photos directory for UUID files
echo "1. Scanning /app/storage/photos directory...\n";
$photoDir = '/app/storage/photos/';
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
