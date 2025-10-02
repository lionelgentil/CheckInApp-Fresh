#!/bin/bash

# CheckInApp Backup Verification Script
# Verifies backup integrity and tests restoration process

set -e

BACKUP_DIR="/app/backups"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-}"  # Separate test database
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

# Verify backup file integrity
verify_backup_integrity() {
    local backup_file="$1"

    log "Verifying backup integrity: $(basename "$backup_file")"

    if [[ "$backup_file" == *.sql.gz ]]; then
        # Verify SQL backup
        if zcat "$backup_file" | head -20 | grep -q "PostgreSQL database dump"; then
            log "SQL backup integrity: OK"

            # Check for critical tables
            local tables=("teams" "team_members" "events" "matches")
            for table in "${tables[@]}"; do
                if zcat "$backup_file" | grep -q "CREATE TABLE.*$table"; then
                    log "Table $table: Found in backup"
                else
                    warn "Table $table: NOT found in backup"
                fi
            done
        else
            error "SQL backup appears corrupted"
            return 1
        fi

    elif [[ "$backup_file" == *.json.gz ]]; then
        # Verify JSON backup
        if zcat "$backup_file" | jq empty 2>/dev/null; then
            log "JSON backup integrity: OK"

            # Check for critical data
            local data=$(zcat "$backup_file" | jq -r '.tables | keys[]' 2>/dev/null)
            if echo "$data" | grep -q "teams"; then
                local team_count=$(zcat "$backup_file" | jq -r '.tables.teams | length' 2>/dev/null)
                log "Teams in backup: $team_count"
            else
                warn "No teams table found in JSON backup"
            fi
        else
            error "JSON backup appears corrupted"
            return 1
        fi
    fi
}

# Test backup restoration (requires test database)
test_restoration() {
    local backup_file="$1"

    if [[ -z "$TEST_DATABASE_URL" ]]; then
        warn "No test database URL provided, skipping restoration test"
        return 0
    fi

    log "Testing restoration with: $(basename "$backup_file")"

    if [[ "$backup_file" == *.sql.gz ]]; then
        # Test SQL restoration
        log "Testing SQL restoration to test database..."
        if zcat "$backup_file" | psql "$TEST_DATABASE_URL" > /dev/null 2>&1; then
            log "SQL restoration test: PASSED"

            # Verify data was restored
            local team_count=$(psql "$TEST_DATABASE_URL" -t -c "SELECT COUNT(*) FROM teams;" 2>/dev/null | xargs)
            log "Teams restored: $team_count"
        else
            error "SQL restoration test: FAILED"
            return 1
        fi
    fi
}

# Generate backup report
generate_report() {
    local report_file="$BACKUP_DIR/backup_verification_$(date +%Y%m%d_%H%M%S).txt"

    log "Generating backup verification report..."

    cat > "$report_file" << EOF
CheckInApp Backup Verification Report
Generated: $(date)
=====================================

BACKUP INVENTORY:
EOF

    # List all backups with details
    find "$BACKUP_DIR" -name "*.gz" -type f -print0 | while IFS= read -r -d '' file; do
        local size=$(du -h "$file" | cut -f1)
        local age=$(find "$file" -mtime +0 -exec echo "$((($(date +%s) - $(stat -c %Y "$file")) / 3600)) hours ago" \;)
        echo "  $(basename "$file") - $size - $age" >> "$report_file"
    done

    echo "" >> "$report_file"
    echo "VERIFICATION RESULTS:" >> "$report_file"

    # Verify recent backups
    local verified=0
    local failed=0

    find "$BACKUP_DIR" -name "*.gz" -mtime -1 -type f | while read -r file; do
        if verify_backup_integrity "$file"; then
            echo "  ✓ $(basename "$file") - VERIFIED" >> "$report_file"
            ((verified++))
        else
            echo "  ✗ $(basename "$file") - FAILED" >> "$report_file"
            ((failed++))
        fi
    done

    echo "" >> "$report_file"
    echo "SUMMARY:" >> "$report_file"
    echo "  Verified: $verified" >> "$report_file"
    echo "  Failed: $failed" >> "$report_file"
    echo "  Report generated: $(date)" >> "$report_file"

    log "Verification report saved: $(basename "$report_file")"
}

# Main verification process
main() {
    log "Starting backup verification process..."

    if [[ ! -d "$BACKUP_DIR" ]]; then
        error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    local backup_count=$(find "$BACKUP_DIR" -name "*.gz" -type f | wc -l)
    log "Found $backup_count backup files"

    if [[ $backup_count -eq 0 ]]; then
        warn "No backup files found!"
        exit 1
    fi

    # Verify the most recent backups (last 24 hours)
    log "Verifying backups from last 24 hours..."

    local recent_backups=$(find "$BACKUP_DIR" -name "*.gz" -mtime -1 -type f)
    local verified_count=0
    local failed_count=0

    while IFS= read -r backup_file; do
        if [[ -n "$backup_file" ]]; then
            if verify_backup_integrity "$backup_file"; then
                ((verified_count++))
            else
                ((failed_count++))
            fi
        fi
    done <<< "$recent_backups"

    # Test restoration if test database is available
    if [[ -n "$TEST_DATABASE_URL" ]]; then
        log "Testing restoration process..."
        local latest_backup=$(find "$BACKUP_DIR" -name "*full_backup*.sql.gz" -type f | sort | tail -1)
        if [[ -n "$latest_backup" ]]; then
            test_restoration "$latest_backup"
        fi
    fi

    # Generate verification report
    generate_report

    # Summary
    log "Verification Summary:"
    log "  ✓ Verified: $verified_count"
    log "  ✗ Failed: $failed_count"

    if [[ $failed_count -gt 0 ]]; then
        error "Some backups failed verification!"
        exit 1
    else
        log "All backups verified successfully!"
    fi
}

main "$@"