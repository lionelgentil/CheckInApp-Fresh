<?php
// Startup Hook Diagnostic

echo "<h1>Startup Hook Diagnostic</h1>";
echo "<pre>";

echo "=== Startup Hook File Check ===\n";
$hookPath = '/etc/entrypoint.d/99-starting-hook.sh';
echo "Hook file exists: " . (file_exists($hookPath) ? 'YES' : 'NO') . "\n";

if (file_exists($hookPath)) {
    echo "Hook file permissions: " . substr(sprintf('%o', fileperms($hookPath)), -4) . "\n";
    echo "Hook file owner: " . (posix_getpwuid(fileowner($hookPath))['name'] ?? 'unknown') . "\n";
    echo "Hook file executable: " . (is_executable($hookPath) ? 'YES' : 'NO') . "\n";
    echo "\nHook file contents:\n";
    echo file_get_contents($hookPath);
    echo "\n";
}

echo "\n=== Entrypoint Directory ===\n";
$entrypointDir = '/etc/entrypoint.d';
echo "Entrypoint dir exists: " . (is_dir($entrypointDir) ? 'YES' : 'NO') . "\n";

if (is_dir($entrypointDir)) {
    echo "Files in entrypoint.d:\n";
    $files = scandir($entrypointDir);
    foreach ($files as $file) {
        if ($file !== '.' && $file !== '..') {
            $fullPath = $entrypointDir . '/' . $file;
            $perms = substr(sprintf('%o', fileperms($fullPath)), -4);
            $executable = is_executable($fullPath) ? 'executable' : 'not executable';
            echo "  {$file} ({$perms}, {$executable})\n";
        }
    }
}

echo "\n=== Hook Log Check ===\n";
$logPath = '/tmp/startup-hook.log';
echo "Log file exists: " . (file_exists($logPath) ? 'YES' : 'NO') . "\n";

if (file_exists($logPath)) {
    echo "Log file size: " . filesize($logPath) . " bytes\n";
    echo "Log file contents:\n";
    echo file_get_contents($logPath);
} else {
    echo "No log file found - hook may not have executed\n";
}

echo "\n=== Railway Container Info ===\n";
echo "Container init system: ";
if (file_exists('/sbin/init')) {
    echo "systemd/init\n";
} elseif (file_exists('/usr/bin/supervisord')) {
    echo "supervisor\n";
} else {
    echo "unknown\n";
}

echo "Process 1 (init): ";
$pid1 = file_get_contents('/proc/1/comm');
echo trim($pid1) . "\n";

echo "\n=== Alternative Hook Locations ===\n";
$possibleHooks = [
    '/docker-entrypoint.d/99-starting-hook.sh',
    '/usr/local/bin/docker-entrypoint.d/99-starting-hook.sh',
    '/app/99-starting-hook.sh'
];

foreach ($possibleHooks as $path) {
    echo "{$path}: " . (file_exists($path) ? 'EXISTS' : 'NOT FOUND') . "\n";
}

echo "\n=== Current Volume Status ===\n";
$volumeDir = '/app/storage/photos';
echo "Volume exists: " . (is_dir($volumeDir) ? 'YES' : 'NO') . "\n";
if (is_dir($volumeDir)) {
    echo "Volume owner: " . (posix_getpwuid(fileowner($volumeDir))['name'] ?? 'unknown') . "\n";
    echo "Volume permissions: " . substr(sprintf('%o', fileperms($volumeDir)), -4) . "\n";
    echo "Volume writable: " . (is_writable($volumeDir) ? 'YES' : 'NO') . "\n";
}

echo "</pre>";
?>
