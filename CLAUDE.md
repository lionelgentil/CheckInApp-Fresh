# CheckIn App - Claude Context & Development History

## Current Version: 6.0.0

### Project Overview
CheckIn App for BUSC PASS - A comprehensive soccer league management system with advanced mobile features, disciplinary tracking, and performance optimizations. Built with PHP backend (PostgreSQL) and modular JavaScript frontend, deployed on Railway cloud platform.

## Current Architecture Status (v6.0.0)

### File Structure & Line Counts
- **app.js** (6,462 lines): Main admin application with full team management
- **view-app.js** (4,414 lines): View-only interface optimized for mobile referees  
- **api.php** (2,960 lines): RESTful API backend with PostgreSQL integration
- **core.js** (540 lines): Shared functionality and error handling utilities
- **team-rendering-helpers.js** (304 lines): Refactored rendering methods
- **styles.css** (2,222 lines): Responsive CSS with mobile-first design
- **index.html** (2,889 lines): Admin interface template
- **view.html** (2,683 lines): Public view interface template

### Recent Development Progress (Commits 6.0.0-FIX-4 through FIX-13)
Based on git history, significant work has been done on the view-app.js with multiple fixes:
- **FIX-13** (Latest): 50 insertions, 12 deletions in view-app.js
- **FIX-10**: Added DEBUG functionality (30 insertions, 2 deletions)
- **FIX-4 through FIX-9**: Progressive improvements to view application

### Major Technical Features Implemented

#### 🏆 Enhanced Mobile Experience (v6.0.0)
- **Collapsible Header**: Saves 20% of mobile screen space
- **75px Player Photos**: Increased from 50px for better mobile visibility
- **Collapsible Card Summary**: Team-specific disciplinary overview for referees
- **Current vs Lifetime Cards**: Clear distinction with emoji indicators (🟨🟥)
- **Touch-Optimized Interface**: Improved touch targets and visual feedback

#### 🚀 Performance Architecture
- **Epoch Timestamp System**: Pure epoch timestamps for reliable timezone handling across Pacific timezone
- **PostgreSQL Optimization**: Native prepared statements and connection pooling
- **Railway Cloud Deployment**: Persistent photo storage with automatic fallbacks
- **Database Keep-Alive**: Prevents cold starts with warming system
- **API Caching**: Smart caching with query optimization

#### 🔐 Authentication & Security
- **Session-Based Auth**: 1-hour timeout with automatic refresh
- **Protected Admin Endpoints**: Full CRUD operations require authentication
- **View-Only Public Access**: Safe operations for referee interface
- **Secure Photo Management**: Authentication required for uploads

#### 📊 Advanced Disciplinary System
- **Current Season vs Lifetime**: Clear separation of disciplinary records
- **Suspension Management**: Automatic tracking and enforcement
- **Card Assignment**: Only checked-in players can receive cards
- **Cross-Season Preservation**: Historical data maintained across seasons
- **Referee Tools**: Mobile-optimized card overview for match-day decisions

### API Endpoints (Current)
```
GET/POST  /api/teams              - Full team management
GET/POST  /api/teams-no-photos    - Fast loading without photos  
GET/POST  /api/teams-basic        - Lightweight team data
GET/POST  /api/teams-specific     - Load specific teams by IDs
GET/POST  /api/events             - Event/match management
GET/POST  /api/referees           - Referee management
GET/POST  /api/disciplinary-records - Advanced disciplinary tracking
POST      /api/photos             - Photo uploads with fallbacks
POST      /api/attendance         - Attendance updates (no auth)
POST      /api/match-results      - Match results for view interface
POST      /api/players/cards      - Card assignment for referees
GET       /api/health             - System health check
GET       /api/keep-alive         - Database warming
GET       /api/version            - Returns v6.0.0
```

### Core Functionality Classes

#### CheckInCore Class (core.js)
- **Error Handling**: Centralized error management with user-friendly messages
- **API Management**: Consistent API calls with session handling
- **Caching System**: Smart caching with cache invalidation
- **Utility Functions**: Shared functionality across applications

#### Timezone Handling Functions
- **epochToPacificDate()**: Convert epoch to Pacific timezone date display
- **epochToPacificTime()**: Convert epoch to Pacific timezone time display  
- **epochToPacificDateTime()**: Combined date/time conversion
- All functions handle America/Los_Angeles timezone consistently

### Development Patterns Established

#### Error Handling Pattern
```javascript
// Centralized error handling with user-friendly messages
this.handleError(error, 'context description', showToUser);
```

#### API Call Pattern
```javascript
// Consistent API calls with session management
const response = await fetch('/api/endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});

if (response.status === 401) {
    this.handleSessionExpired();
    return;
}
```

#### Photo Loading Pattern
```javascript
// Lazy loading with fallbacks
${this.getLazyImageHtml(member, cssClass)}
// Followed by batched photo loading
```

### Deployment Configuration (Railway)
- **Database**: PostgreSQL with DATABASE_URL environment variable
- **Photo Storage**: Persistent volumes at `/app/storage/photos`
- **Keep-Alive System**: Database warming to prevent cold starts
- **Performance**: Gzip compression and optimized queries
- **Authentication**: Session-based with configurable timeout

### Mobile-First Design Principles
- **Responsive Breakpoints**: 320px+ mobile-first design
- **Touch Targets**: Optimized button sizes for mobile interaction
- **Progressive Enhancement**: Graceful degradation for older browsers  
- **Performance**: Lazy loading and smart caching for mobile networks
- **Referee-Optimized**: Specific features for match-day referee use

### Database Schema (PostgreSQL)
- **teams**: Team management with categories
- **team_members**: Player rosters with soft delete support
- **events**: Match days and tournaments with epoch timestamps
- **matches**: Individual match configuration and results
- **referees**: Referee contact information
- **player_disciplinary_records**: Advanced disciplinary tracking
- **match_attendance**: Check-in records with timestamps

### Testing Checklist for v6.0.0
- [ ] Mobile header collapses correctly
- [ ] Player photos display at 75px in check-in grid
- [ ] Card summary shows team-specific disciplinary info
- [ ] Current season vs lifetime cards display correctly
- [ ] Authentication system works with 1-hour timeout
- [ ] Database keep-alive prevents cold starts
- [ ] Photo uploads work with Railway storage
- [ ] Epoch timestamp conversions display Pacific time
- [ ] View-only interface works without authentication
- [ ] API endpoints return correct v6.0.0 version

### Known Technical Debt & Future Improvements
1. **WebP Image Optimization**: Convert photos to WebP for better performance
2. **Service Worker**: Implement for offline capability and caching
3. **Bundle Optimization**: Consider module bundling for production
4. **Progressive Web App**: Enhanced mobile app-like experience  
5. **Real-time Updates**: WebSocket integration for live updates
6. **Advanced Analytics**: More detailed performance and usage metrics

### Development Commands
```bash
# Version check
curl https://checkinapp-fresh-production.up.railway.app/api/version

# Health check  
curl https://checkinapp-fresh-production.up.railway.app/api/health

# Database warming
curl https://checkinapp-fresh-production.up.railway.app/api/keep-alive

# Railway database connection
railway connect postgres

# Local development
php -S localhost:8000 router.php
```

### Code Quality Standards
- **ES6+ JavaScript**: Modern syntax with class-based architecture
- **Mobile-First CSS**: Responsive design with performance optimization
- **Error Handling**: Comprehensive error management with user feedback
- **Security**: Authentication required for admin operations
- **Performance**: Optimized queries, caching, and lazy loading
- **Maintainability**: Clear separation of concerns and modular design

---

*CheckIn App v6.0.0 - Current state as of session recovery. Ready for continued development and enhancements.*
