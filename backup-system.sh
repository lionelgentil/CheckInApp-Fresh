#!/bin/bash

# CheckInApp Backup System v6.5.0
# Comprehensive backup strategy for PostgreSQL database on Railway

set -e  # Exit on any error

# Configuration
BACKUP_DIR="/app/backups"
REMOTE_BACKUP_DIR="/tmp/backups"  # Railway temp storage
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_ONLY=$(date +%Y%m%d)
HOUR=$(date +%H)
RETENTION_DAYS=30
APP_URL="${RAILWAY_STATIC_URL:-http://localhost:8000}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"

# Create backup directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$REMOTE_BACKUP_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Function to test database connectivity
test_database() {
    log "Testing database connectivity..."
    if pg_dump --version > /dev/null 2>&1; then
        log "pg_dump is available"
    else
        error "pg_dump not found!"
        exit 1
    fi

    # Test connection
    if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log "Database connection successful"
    else
        error "Cannot connect to database!"
        exit 1
    fi
}

# Function to create full SQL backup
create_sql_backup() {
    local backup_type="$1"
    local filename="$BACKUP_DIR/${backup_type}_backup_${TIMESTAMP}.sql"

    log "Creating $backup_type SQL backup..."

    if [ "$backup_type" = "full" ]; then
        # Full database backup
        pg_dump "$DATABASE_URL" --clean --if-exists --verbose > "$filename" 2>/dev/null
    else
        # Critical tables only
        pg_dump "$DATABASE_URL" \
            --table=teams \
            --table=team_members \
            --table=events \
            --table=matches \
            --table=match_attendees \
            --table=match_cards \
            --table=player_disciplinary_records \
            --table=team_managers \
            --table=referees \
            --clean --if-exists --verbose > "$filename" 2>/dev/null
    fi

    if [ -f "$filename" ] && [ -s "$filename" ]; then
        # Compress backup
        gzip "$filename"
        local compressed_file="${filename}.gz"
        local size=$(du -h "$compressed_file" | cut -f1)
        log "$backup_type backup created: $(basename "$compressed_file") ($size)"

        # Verify backup integrity
        if zcat "$compressed_file" | head -10 | grep -q "PostgreSQL database dump"; then
            log "Backup integrity verified"
        else
            warn "Backup integrity check failed!"
        fi
    else
        error "Failed to create $backup_type backup!"
        exit 1
    fi
}

# Function to create JSON backup via API
create_api_backup() {
    log "Creating API-based backup..."

    # Authenticate and get backup
    local backup_file="$BACKUP_DIR/api_backup_${TIMESTAMP}.json"

    # Use curl to download backup from API
    curl -s -X GET \
        -H "Content-Type: application/json" \
        -u "admin:$ADMIN_PASSWORD" \
        "$APP_URL/api/backup" \
        > "$backup_file"

    if [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
        # Verify JSON format
        if jq empty "$backup_file" 2>/dev/null; then
            local size=$(du -h "$backup_file" | cut -f1)
            log "API backup created: $(basename "$backup_file") ($size)"

            # Compress JSON backup
            gzip "$backup_file"
            log "API backup compressed"
        else
            warn "Invalid JSON in API backup"
            rm -f "$backup_file"
        fi
    else
        warn "API backup failed or empty"
    fi
}

# Function to get database statistics
get_db_stats() {
    log "Gathering database statistics..."

    local stats_file="$BACKUP_DIR/db_stats_${TIMESTAMP}.txt"

    cat > "$stats_file" << EOF
CheckInApp Database Statistics - $(date)
==========================================

EOF

    # Get table counts
    psql "$DATABASE_URL" -c "
        SELECT
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_rows,
            n_dead_tup as dead_rows
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC;
    " >> "$stats_file"

    echo "" >> "$stats_file"
    echo "Database Size:" >> "$stats_file"
    psql "$DATABASE_URL" -c "
        SELECT
            pg_size_pretty(pg_database_size(current_database())) as database_size;
    " >> "$stats_file"

    log "Database statistics saved to $(basename "$stats_file")"
}

# Function to cleanup old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."

    local deleted_count=0
    while IFS= read -r -d '' file; do
        rm "$file"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -print0 2>/dev/null)

    while IFS= read -r -d '' file; do
        rm "$file"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR" -name "*.txt" -mtime +$RETENTION_DAYS -print0 2>/dev/null)

    if [ $deleted_count -gt 0 ]; then
        log "Cleaned up $deleted_count old backup files"
    else
        log "No old backup files to clean up"
    fi
}

# Function to send backup notification
send_notification() {
    local status="$1"
    local message="$2"

    # Log to Railway logs
    if [ "$status" = "SUCCESS" ]; then
        log "BACKUP $status: $message"
    else
        error "BACKUP $status: $message"
    fi

    # Could add webhook notification here for external monitoring
    # curl -X POST "https://your-webhook-url.com/backup-status" \
    #      -H "Content-Type: application/json" \
    #      -d "{\"status\":\"$status\",\"message\":\"$message\",\"timestamp\":\"$(date -Iseconds)\"}"
}

# Main backup execution
main() {
    log "Starting CheckInApp backup process..."

    # Test prerequisites
    test_database

    # Determine backup type based on time
    if [ "$HOUR" -eq 2 ]; then
        # 2 AM - Full backup
        log "Performing daily full backup (2 AM schedule)"
        create_sql_backup "full"
        create_api_backup
        get_db_stats

        backup_message="Daily full backup completed at $(date)"
    else
        # Hourly - Incremental backup
        log "Performing hourly incremental backup"
        create_sql_backup "incremental"

        backup_message="Hourly incremental backup completed at $(date)"
    fi

    # Always cleanup old backups
    cleanup_old_backups

    # Show backup summary
    log "Backup Summary:"
    ls -lh "$BACKUP_DIR"/*_${DATE_ONLY}_* 2>/dev/null | tail -5

    # Calculate total backup size
    local total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
    log "Total backup directory size: $total_size"

    send_notification "SUCCESS" "$backup_message"
    log "Backup process completed successfully!"
}

# Error handling
trap 'send_notification "FAILED" "Backup process failed at $(date)"' ERR

# Run main function
main "$@"