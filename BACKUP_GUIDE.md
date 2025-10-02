# CheckInApp Backup & Recovery Guide

## 🛡️ **Complete Backup Strategy**

After the data loss incident, I've implemented a comprehensive multi-layered backup system:

### **1. API-Based Backups (Immediate Use)**
**Manual Backup:**
```bash
# Download current backup
curl -u "admin:YOUR_PASSWORD" "https://your-app.railway.app/api/backup" > backup.json
```

**Restore Backup:**
```bash
# Restore from backup file
curl -X POST -u "admin:YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  --data @backup.json \
  "https://your-app.railway.app/api/backup"
```

### **2. Automated Scripts**
- **`backup-system.sh`** - Comprehensive backup script
  - Daily full backups at 2 AM
  - Hourly incremental backups
  - Automatic cleanup (30-day retention)
  - Backup verification

- **`backup-verify.sh`** - Integrity verification
  - Tests backup file integrity
  - Verifies critical table presence
  - Optional restoration testing

### **3. GitHub Actions Automation**
- **`.github/workflows/backup.yml`**
  - Automated daily/hourly backups via GitHub Actions
  - Stores full backups as GitHub releases
  - Incremental backups as artifacts
  - Automatic verification

## 🚀 **Implementation Steps**

### **Step 1: Immediate Setup (5 minutes)**
1. **Test the API backup endpoint:**
   ```bash
   curl -u "admin:YOUR_PASSWORD" "https://checkinapp-fresh-production.up.railway.app/api/backup" > test-backup.json
   ```

2. **Verify backup works:**
   ```bash
   jq '.tables.teams | length' test-backup.json
   jq '.tables.team_members | length' test-backup.json
   ```

### **Step 2: GitHub Actions Setup (10 minutes)**
1. **Add repository secrets:**
   - `RAILWAY_APP_URL`: `https://checkinapp-fresh-production.up.railway.app`
   - `ADMIN_PASSWORD`: Your admin password

2. **Enable GitHub Actions:**
   - The backup workflow will run automatically
   - Daily full backups at 2 AM UTC
   - Hourly incremental backups

### **Step 3: Railway Backup Script (Optional)**
1. **Deploy backup scripts to Railway:**
   ```bash
   # If Railway supports cron jobs
   chmod +x backup-system.sh backup-verify.sh
   ```

2. **Set up cron jobs** (if supported by Railway)

## 📊 **Backup Schedule**

| Time | Type | Storage | Retention |
|------|------|---------|-----------|
| Every hour | Incremental API | GitHub artifacts | 7 days |
| Daily 2 AM | Full API | GitHub releases | Permanent |
| Manual | On-demand | Local download | User managed |

## 🔍 **Monitoring & Verification**

### **Health Checks:**
```bash
# Check backup endpoint
curl "https://your-app.railway.app/api/health"

# Verify backup integrity
./backup-verify.sh

# Test restoration (with test database)
TEST_DATABASE_URL="your-test-db" ./backup-verify.sh
```

### **Backup Verification:**
- ✅ JSON format validation
- ✅ Critical table presence
- ✅ Record count verification
- ✅ Restoration testing (optional)

## 🔧 **Recovery Procedures**

### **Complete Data Loss Recovery:**
1. **Get latest backup:**
   ```bash
   # From GitHub releases or manual download
   curl -u "admin:PASSWORD" "https://your-app.railway.app/api/backup" > recovery.json
   ```

2. **Restore data:**
   ```bash
   curl -X POST -u "admin:PASSWORD" \
     -H "Content-Type: application/json" \
     --data @recovery.json \
     "https://your-app.railway.app/api/backup"
   ```

### **Partial Recovery:**
The JSON backup format allows selective restoration by editing the JSON file before restore.

## 🚨 **Critical Actions**

### **Immediate (Do Now):**
1. ✅ **Manual backup** - Download current state
2. ✅ **Test restore** - Verify backup/restore works
3. ✅ **Set up GitHub Actions** - Add secrets and enable

### **This Week:**
4. **Schedule regular manual backups** (daily until automation is verified)
5. **Test recovery procedures** with non-production data
6. **Document team recovery procedures**

### **Ongoing:**
7. **Monitor backup logs** via GitHub Actions
8. **Regular verification** of backup integrity
9. **Update recovery documentation**

## 📈 **Backup Statistics**

The backup system captures:
- **9 critical tables**: teams, team_members, events, matches, etc.
- **All relationships**: Foreign keys and constraints preserved
- **Metadata**: Creation time, version, integrity checks
- **Size optimization**: Compressed JSON format

## 🔐 **Security**

- **Authentication required** for backup/restore operations
- **GitHub secrets** for automated backups
- **No sensitive data exposure** in logs
- **Audit trail** of all backup operations

This comprehensive system ensures you'll never lose data again! 🛡️