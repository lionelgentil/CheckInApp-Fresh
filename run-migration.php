<?php
/**
 * Web Migration Endpoint - DELETE THIS FILE AFTER USE!
 * Visit: https://your-app.railway.app/run-migration.php
 */

// Security check - you can add a simple password or remove this file after use
$password = $_GET['password'] ?? '';
if ($password !== 'migrate2024') {
    http_response_code(401);
    echo '<h1>❌ Access Denied</h1>';
    echo '<p>Add ?password=migrate2024 to the URL</p>';
    exit;
}

echo '<h1>🔄 Photo Migration</h1>';
echo '<pre>';

// Include the migration script
require_once 'migrate-photos.php';

echo '</pre>';
echo '<h2>✅ Migration Complete!</h2>';
echo '<p><strong>⚠️ IMPORTANT: Delete this file (run-migration.php) immediately for security!</strong></p>';
?>