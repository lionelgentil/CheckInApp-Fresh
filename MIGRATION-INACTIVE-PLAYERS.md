# Database Migration for Inactive Players Feature

## Run these SQL commands in db-maintenance.html

**Step 1: Add active column to team_members table**
```sql
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
```

**Step 2: Set existing members as active (backward compatibility)**
```sql
UPDATE team_members SET active = TRUE WHERE active IS NULL;
```

**Step 3: Create index for performance**
```sql
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(active);
```

## Verification Queries

**Check if migration worked:**
```sql
SELECT COUNT(*) as active_members FROM team_members WHERE active = TRUE;
SELECT COUNT(*) as inactive_members FROM team_members WHERE active = FALSE;
```

**Test inactive player search:**
```sql
SELECT tm.id, tm.name, tm.jersey_number, tm.gender, tm.team_id, 
       t.name as team_name, t.category as team_category
FROM team_members tm 
JOIN teams t ON tm.team_id = t.id
WHERE tm.active = FALSE AND LOWER(tm.name) = LOWER('TestPlayer');
```

---
*Run these commands in the order listed to migrate your database for the inactive players feature.*