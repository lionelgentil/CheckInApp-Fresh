#!/bin/bash
# Keep-alive script for Railway app to prevent cold starts
# Run this every 5 minutes with cron: */5 * * * * /path/to/keep-alive.sh

URL="https://checkinapp-fresh-production.up.railway.app/api/keep-alive"
HEALTH_URL="https://checkinapp-fresh-production.up.railway.app/api/health"

echo "$(date): Pinging Railway app..."

# Ping keep-alive endpoint
response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total}" -X GET "$URL")
http_code=$(echo $response | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
time_total=$(echo $response | grep -o "TIME:[0-9.]*" | cut -d: -f2)

if [ "$http_code" = "200" ]; then
    echo "✅ Keep-alive successful (${time_total}s)"
    echo "$response" | sed 's/HTTPSTATUS.*//g'
else
    echo "❌ Keep-alive failed (HTTP $http_code)"
    # Try health endpoint as fallback
    curl -s "$HEALTH_URL" || echo "Health check also failed"
fi

echo "---"