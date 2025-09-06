<?php
/**
 * Debug symbolic link and Apache rewrite behavior
 */

echo "<h1>🔍 Photo Serving Debug</h1>\n";
echo "<pre>\n";

$testFilename = 'f1eb6d61-7ffb-4d1e-9731-28db803d1cd3_1757191338.png';
$volumePath = '/app/storage/photos/' . $testFilename;
$linkPath = __DIR__ . '/volume-photos/' . $testFilename;
$symlinkDir = __DIR__ . '/volume-photos';

echo "=== Debugging 404 for: {$testFilename} ===\n\n";

echo "1. Volume file check:\n";
echo "   Path: {$volumePath}\n";
echo "   Exists: " . (file_exists($volumePath) ? 'YES' : 'NO') . "\n";
echo "   Readable: " . (is_readable($volumePath) ? 'YES' : 'NO') . "\n";
echo "   Size: " . (file_exists($volumePath) ? filesize($volumePath) . ' bytes' : 'N/A') . "\n";

echo "\n2. Symbolic link check:\n";
echo "   Symlink dir: {$symlinkDir}\n";
echo "   Symlink exists: " . (is_link($symlinkDir) ? 'YES' : 'NO') . "\n";
echo "   Symlink target: " . (is_link($symlinkDir) ? readlink($symlinkDir) : 'N/A') . "\n";
echo "   Symlink accessible: " . (is_dir($symlinkDir) ? 'YES' : 'NO') . "\n";

echo "\n3. File through symlink:\n";
echo "   Link path: {$linkPath}\n";
echo "   Exists through link: " . (file_exists($linkPath) ? 'YES' : 'NO') . "\n";
echo "   Readable through link: " . (is_readable($linkPath) ? 'YES' : 'NO') . "\n";

echo "\n4. Apache/PHP environment:\n";
echo "   Document root: " . ($_SERVER['DOCUMENT_ROOT'] ?? 'not set') . "\n";
echo "   Current dir: " . __DIR__ . "\n";
echo "   Script name: " . ($_SERVER['SCRIPT_NAME'] ?? 'not set') . "\n";
echo "   Request URI: " . ($_SERVER['REQUEST_URI'] ?? 'not set') . "\n";

echo "\n5. Directory listings:\n";
echo "   Volume dir files: " . count(glob('/app/storage/photos/*')) . "\n";
echo "   Symlink dir files: " . count(glob($symlinkDir . '/*')) . "\n";

// List first few files in both locations
$volumeFiles = array_slice(glob('/app/storage/photos/*.{jpg,png,jpeg,webp}', GLOB_BRACE), 0, 3);
$linkFiles = array_slice(glob($symlinkDir . '/*.{jpg,png,jpeg,webp}', GLOB_BRACE), 0, 3);

echo "\n6. Sample files:\n";
echo "   Volume samples:\n";
foreach ($volumeFiles as $file) {
    echo "     " . basename($file) . "\n";
}
echo "   Link samples:\n";
foreach ($linkFiles as $file) {
    echo "     " . basename($file) . "\n";
}

// Test Apache rewrite conditions
echo "\n7. Apache rewrite test:\n";
$rewriteTestPath = $_SERVER['DOCUMENT_ROOT'] . '/volume-photos/' . $testFilename;
echo "   Rewrite target: {$rewriteTestPath}\n";
echo "   Target exists: " . (file_exists($rewriteTestPath) ? 'YES' : 'NO') . "\n";

// Check .htaccess
$htaccessPath = __DIR__ . '/.htaccess';
echo "\n8. .htaccess check:\n";
echo "   .htaccess exists: " . (file_exists($htaccessPath) ? 'YES' : 'NO') . "\n";
if (file_exists($htaccessPath)) {
    $htaccess = file_get_contents($htaccessPath);
    $photoLines = array_filter(explode("\n", $htaccess), function($line) {
        return stripos($line, 'photo') !== false || stripos($line, 'volume') !== false;
    });
    echo "   Photo-related rules:\n";
    foreach ($photoLines as $line) {
        echo "     " . trim($line) . "\n";
    }
}

echo "</pre>\n";

// Test direct access link
echo "<h2>🧪 Direct Test Links</h2>\n";
echo "<p>Test these URLs directly:</p>\n";
echo "<ul>\n";
echo "<li><a href='/volume-photos/{$testFilename}' target='_blank'>Direct symlink: /volume-photos/{$testFilename}</a></li>\n";
echo "<li><a href='/photos/{$testFilename}' target='_blank'>Rewritten URL: /photos/{$testFilename}</a></li>\n";
echo "<li><a href='/photos.php/{$testFilename}' target='_blank'>PHP fallback: /photos.php/{$testFilename}</a></li>\n";
echo "</ul>\n";
?>