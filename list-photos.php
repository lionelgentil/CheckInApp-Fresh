<?php
// Photo Directory Listing Script
// This script will list all photo files and help reconstruct team_members

header('Content-Type: application/json');

$photoDirectories = [
    '/app/storage/photos',
    '/app/photos',
    './photos',
    './storage/photos'
];

$foundPhotos = [];

foreach ($photoDirectories as $dir) {
    if (is_dir($dir)) {
        echo "<!-- Found directory: $dir -->\n";
        $files = scandir($dir);
        foreach ($files as $file) {
            if (preg_match('/\.(jpg|jpeg|png|gif)$/i', $file)) {
                // Extract member ID from filename (assuming format: memberid.jpg or similar)
                $memberId = pathinfo($file, PATHINFO_FILENAME);
                $foundPhotos[] = [
                    'file' => $file,
                    'path' => $dir . '/' . $file,
                    'member_id' => $memberId,
                    'size' => filesize($dir . '/' . $file)
                ];
            }
        }
    }
}

// Also check for member subdirectories
foreach ($photoDirectories as $dir) {
    $membersDir = $dir . '/members';
    if (is_dir($membersDir)) {
        echo "<!-- Found members directory: $membersDir -->\n";
        $files = scandir($membersDir);
        foreach ($files as $file) {
            if (preg_match('/\.(jpg|jpeg|png|gif)$/i', $file)) {
                $memberId = pathinfo($file, PATHINFO_FILENAME);
                $foundPhotos[] = [
                    'file' => $file,
                    'path' => $membersDir . '/' . $file,
                    'member_id' => $memberId,
                    'size' => filesize($membersDir . '/' . $file)
                ];
            }
        }
    }
}

echo json_encode([
    'total_photos' => count($foundPhotos),
    'photos' => $foundPhotos
], JSON_PRETTY_PRINT);
?>