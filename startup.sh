#!/bin/bash
# Railway startup script to create photo symlink before Apache starts

echo "🔗 Creating photo symlink for static serving..."

# Create symbolic link from document root to Railway volume
VOLUME_DIR="/app/storage/photos"
LINK_PATH="/var/www/html/volume-photos"

# Remove any existing link
if [ -L "$LINK_PATH" ]; then
    rm "$LINK_PATH"
    echo "Removed existing symlink"
fi

# Create the symbolic link
if ln -s "$VOLUME_DIR" "$LINK_PATH"; then
    echo "✅ Successfully created symlink: $LINK_PATH -> $VOLUME_DIR"
    
    # Verify it works
    if [ -d "$LINK_PATH" ]; then
        PHOTO_COUNT=$(ls "$LINK_PATH" | wc -l)
        echo "✅ Symlink accessible with $PHOTO_COUNT files"
    else
        echo "❌ Symlink created but not accessible"
    fi
else
    echo "❌ Failed to create symlink"
fi

echo "🚀 Starting Apache..."