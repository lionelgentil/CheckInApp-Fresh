<?php
/**
 * Test Apache's ability to access Railway volume directly
 */

echo "<h1>🔍 Railway Volume Access Test</h1>\n";
echo "<pre>\n";

$volumeDir = '/app/storage/photos';
$testFile = $volumeDir . '/test_direct_access.txt';

echo "=== Testing Railway Volume Access ===\n";
echo "Volume directory: {$volumeDir}\n";
echo "Directory exists: " . (is_dir($volumeDir) ? 'YES' : 'NO') . "\n";
echo "Directory readable: " . (is_readable($volumeDir) ? 'YES' : 'NO') . "\n";
echo "Apache user: " . (posix_getpwuid(posix_getuid())['name'] ?? 'unknown') . "\n";
echo "Volume owner: " . (posix_getpwuid(fileowner($volumeDir))['name'] ?? 'unknown') . "\n";
echo "Volume permissions: " . substr(sprintf('%o', fileperms($volumeDir)), -4) . "\n";

// Create a test file
if (file_put_contents($testFile, 'Apache access test - ' . date('Y-m-d H:i:s'))) {
    echo "\n✅ Created test file: " . basename($testFile) . "\n";
    echo "File readable by PHP: " . (is_readable($testFile) ? 'YES' : 'NO') . "\n";
    echo "File size: " . filesize($testFile) . " bytes\n";
    
    // Try to read it back
    $content = file_get_contents($testFile);
    echo "File content: " . substr($content, 0, 50) . "\n";
    
    // Clean up
    unlink($testFile);
    echo "Test file cleaned up\n";
} else {
    echo "\n❌ Failed to create test file\n";
}

// List some existing photos
echo "\n=== Existing Photos ===\n";
$photos = glob($volumeDir . '/*.{jpg,jpeg,png,webp}', GLOB_BRACE);
if (count($photos) > 0) {
    echo "Found " . count($photos) . " photos. Sample:\n";
    $sample = array_slice($photos, 0, 3);
    foreach ($sample as $photo) {
        $filename = basename($photo);
        $size = filesize($photo);
        $readable = is_readable($photo) ? 'readable' : 'not readable';
        echo "  {$filename} ({$size} bytes, {$readable})\n";
    }
} else {
    echo "No photos found\n";
}

echo "\n=== Document Root Info ===\n";
echo "DOCUMENT_ROOT: " . ($_SERVER['DOCUMENT_ROOT'] ?? 'not set') . "\n";
echo "Current working directory: " . getcwd() . "\n";
echo "Script location: " . __FILE__ . "\n";

echo "</pre>\n";
?>