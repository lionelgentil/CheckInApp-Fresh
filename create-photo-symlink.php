<?php
/**
 * Create symbolic link from document root to Railway volume
 * This allows Apache to serve photos directly without PHP
 */

echo "<h1>🔗 Creating Symbolic Link for Direct Photo Serving</h1>\n";
echo "<pre>\n";

$volumeDir = '/app/storage/photos';
$linkPath = __DIR__ . '/volume-photos';

echo "Volume directory: {$volumeDir}\n";
echo "Link path: {$linkPath}\n";
echo "Document root: " . ($_SERVER['DOCUMENT_ROOT'] ?? __DIR__) . "\n";

// Remove existing link if it exists
if (is_link($linkPath)) {
    unlink($linkPath);
    echo "Removed existing symbolic link\n";
}

// Create symbolic link
if (symlink($volumeDir, $linkPath)) {
    echo "✅ Successfully created symbolic link!\n";
    echo "Link target: " . readlink($linkPath) . "\n";
    
    // Test the link
    if (is_dir($linkPath)) {
        echo "✅ Link is accessible as directory\n";
        
        // List files through the link
        $files = glob($linkPath . '/*.{jpg,jpeg,png,webp}', GLOB_BRACE);
        echo "Files accessible through link: " . count($files) . "\n";
        
        if (count($files) > 0) {
            $sample = array_slice($files, 0, 3);
            foreach ($sample as $file) {
                $filename = basename($file);
                echo "  📸 {$filename} - should be accessible at /volume-photos/{$filename}\n";
            }
            
            echo "\n🎯 Now update .htaccess to use /volume-photos/ instead of PHP serving!\n";
        }
        
    } else {
        echo "❌ Link exists but not accessible as directory\n";
    }
    
} else {
    echo "❌ Failed to create symbolic link\n";
    echo "This might be due to container restrictions\n";
}

echo "</pre>\n";
?>