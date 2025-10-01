<?php
/**
 * Insert Orphaned Members Script
 *
 * Creates team_members entries for UUIDs that have photos but no database entry.
 * Leaves team_id as NULL for manual assignment later.
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

echo "=== ORPHANED MEMBER INSERTION ===\n\n";

// Step 1: Scan /app/storage/photos directory for UUID files
echo "1. Scanning photos directory...\n";
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

echo "Found " . count($photoFiles) . " photo files\n\n";

// Step 2: Get existing team_members
echo "2. Querying existing team_members...\n";
$stmt = $pdo->query("SELECT id FROM team_members");
$existingMembers = $stmt->fetchAll(PDO::FETCH_COLUMN);
echo "Found " . count($existingMembers) . " existing members\n\n";

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

echo "Found " . count($orphanedUUIDs) . " orphaned photos\n\n";

if (count($orphanedUUIDs) === 0) {
    echo "No orphaned photos to insert!\n";
    exit;
}

// Step 4: Prepare INSERT statement
echo "4. Preparing to insert " . count($orphanedUUIDs) . " orphaned members...\n";
echo "   Assigning to team: 'Players without clear match-based team assignment'\n\n";

$defaultTeamId = "eca83a30-72e3-4696-bc09-4e8c5834c839";
$insertSQL = "INSERT INTO team_members (id, team_id, name, jersey_number, gender, photo, created_at_epoch) VALUES (?, ?, ?, NULL, 'male', ?, ?)";
$stmt = $pdo->prepare($insertSQL);

$insertedCount = 0;
$errorCount = 0;
$errors = [];

echo "5. Inserting members...\n";

foreach ($orphanedPhotos as $uuid => $filename) {
    try {
        $placeholderName = "Player-" . substr($uuid, 0, 8); // Shorter placeholder name
        $currentEpoch = time(); // Current Unix timestamp
        $stmt->execute([$uuid, $defaultTeamId, $placeholderName, $filename, $currentEpoch]);
        $insertedCount++;

        if ($insertedCount % 10 === 0) {
            echo "   Inserted $insertedCount members...\n";
        }

    } catch (PDOException $e) {
        $errorCount++;
        $errors[] = "UUID $uuid: " . $e->getMessage();

        if ($errorCount <= 5) { // Show first 5 errors
            echo "   ERROR inserting $uuid: " . $e->getMessage() . "\n";
        }
    }
}

// Step 6: Results
echo "\n=== INSERTION COMPLETE ===\n";
echo "Successfully inserted: $insertedCount members\n";
echo "Errors encountered: $errorCount\n";
echo "Total orphaned photos: " . count($orphanedUUIDs) . "\n\n";

if ($errorCount > 0) {
    echo "=== ERRORS ===\n";
    foreach (array_slice($errors, 0, 10) as $error) { // Show first 10 errors
        echo "$error\n";
    }
    if (count($errors) > 10) {
        echo "... and " . (count($errors) - 10) . " more errors\n";
    }
}

echo "\n=== NEXT STEPS ===\n";
echo "1. All members assigned to 'Players without clear match-based team assignment'\n";
echo "2. Manually reassign members to their correct teams as needed\n";
echo "3. Update member names from placeholder names\n";
echo "4. Update gender from default 'male' to correct values\n";
echo "5. Update jersey numbers as needed\n";
echo "6. All members now have photo references set\n";

echo "\n=== READY FOR MANUAL TEAM REASSIGNMENT ===\n";
?>