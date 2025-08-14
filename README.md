# CheckIn App v2.0 - PHP Edition

A modern team and event management application built with PHP 8 and SQLite, designed for easy deployment on Railway or any container platform.

## Features

- ✅ **Team Management**: Create, edit, and delete teams with custom colors
- ✅ **Member Management**: Add team members with jersey numbers, gender, and photo upload
- ✅ **Event Management**: Create and manage match day events
- ✅ **Match System**: Set up matches between teams with detailed match management
- ✅ **Player Check-ins**: Individual player attendance tracking for matches
- ✅ **Responsive Design**: Modern UI that works on desktop and mobile
- ✅ **Progressive Web App**: PWA-ready with manifest and offline capabilities
- ✅ **RESTful API**: Clean PHP API with complete CRUD operations
- ✅ **Container Ready**: Dockerized for easy deployment

## Architecture

- **Backend**: PHP 8.2 with Apache
- **Database**: SQLite with relational schema (6 tables)
- **Frontend**: Vanilla JavaScript SPA
- **Styling**: Modern CSS with responsive design
- **Container**: Docker with PHP 8.2-apache base image

## Database Schema

- `teams` - Team information and colors
- `team_members` - Players with jersey numbers, gender, photos
- `events` - Match day events
- `matches` - Individual matches between teams
- `match_attendees` - Player check-ins for specific matches
- `general_attendees` - General event attendance tracking

## API Endpoints

- `GET /api/health` - Health check and system info
- `GET /api/teams` - Retrieve all teams with members
- `POST /api/teams` - Save teams data
- `GET /api/events` - Retrieve all events with matches
- `POST /api/events` - Save events data

## Quick Start

### Local Development

1. **Prerequisites**: PHP 8.2+ with SQLite extension

2. **Initialize Database**:
   ```bash
   php init_db.php
   ```

3. **Start Development Server**:
   ```bash
   php -S localhost:8080 router.php
   ```

4. **Open**: http://localhost:8080

### Docker Deployment

1. **Build Container**:
   ```bash
   docker build -t checkin-app .
   ```

2. **Run Container**:
   ```bash
   docker run -p 8080:80 checkin-app
   ```

### Railway Deployment

1. **Connect to Railway**:
   ```bash
   railway login
   railway link
   ```

2. **Deploy**:
   ```bash
   railway up
   ```

The app will automatically build using the included Dockerfile and deploy as a containerized PHP application.

## File Structure

```
CheckInApp-Fresh/
├── index.html          # Frontend interface
├── app.js             # JavaScript application logic
├── api.php            # PHP REST API
├── init_db.php        # Database initialization
├── router.php         # Development server router
├── manifest.json      # PWA manifest
├── Dockerfile         # Container configuration
├── .htaccess          # Apache URL rewriting
└── data/              # SQLite database (auto-created)
```

## Usage

1. **Teams**: Create teams with custom colors and descriptions
2. **Members**: Add players with jersey numbers, gender selection, and photo upload
3. **Events**: Create match day events with dates and descriptions
4. **Matches**: Set up home vs away team matches within events
5. **Check-ins**: Click on players in match view to toggle attendance
6. **Management**: Edit or delete teams, members, events, and matches as needed

## Technical Details

- **PHP Version**: 8.2+
- **Database**: SQLite with foreign key constraints
- **Web Server**: Apache with mod_rewrite
- **Frontend**: Progressive Web App (PWA) ready
- **API**: RESTful design with JSON responses
- **Security**: Input validation, SQL injection protection
- **Performance**: Indexed database queries, optimized API responses

## Version History

- **v2.0**: Complete rewrite in PHP 8 with SQLite backend
- **v1.x**: Original Node.js version (deprecated)

---

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>