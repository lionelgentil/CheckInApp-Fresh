<?php
/**
 * Smart Photo Serving Script
 * Auto-creates symlink for static serving, serves files efficiently
 */

// Try to create symlink for future static serving (one-time operation)
$symlinkPath = __DIR__ . '/volume-photos';
$volumeDir = '/app/storage/photos';

if (!is_link($symlinkPath) && is_dir($volumeDir)) {
    if (@symlink($volumeDir, $symlinkPath)) {
        // Symlink created successfully - future requests will be static!
        error_log("Photo symlink created successfully for static serving");
    }
}

// Get the photo filename from URL path
$pathInfo = $_SERVER['PATH_INFO'] ?? '';
$filename = ltrim($pathInfo, '/');

// Validate filename
if (empty($filename) || !preg_match('/^[a-zA-Z0-9\-_.]+\.(jpg|jpeg|png|webp|svg)$/i', $filename)) {
    http_response_code(400);
    exit('Invalid filename');
}

// Handle default avatars specially
if ($filename === 'default-male.svg' || $filename === 'default-female.svg') {
    $gender = ($filename === 'default-female.svg') ? 'female' : 'male';
    
    // Generate SVG content
    $color = ($gender === 'female') ? '#FF69B4' : '#4F80FF';
    $svgContent = '<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="' . $color . '"/>
    <circle cx="50" cy="35" r="18" fill="white"/>
    <ellipse cx="50" cy="75" rx="25" ry="20" fill="white"/>
</svg>';
    
    // Set headers for SVG
    header('Content-Type: image/svg+xml');
    header('Content-Length: ' . strlen($svgContent));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 31536000) . ' GMT');
    
    echo $svgContent;
    exit();
}

// Photo paths for custom photos
$volumePath = $volumeDir . '/' . $filename;
$fallbackPath = '/tmp/photos/' . $filename;

// Find the photo file
$photoPath = null;
if (file_exists($volumePath)) {
    $photoPath = $volumePath;
} elseif (file_exists($fallbackPath)) {
    $photoPath = $fallbackPath;
} else {
    http_response_code(404);
    exit('Photo not found');
}

// Get file info for proper headers
$fileSize = filesize($photoPath);
$fileExtension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
$lastModified = filemtime($photoPath);

// Set content type
$contentTypes = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg', 
    'png' => 'image/png',
    'webp' => 'image/webp',
    'svg' => 'image/svg+xml'
];
$contentType = $contentTypes[$fileExtension] ?? 'application/octet-stream';

// Generate ETag
$etag = '"' . md5($filename . $lastModified . $fileSize) . '"';

// Set caching headers (1 year for immutable files)
header('Content-Type: ' . $contentType);
header('Content-Length: ' . $fileSize);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
header('ETag: ' . $etag);
header('Cache-Control: public, max-age=31536000, immutable');
header('Expires: ' . gmdate('D, d M Y H:i:s', time + 31536000) . ' GMT');

// Check if client has cached version
$clientETag = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
$clientModified = $_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? '';

if ($clientETag === $etag || strtotime($clientModified) >= $lastModified) {
    http_response_code(304); // Not Modified
    exit();
}

// Output the file efficiently
readfile($photoPath);
?>