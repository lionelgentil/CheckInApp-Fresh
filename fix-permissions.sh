#!/bin/bash
# Fix volume permissions on startup
if [ -d "/app/storage" ]; then
    echo "Fixing volume permissions..."
    chown -R www-data:www-data /app/storage 2>/dev/null || chown -R nobody:nobody /app/storage 2>/dev/null || chown -R 1000:1000 /app/storage
    chmod -R 755 /app/storage
    mkdir -p /app/storage/photos
    chmod -R 777 /app/storage/photos
    echo "Volume permissions fixed"
fi

# Start your application
exec "$@"