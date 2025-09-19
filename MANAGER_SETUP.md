# Manager Portal - HTTP Basic Authentication Setup

## Created Files:
- `manager.html` - Team Manager Portal interface
- `manager-app.js` - Manager-specific JavaScript functionality  
- `team_managers_table.sql` - Database table creation script
- `.htaccess` - Updated with manager.html protection
- `.htpasswd` - Password file for HTTP Basic Auth

## Password Setup:
The `.htpasswd` file has been created with:
- **Username**: `manager`
- **Password**: [Set during creation - you entered this interactively]

## To Change the Password:
```bash
# Update existing password
htpasswd /app/.htpasswd manager

# Add new manager user
htpasswd /app/.htpasswd newmanager
```

## Manager Portal Features:
1. **Teams Section** - Full read/write access:
   - View all teams and rosters
   - Manage team managers (add/edit/delete)
   - View player details

2. **Standings Section** - Read-only:
   - Current league standings
   - Filter by season

3. **Game Tracker Section** - Read-only, completed games only:
   - View completed match results
   - See disciplinary actions and cards
   - Filter by team and season

## Access URLs:
- **Admin Portal**: `/app.html` (full access)
- **Referee Portal**: `/view.html` (match management)
- **Manager Portal**: `/manager.html` (team management)

## Database Setup:
Run the SQL commands in `team_managers_table.sql` via:
1. `db-maintenance.html` interface (recommended)
2. Direct database connection

## Security:
- Manager portal protected by HTTP Basic Auth
- Keeps search engines and unauthorized users out
- Simple shared credentials for trusted team managers