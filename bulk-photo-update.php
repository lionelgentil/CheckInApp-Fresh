<?php
// Generate Single Bulk Photo Update Statement
header('Content-Type: text/plain');

try {
    // Get all photos with correct member IDs
    $photoDirectory = '/app/storage/photos';
    $photoMap = [];

    if (is_dir($photoDirectory)) {
        $files = scandir($photoDirectory);
        foreach ($files as $file) {
            if (preg_match('/^([0-9a-f\-]+)_(\d+)\.(jpg|jpeg|png|gif)$/i', $file, $matches)) {
                $realMemberId = $matches[1];
                $photoMap[$realMemberId] = $file;
            }
        }
    }

    // Generate a single UPDATE with CASE statement
    echo "-- Single Bulk Photo Update Statement\n";
    echo "-- Generated on " . date('Y-m-d H:i:s') . "\n\n";

    echo "UPDATE team_members SET photo = CASE\n";

    foreach ($photoMap as $memberId => $photoFile) {
        echo "    WHEN id = '{$memberId}' THEN '{$photoFile}'\n";
    }

    echo "    ELSE photo\nEND\nWHERE id IN (\n";

    $memberIds = array_keys($photoMap);
    $chunks = array_chunk($memberIds, 50); // Split into chunks of 50 for readability

    foreach ($chunks as $i => $chunk) {
        if ($i > 0) echo ",\n";
        echo "    '" . implode("',\n    '", $chunk) . "'";
    }

    echo "\n);\n\n";
    echo "-- This single statement will update all " . count($photoMap) . " member photos at once!\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>