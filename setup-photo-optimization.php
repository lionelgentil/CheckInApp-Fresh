<?php
/**
 * Setup Default Avatars in Railway Volume
 * Run this once after deploying the photo optimization
 */

echo "<h1>🎯 Photo Optimization Setup</h1>\n";
echo "<p>Setting up default avatars for direct static serving...</p>\n";

$volumeDir = '/app/storage/photos';

// Ensure volume directory exists and is writable
if (!is_dir($volumeDir)) {
    if (!mkdir($volumeDir, 0755, true)) {
        die('❌ Failed to create volume directory');
    }
}

if (!is_writable($volumeDir)) {
    die('❌ Volume directory is not writable');
}

// Male default avatar SVG (blue)
$maleSvg = '<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#4F80FF"/>
    <circle cx="50" cy="35" r="18" fill="white"/>
    <ellipse cx="50" cy="75" rx="25" ry="20" fill="white"/>
</svg>';

// Female default avatar SVG (pink)
$femaleSvg = '<?xml version="1.0" encoding="UTF-8"?>
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#FF69B4"/>
    <circle cx="50" cy="35" r="18" fill="white"/>
    <ellipse cx="50" cy="75" rx="25" ry="20" fill="white"/>
</svg>';

// Create the files
$maleFile = $volumeDir . '/default-male.svg';
$femaleFile = $volumeDir . '/default-female.svg';

echo "<h2>Creating Default Avatar Files</h2>\n<pre>\n";

if (file_put_contents($maleFile, $maleSvg)) {
    echo "✅ Created {$maleFile} (" . filesize($maleFile) . " bytes)\n";
} else {
    echo "❌ Failed to create {$maleFile}\n";
}

if (file_put_contents($femaleFile, $femaleSvg)) {
    echo "✅ Created {$femaleFile} (" . filesize($femaleFile) . " bytes)\n";
} else {
    echo "❌ Failed to create {$femaleFile}\n";
}

echo "\n";
echo "✅ Setup complete!\n";
echo "Volume directory: {$volumeDir}\n";
echo "Files accessible at:\n";
echo "  - /photos/default-male.svg\n";
echo "  - /photos/default-female.svg\n";
echo "</pre>\n";

echo "<h2>🧪 Test Default Avatars</h2>\n";
echo "<p>Male: <img src='/photos/default-male.svg' width='50' height='50' style='border: 1px solid #ddd; border-radius: 50%;'></p>\n";
echo "<p>Female: <img src='/photos/default-female.svg' width='50' height='50' style='border: 1px solid #ddd; border-radius: 50%;'></p>\n";

// List some existing photos for verification
echo "<h2>📁 Existing Photos Sample</h2>\n";
$photos = glob($volumeDir . '/*.{jpg,jpeg,png,webp}', GLOB_BRACE);
if (count($photos) > 0) {
    echo "<p>Found " . count($photos) . " custom photos in volume. Sample:</p>\n<ul>\n";
    $sample = array_slice($photos, 0, 5);
    foreach ($sample as $photo) {
        $filename = basename($photo);
        $size = filesize($photo);
        echo "<li>{$filename} ({$size} bytes) - <a href='/photos/{$filename}' target='_blank'>View</a></li>\n";
    }
    echo "</ul>\n";
} else {
    echo "<p>No custom photos found in volume yet.</p>\n";
}
?>