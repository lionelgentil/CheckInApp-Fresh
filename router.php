<?php
/**
 * Router for PHP built-in development server
 * Handles URL rewriting for API endpoints
 */

$uri = $_SERVER['REQUEST_URI'];
$parsed = parse_url($uri);
$path = $parsed['path'];

// Handle API requests
if (strpos($path, '/api/') === 0) {
    $apiPath = substr($path, 5); // Remove '/api/' prefix
    $_GET['path'] = $apiPath;
    include 'api.php';
    return true;
}

// Serve static files
if (file_exists(__DIR__ . $path) && is_file(__DIR__ . $path)) {
    return false; // Let PHP serve the file
}

// For everything else, serve index.html (SPA routing)
include 'index.html';
return true;
?>