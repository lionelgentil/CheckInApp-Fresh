<?php
// Generate Photo Update SQL Statements
header('Content-Type: text/plain');

try {
    // Database connection
    $dbUrl = parse_url(getenv('DATABASE_URL'));
    $pdo = new PDO(
        sprintf("pgsql:host=%s;port=%s;dbname=%s", $dbUrl['host'], $dbUrl['port'], ltrim($dbUrl['path'], '/')),
        $dbUrl['user'],
        $dbUrl['pass']
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

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

    // Generate UPDATE statements
    echo "-- Photo Update SQL Statements\n";
    echo "-- Generated on " . date('Y-m-d H:i:s') . "\n\n";

    $updateCount = 0;
    foreach ($photoMap as $memberId => $photoFile) {
        echo "UPDATE team_members SET photo = '{$photoFile}' WHERE id = '{$memberId}';\n";
        $updateCount++;
    }

    echo "\n-- Total UPDATE statements generated: {$updateCount}\n";
    echo "-- Run these in db-maintenance.html to update all member photos\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>