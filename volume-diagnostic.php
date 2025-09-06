<?php
// Quick Railway volume diagnostic

echo "<h1>Railway Volume Diagnostic</h1>";
echo "<pre>";

$volumeDir = '/app/storage/';

echo "=== Volume Directory Info ===\n";
echo "Directory: {$volumeDir}\n";
echo "Exists: " . (is_dir($volumeDir) ? 'YES' : 'NO') . "\n";

if (is_dir($volumeDir)) {
    echo "Permissions: " . substr(sprintf('%o', fileperms($volumeDir)), -4) . "\n";
    echo "Owner: " . (posix_getpwuid(fileowner($volumeDir))['name'] ?? 'unknown') . "\n";
    echo "Group: " . (posix_getgrgid(filegroup($volumeDir))['name'] ?? 'unknown') . "\n";
    echo "Writable: " . (is_writable($volumeDir) ? 'YES' : 'NO') . "\n";
}

echo "\n=== Current User Info ===\n";
echo "Current UID: " . posix_getuid() . "\n";
echo "Current GID: " . posix_getgid() . "\n";
echo "Current User: " . (posix_getpwuid(posix_getuid())['name'] ?? 'unknown') . "\n";
echo "Current Group: " . (posix_getgrgid(posix_getgid())['name'] ?? 'unknown') . "\n";

echo "\n=== Environment Variables ===\n";
$envVars = ['RAILWAY_RUN_UID', 'RAILWAY_VOLUME_NAME', 'RAILWAY_VOLUME_PATH', 'USER', 'HOME', 'RAILWAY_ENVIRONMENT'];
foreach ($envVars as $var) {
    echo "{$var}: " . ($_ENV[$var] ?? 'not set') . "\n";
}

echo "\n=== Write Test ===\n";
$testFile = $volumeDir . '/write_test_' . time();
$writeResult = @file_put_contents($testFile, 'test');

if ($writeResult !== false) {
    echo "✅ Write test successful\n";
    echo "File created: " . basename($testFile) . "\n";
    echo "File size: " . filesize($testFile) . " bytes\n";
    @unlink($testFile);
    echo "File cleaned up\n";
} else {
    echo "❌ Write test failed\n";
    echo "Error: " . error_get_last()['message'] ?? 'Unknown error' . "\n";
}

echo "\n=== Alternative Directories ===\n";
$alternatives = ['/tmp/photos', '/var/tmp/photos'];
foreach ($alternatives as $alt) {
    echo "\n{$alt}:\n";
    echo "  Exists: " . (is_dir($alt) ? 'YES' : 'NO') . "\n";
    echo "  Writable: " . (is_writable($alt) ? 'YES' : 'NO') . "\n";
    
    if (!is_dir($alt)) {
        $created = @mkdir($alt, 0777, true);
        echo "  Created: " . ($created ? 'YES' : 'NO') . "\n";
        if ($created) {
            echo "  Now writable: " . (is_writable($alt) ? 'YES' : 'NO') . "\n";
        }
    }
}

echo "</pre>";
?>
