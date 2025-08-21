# CheckIn App v2.16.6

A comprehensive team and event management application with advanced disciplinary tracking, built with PHP 8 and PostgreSQL for professional sports organizations and leagues.

## Features

### Core Management
- ✅ **Team Management**: Create, edit, and delete teams with custom colors and categories
- ✅ **Member Management**: Add team members with jersey numbers, gender, and photo upload
- ✅ **Captain Assignment**: Designate team captains with visual indicators
- ✅ **Event Management**: Create and manage match day events with filtering
- ✅ **Match System**: Complete match setup with referee assignments and results tracking

### Advanced Disciplinary System
- ✅ **Card Management**: Issue yellow and red cards during matches with detailed reasons
- ✅ **Prior Records**: Track disciplinary history from external competitions
- ✅ **Suspension Tracking**: Monitor suspension status with match counts and served dates
- ✅ **Comprehensive Reasons**: 15+ specific card reasons including tactical fouls
- ✅ **Player Profiles**: Complete disciplinary history with chronological display

### Match & Attendance Features
- ✅ **Player Check-ins**: Real-time attendance tracking for matches
- ✅ **Match Results**: Score tracking with match status management
- ✅ **Referee Management**: Assign main and assistant referees
- ✅ **Live Cards**: Issue cards during matches with minute tracking
- ✅ **Match Filtering**: View past/future events with smart filtering

### Technical Features
- ✅ **Progressive Web App**: PWA-ready with offline capabilities
- ✅ **Responsive Design**: Mobile-optimized interface
- ✅ **View-Only Mode**: Public viewing interface for spectators
- ✅ **RESTful API**: Clean PHP API with complete CRUD operations
- ✅ **Container Ready**: Dockerized for Railway deployment

## Architecture

- **Backend**: PHP 8.2 with Apache
- **Database**: PostgreSQL with advanced relational schema
- **Frontend**: Vanilla JavaScript SPA with dual interface modes
- **Styling**: Modern responsive CSS with mobile optimization
- **Container**: Docker with PHP 8.2-apache base image
- **Deployment**: Railway-optimized with automatic PostgreSQL integration

## Database Schema

### Core Tables
- `teams` - Team information, colors, categories, and captain assignments
- `team_members` - Players with jersey numbers, gender, photos
- `events` - Match day events with date filtering
- `matches` - Individual matches with referee assignments and results
- `referees` - Referee contact information and assignments

### Attendance & Cards
- `match_attendees` - Player check-ins for specific matches
- `general_attendees` - General event attendance tracking
- `match_cards` - Cards issued during matches with minutes and reasons

### Disciplinary System
- `player_disciplinary_records` - Complete disciplinary tracking with:
  - Card type and detailed reasons
  - Incident dates and event descriptions
  - Suspension match counts
  - Suspension served status and dates
  - External competition records

## API Endpoints

### Core Data
- `GET /api/health` - Health check and version info
- `GET /api/teams` - Retrieve all teams with complete member data
- `POST /api/teams` - Save teams and member information
- `GET /api/events` - Retrieve events with matches, attendance, and cards
- `POST /api/events` - Save complete event data
- `GET /api/referees` - Retrieve referee information
- `POST /api/referees` - Save referee data

### Disciplinary System
- `GET /api/disciplinary-records` - Retrieve disciplinary records (with optional member filter)
- `POST /api/disciplinary-records` - Save disciplinary records with suspension tracking
- `POST /api/cleanup-disciplinary` - Administrative cleanup for database resets
- `GET /api/debug-disciplinary` - Debug endpoint for troubleshooting

## Card Reasons System

### Yellow Card Reasons
- Unsporting behavior
- Dissent by word or action
- Persistent infringement
- Delaying the restart of play
- Failure to respect distance
- Entering/leaving without permission
- Sliding
- Reckless/aggressive challenge
- Denial of a goal scoring opportunity
- Stopping a promising attack

### Red Card Reasons
- Serious foul play
- Violent conduct
- Spitting
- Offensive/insulting language
- Second yellow card

## Suspension Management

### Automatic Tracking
- **Red Card Suspensions**: Automatically track suspension match counts
- **Served Date Recording**: Log exact dates when suspensions are completed
- **Status Indicators**: Visual indicators for pending (⏳) vs served (✅) suspensions
- **Profile Integration**: Complete suspension history in player profiles

### Administrative Features
- **Prior Record Entry**: Add disciplinary records from external competitions
- **Bulk Management**: Edit multiple disciplinary records per player
- **Data Migration**: Clean database resets with preservation options

## Quick Start

### Railway Deployment (Recommended)

1. **Fork Repository**: Fork this repository to your GitHub account

2. **Railway Setup**:
   - Connect your GitHub repo to Railway
   - Add PostgreSQL service
   - Railway auto-deploys with DATABASE_URL

3. **Access**: Your app will be available at `yourapp.up.railway.app`

### Local Development

1. **Prerequisites**: PHP 8.2+ with PostgreSQL extension

2. **Environment Setup**:
   ```bash
   # Set your PostgreSQL connection
   export DATABASE_URL="postgres://user:pass@localhost:5432/checkin"
   ```

3. **Start Development Server**:
   ```bash
   php -S localhost:8080 api.php
   ```

4. **Open**: http://localhost:8080

### Docker Deployment

1. **Build Container**:
   ```bash
   docker build -t checkin-app .
   ```

2. **Run with PostgreSQL**:
   ```bash
   docker run -p 8080:80 -e DATABASE_URL="your_postgres_url" checkin-app
   ```

## File Structure

```
CheckInApp-Fresh/
├── index.html          # Main application interface
├── view.html           # View-only public interface
├── app.js             # Main application logic (v2.16.6)
├── view-app.js        # View-only application logic
├── api.php            # PHP REST API with PostgreSQL
├── manifest.json      # PWA manifest
├── favicon.ico        # App icon
├── Dockerfile         # Railway deployment container
├── .htaccess          # Apache URL rewriting
└── README.md          # This documentation
```

## Usage Guide

### Team Management
1. **Create Teams**: Add teams with custom colors and categories (Over 30, Over 40)
2. **Add Players**: Include jersey numbers, gender, and photos
3. **Assign Captains**: Designate team leaders with crown indicators

### Event & Match Management  
1. **Create Events**: Set up match days with dates and descriptions
2. **Schedule Matches**: Assign home/away teams with referee assignments
3. **Track Attendance**: Real-time player check-ins for matches
4. **Record Results**: Enter scores and match status

### Disciplinary System
1. **Live Cards**: Issue cards during matches with specific reasons and minutes
2. **Prior Records**: Add disciplinary history from external competitions
3. **Suspension Tracking**: Monitor suspension status and completion dates
4. **Player Profiles**: View complete disciplinary history chronologically

### View-Only Mode
- **Public Access**: Share `view.html` for spectator viewing
- **Match Editing**: Limited editing capabilities for match results
- **Real-time Updates**: Live attendance and card tracking

## Technical Specifications

- **PHP Version**: 8.2+
- **Database**: PostgreSQL 13+ with advanced indexing
- **Web Server**: Apache with mod_rewrite
- **Frontend**: Progressive Web App (PWA) with service worker
- **API Design**: RESTful with comprehensive error handling
- **Security**: Input validation, parameterized queries, CSRF protection
- **Performance**: Database indexing, optimized queries, caching headers

## Version History

- **v2.16.6**: 🐛 **Teams Loading Fix** - Fixed Teams section stuck on "Loading teams..." by ensuring renderTeams() is always called when switching to Teams section, regardless of whether teams data was already loaded during initialization.
- **v2.16.5**: 🚀 **Performance Optimization** - Optimized player profile loading from 1.5 seconds to under 200ms (~87% improvement). Eliminated triple nested loops, implemented team lookup caching, and optimized DOM string building for faster modal rendering.
- **v2.16.4**: 🐛 **Lazy Loading Fix** - Fixed "Unknown Team" issue on initial page load by ensuring teams data is loaded during app initialization. Added debugging for team lookup issues.
- **v2.16.2**: 🐛 **Photo Display Fix** - Enhanced debugging and UI refresh logic to ensure uploaded photos display immediately in player profiles. Added comprehensive logging for photo upload tracking.
- **v2.16.1**: 🚀 **Photo Upload Architecture Fix** - Eliminated massive 102KB teams POST requests during photo uploads. Photos now upload directly via `/api/photos` endpoint without triggering full teams data sync. Major performance improvement for photo operations.
- **v2.14.11**: Added tactical foul card reasons (denial of opportunity, stopping attacks)
- **v2.14.10**: Added reckless/aggressive challenge card reason
- **v2.14.9**: Suspension served date tracking
- **v2.14.8**: Boolean parameter fixes, header cleanup
- **v2.14.7**: Enhanced suspension tracking system
- **v2.14.6**: Added "Sliding" card reason
- **v2.14.x**: Complete disciplinary records system
- **v2.x**: PostgreSQL migration, referee management, match results
- **v2.0**: Complete rewrite in PHP 8 with enhanced features

## Database Migration & Cleanup

The app includes built-in database migration and cleanup tools:

### Automatic Schema Updates
- Tables and indexes are automatically created/updated on deployment
- New columns are added with `IF NOT EXISTS` for safe upgrades
- Foreign key constraints ensure data integrity

### Administrative Tools
- **Cleanup Endpoint**: `POST /api/cleanup-disciplinary` for fresh starts
- **Debug Tools**: Comprehensive logging for troubleshooting
- **Version Tracking**: Built-in version management across deployments

---

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>