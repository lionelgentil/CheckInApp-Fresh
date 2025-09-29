<?php
// Photo Integration Script - Match photos with reconstructed members
header('Content-Type: application/json');

try {
    // Database connection (same as main app)
    $dbUrl = parse_url(getenv('DATABASE_URL'));
    $pdo = new PDO(
        sprintf("pgsql:host=%s;port=%s;dbname=%s", $dbUrl['host'], $dbUrl['port'], ltrim($dbUrl['path'], '/')),
        $dbUrl['user'],
        $dbUrl['pass']
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Get all photos
    $photoDirectory = '/app/storage/photos';
    $foundPhotos = [];

    if (is_dir($photoDirectory)) {
        $files = scandir($photoDirectory);
        foreach ($files as $file) {
            if (preg_match('/^([0-9a-f\-]+)_(\d+)\.(jpg|jpeg|png|gif)$/i', $file, $matches)) {
                $realMemberId = $matches[1];
                $timestamp = $matches[2];
                $extension = $matches[3];

                $foundPhotos[] = [
                    'file' => $file,
                    'real_member_id' => $realMemberId,
                    'timestamp' => $timestamp,
                    'extension' => $extension
                ];
            }
        }
    }

    // Get all current team members
    $stmt = $pdo->query('SELECT id, name, team_id FROM team_members ORDER BY id');
    $currentMembers = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Match photos with members
    $matches = [];
    $unmatched_photos = [];
    $unmatched_members = [];

    foreach ($foundPhotos as $photo) {
        $found = false;
        foreach ($currentMembers as $member) {
            if ($member['id'] === $photo['real_member_id']) {
                $matches[] = [
                    'member_id' => $member['id'],
                    'current_name' => $member['name'],
                    'team_id' => $member['team_id'],
                    'photo_file' => $photo['file'],
                    'photo_timestamp' => $photo['timestamp']
                ];
                $found = true;
                break;
            }
        }
        if (!$found) {
            $unmatched_photos[] = $photo;
        }
    }

    // Find members without photos
    foreach ($currentMembers as $member) {
        $hasPhoto = false;
        foreach ($foundPhotos as $photo) {
            if ($member['id'] === $photo['real_member_id']) {
                $hasPhoto = true;
                break;
            }
        }
        if (!$hasPhoto) {
            $unmatched_members[] = $member;
        }
    }

    echo json_encode([
        'total_photos' => count($foundPhotos),
        'total_members' => count($currentMembers),
        'matched_count' => count($matches),
        'unmatched_photos' => count($unmatched_photos),
        'unmatched_members' => count($unmatched_members),
        'sample_matches' => array_slice($matches, 0, 10),
        'sample_unmatched_photos' => array_slice($unmatched_photos, 0, 5),
        'sample_unmatched_members' => array_slice($unmatched_members, 0, 5)
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>