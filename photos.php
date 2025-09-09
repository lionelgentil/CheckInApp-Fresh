<?php
/**
 * Standalone photo serving script
 * Serves photos directly without going through the main API
 */

// Get the requested filename from the URL path
$requestUri = $_SERVER['REQUEST_URI'];
$path = parse_url($requestUri, PHP_URL_PATH);

// Extract filename from /photos/filename
if (preg_match('#^/photos/(.+)$#', $path, $matches)) {
    $filename = $matches[1];
} else {
    http_response_code(404);
    exit('Photo not found');
}

// Sanitize filename - only allow alphanumeric, dashes, dots, underscores
if (!preg_match('/^[a-zA-Z0-9\-_.]+$/', $filename)) {
    http_response_code(400);
    exit('Invalid filename');
}

// Check various photo locations (same logic as API)
$photoPath = null;

// Check Railway volume first, then fallback, then legacy locations
$volumePhotoPath = '/app/storage/photos/' . $filename;
$fallbackPhotoPath = '/tmp/photos/' . $filename;
$legacyPhotoPath = __DIR__ . '/photos/members/' . $filename;

if (file_exists($volumePhotoPath)) {
    $photoPath = $volumePhotoPath;
} elseif (file_exists($fallbackPhotoPath)) {
    $photoPath = $fallbackPhotoPath;
} elseif (file_exists($legacyPhotoPath)) {
    $photoPath = $legacyPhotoPath;
} else {
    // Try to find any photo for this member (extract member ID from filename)
    $filenameWithoutExt = pathinfo($filename, PATHINFO_FILENAME);
    
    // Handle both old format (memberId.ext) and new format (memberId_timestamp.ext)
    $memberId = $filenameWithoutExt;
    if (strpos($filenameWithoutExt, '_') !== false) {
        // New format: extract memberId from memberId_timestamp
        $memberId = substr($filenameWithoutExt, 0, strrpos($filenameWithoutExt, '_'));
    }
    
    // Try to find any existing photo file for this member
    $volumeDir = '/app/storage/photos';
    $fallbackDir = '/tmp/photos';
    $legacyDir = __DIR__ . '/photos/members';
    
    $volumeFiles = is_dir($volumeDir) ? glob($volumeDir . '/' . $memberId . '_*') : [];
    $fallbackFiles = is_dir($fallbackDir) ? glob($fallbackDir . '/' . $memberId . '_*') : [];
    $legacyFiles = glob($legacyDir . '/' . $memberId . '*');
    
    if (!empty($volumeFiles)) {
        $photoPath = end($volumeFiles);
    } elseif (!empty($fallbackFiles)) {
        $photoPath = end($fallbackFiles);
    } elseif (!empty($legacyFiles)) {
        $photoPath = end($legacyFiles);
    }
}

// If still no photo found, serve default avatar
if (!$photoPath || !file_exists($photoPath)) {
    // Try to determine gender from database to serve appropriate default
    // For now, default to male avatar - could be enhanced to check database
    $photoPath = __DIR__ . '/photos/defaults/male.svg';
    
    // If default doesn't exist either, return 404
    if (!file_exists($photoPath)) {
        http_response_code(404);
        exit('Photo not found');
    }
}

// Get file info
$fileInfo = pathinfo($photoPath);
$extension = strtolower($fileInfo['extension']);

// Set appropriate content type
$contentTypes = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'svg' => 'image/svg+xml'
];

$contentType = $contentTypes[$extension] ?? 'application/octet-stream';

// Set headers for caching and content type
header('Content-Type: ' . $contentType);
header('Content-Length: ' . filesize($photoPath));
header('Cache-Control: public, max-age=31536000'); // Cache for 1 year
header('ETag: "' . md5_file($photoPath) . '"');

// Check if client has cached version
$clientETag = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
$serverETag = '"' . md5_file($photoPath) . '"';

if ($clientETag === $serverETag) {
    http_response_code(304); // Not Modified
    exit();
}

// Output the file
readfile($photoPath);
?>