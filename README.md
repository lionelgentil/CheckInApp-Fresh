# CheckIn App v6.4.0

A comprehensive soccer league management system designed for recreational adult leagues. Features team management, event scheduling, player check-ins, disciplinary tracking, referee personalization, and season management with advanced PostgreSQL backend.

## 🏆 Features

### Team Management
- **Team Registration**: Create and manage teams with categories (Over 30, Over 40)
- **Player Rosters**: Add/remove players with photos, jersey numbers, and captain designation
- **Player Profiles**: Complete disciplinary history with current season and lifetime records
- **Photo Management**: Upload and manage player photos with Railway volume storage and fallback systems
- **Member Management**: Soft delete (deactivate) and reactivate players to preserve disciplinary records

### Event & Match Management
- **Event Creation**: Schedule tournaments and match days with epoch-based timestamps
- **Match Setup**: Configure home/away teams, referees, fields, and times
- **Real-time Check-ins**: ECNL-style grid interface with 75px player photos for mobile
- **Match Results**: Score tracking, match status, and referee assignment
- **Check-in Locking**: Automatic lock 2h 40min after match start to preserve integrity

### Referee Personalization System ⭐ NEW
- **Individual Referee Access**: Each referee selects their name on first app load
- **Personalized Game View**: Referees only see matches they are officiating
- **Guest Mode**: Special "Guest" access to view all games for supervisors
- **Mobile-Optimized Interface**: 3-column grid layout for efficient referee selection
- **Persistent Selection**: Referee choice stored locally for seamless experience
- **Navigation Lock**: Prevents access to other sections until referee is selected

### Advanced Disciplinary System
- **Card Tracking**: Issue yellow and red cards with detailed reasons and match context
- **Current Season vs Lifetime**: Clear distinction between current season and career statistics
- **Collapsible Card Summary**: Mobile-optimized summary showing players with cards for referees
- **Suspension Management**: Automatic suspension tracking for red cards
- **Suspension Enforcement**: Prevents suspended players from checking in
- **Cross-Season Tracking**: Disciplinary records preserved across season transitions

### Season Management
- **Season Overview**: Current season statistics and pending suspensions
- **Data Migration**: Seamless transition between seasons with complete audit trail
- **Archive System**: Preserve historical data while starting fresh seasons
- **Validation**: Prevents season closure with unresolved suspensions

### Reporting & Analytics
- **League Standings**: Real-time standings by division with points, goals, and rankings
- **Card Tracker**: Comprehensive disciplinary report with filters and search
- **Player Statistics**: Individual player performance and discipline records
- **Season Summary**: Complete overview of events, matches, and cards

## 🎯 User Interfaces

### Main Admin Interface (`index.html`)
- Full administrative control with authentication system
- Team, event, and referee management
- Match result entry and card issuance
- Season management and data migration
- Complete CRUD operations with optimistic UI updates

### View-Only Interface (`view.html`) ⭐ ENHANCED
- **Referee Personalization**: Individual referee selection on first load
- **Filtered Game View**: Shows only matches for selected referee
- **Guest Access Mode**: Full visibility for league supervisors
- **Mobile-Optimized Design**: 3-column referee selection grid
- **Enhanced Security**: Navigation disabled until referee selection
- **Mobile-optimized** with collapsible header (saves 20% screen space)
- Player check-ins with enhanced card summary for referees
- Real-time disciplinary information display

## 🏗️ Technical Architecture

### Frontend
- **Pure JavaScript** (ES6+) with modular class-based architecture
- **Responsive CSS** with mobile-first design and collapsible headers
- **Progressive Web App** capabilities
- **Real-time UI updates** with optimistic rendering
- **Performance Optimized**: Smart caching, lazy loading, and batched DOM updates

### Backend Integration
- **PostgreSQL Database** with epoch timestamp system for better performance
- **Railway Cloud Hosting** with persistent volume storage for photos
- **Photo Management**: Multi-tier storage (Railway volume → fallback → legacy)
- **Keep-alive System**: Database warming to prevent cold starts
- **API Performance**: Optimized queries with caching and connection pooling

### Enhanced API Endpoints
```
GET/POST  /api/teams              - Team management with member lifecycle
GET/POST  /api/teams-no-photos    - Fast team loading without photo data
GET/POST  /api/teams-basic        - Lightweight teams for performance
GET/POST  /api/teams-specific     - Load specific teams by IDs
GET/POST  /api/events             - Event and match data with epoch timestamps
GET/POST  /api/referees           - Referee management
GET/POST  /api/disciplinary-records - Advanced disciplinary tracking
POST      /api/photos             - Photo uploads with fallback storage
POST      /api/attendance         - Attendance-only updates (no auth required)
POST      /api/match-results      - Match results for view interface
POST      /api/players/cards      - Card assignment for referees
GET       /api/health             - System health with database ping
GET       /api/keep-alive         - Database warming endpoint
GET       /api/version            - Version information (v6.4.0)
```

## 🚀 Getting Started

### Prerequisites
- Web server with PHP 7.4+ support
- PostgreSQL database (Railway recommended)
- Modern web browser with ES6+ support

### Railway Deployment
1. Connect your GitHub repository to Railway
2. Add PostgreSQL service and connect DATABASE_URL
3. Configure environment variables
4. Deploy with automatic photo storage setup

### Local Development
1. Clone the repository
2. Configure PostgreSQL connection in environment
3. Set up photo storage directories
4. Run with PHP built-in server: `php -S localhost:8000 router.php`

### Initial Setup
1. **Database Initialization**: Automatic PostgreSQL schema creation
2. **Create Teams**: Add your league teams with player rosters
3. **Add Referees**: Register referees with contact information
4. **Schedule Events**: Create match days and configure matches
5. **Configure Photos**: Ensure photo storage permissions

## 📱 Enhanced Mobile Features

### Advanced Check-in Interface
- **75x75px Player Photos**: Larger photos for better mobile visibility
- **Collapsible Card Summary**: Team-specific disciplinary overview for referees
- **Current vs Lifetime Cards**: Clear distinction with emoji indicators (🟨🟥)
- **Touch-Optimized Grid**: Improved touch targets and visual feedback
- **Removed Footer Clutter**: More space for player grid

### Mobile-First Design Improvements
- **Collapsible Header**: Tap to collapse, saves 20% screen space
- **Responsive Navigation**: Optimized button sizes for mobile
- **Performance Optimized**: Fast loading with cached data
- **Progressive Enhancement**: Works on all devices and connection speeds

### Referee-Specific Features
- **Quick Card Overview**: See which players have cards before check-in
- **Team Separation**: Card summary shows only current team's disciplinary info
- **Visual Indicators**: Easy-to-read emoji system for card types and counts
- **Expandable Details**: Tap to see full card breakdown per player

## 🔐 Advanced Authentication & Security

### Admin Authentication System
- **Session-based Authentication**: 1-hour timeout with automatic refresh
- **Protected Endpoints**: All admin operations require authentication
- **View-Only Access**: Public interface with limited, safe operations
- **Secure Photo Uploads**: Authentication required for photo management

### Data Integrity Features
- **Epoch Timestamps**: Consistent time handling across timezones
- **Database Constraints**: Foreign key relationships preserve data integrity
- **Soft Deletes**: Member deactivation preserves disciplinary history
- **Transaction Safety**: Database transactions for critical operations

## 🔧 Performance Optimizations

### Database Performance
- **PostgreSQL Optimization**: Native prepared statements and persistent connections
- **Query Caching**: Smart caching system for disciplinary records
- **Index Optimization**: Strategic indexes for time-based and relationship queries
- **Connection Pooling**: Persistent connections with keep-alive system

### Frontend Performance
- **Lazy Loading**: Player photos load on demand
- **Smart Caching**: API response caching with cache invalidation
- **Batched DOM Updates**: Efficient rendering for large datasets
- **Optimistic UI**: Immediate feedback with background validation

### Railway Cloud Optimizations
- **Database Warming**: Keep-alive system prevents cold starts
- **Photo Storage**: Multi-tier storage system with Railway volumes
- **Gzip Compression**: Automatic response compression
- **CDN-Ready**: Static assets optimized for content delivery

## 📊 Enhanced Reporting Features

### Disciplinary Dashboard
- **Collapsible Team Cards**: Quick overview of players with cards
- **Current Season Focus**: Immediate visibility of current season issues
- **Lifetime Context**: Full career statistics available on demand
- **Referee Tools**: Designed specifically for match-day decision making

### Advanced Analytics
- **Performance Metrics**: Database response times and system health
- **Usage Statistics**: Team engagement and check-in patterns
- **Disciplinary Trends**: Card issuance patterns by team and season
- **Photo Management**: Storage usage and upload success rates

## 🎨 Modern UI/UX Design

### Card Summary Styling
- **Attention-Grabbing Design**: Red gradient header for urgency
- **Dark Theme Content**: High contrast for mobile readability
- **Modern Typography**: SF Pro Display font with proper weight hierarchy
- **Interactive Elements**: Hover effects and smooth animations

### Responsive Breakpoints
- **Mobile First**: Optimized for 320px+ screens
- **Tablet Optimized**: Enhanced layouts for 768px+ screens
- **Desktop Enhanced**: Full-featured interface for 1024px+ screens
- **Progressive Enhancement**: Graceful degradation for older browsers

## 📝 Version History

### v6.4.0 (Current) - Manual Lock Toggle System
- 🔒 **Manual Lock Toggle for Referees**:
  - 🎮 Manual lock/unlock toggle in View app for referees
  - 🔐 Prevents accidental check-ins while reviewing player information
  - 💾 Persistent lock state stored locally per match
  - 🎯 Large, prominent toggle button in match header
  - 👁️ Visual feedback for locked players without grayout effect
- 🐛 **UI/UX Improvements**:
  - 🎨 Repositioned lock icon on player badges to avoid overlap with check marks
  - 📱 Enhanced readability - removed grayout effect on locked players
  - ⚡ Improved player grid interaction with clear visual hierarchy
  - 🔍 Better lock status indication and user feedback

### v6.3.0 (Previous) - Referee Personalization System
- 🎯 **Revolutionary Referee Experience**:
  - 👤 Individual referee selection on app launch
  - 🎮 Personalized game filtering - referees only see their assigned matches
  - 👨‍💼 Guest mode for supervisors with full visibility
  - 📱 Mobile-optimized 3-column referee selection grid
  - 🔒 Navigation lock prevents access until referee selection
  - 💾 Persistent referee selection stored locally
- 🐛 **Interface Improvements**:
  - 🎨 Consistent styling for Guest referee option (removed blue theme)
  - 📱 Enhanced mobile layout - 3 columns for iPhone 16 Pro and similar devices
  - 🔍 Advanced debugging with detailed match filtering logs
  - ⚡ Optimized event and match-level filtering logic
- 🛡️ **Enhanced Security & UX**:
  - 🚫 Complete navigation disable until referee selection
  - 👁️ Visual feedback with dimmed unavailable sections
  - 🔄 Smooth referee change workflow with localStorage management

### v6.0.0 (Previous) - Major Mobile & Performance Update
- 🏆 **Enhanced Mobile Check-in Experience**:
  - 📱 Collapsible header saves 20% of mobile screen space
  - 📸 Increased player photos from 50px to 75px for better visibility
  - ⚡ Removed footer clutter, more space for player cards
- 🎯 **Advanced Disciplinary Features**:
  - 📋 Collapsible card summary showing current team's disciplinary overview
  - 🟨🟥 Clear distinction between current season and lifetime cards
  - 👨‍⚽️ Referee-optimized design for match-day decision making
- 🚀 **Performance & Infrastructure**:
  - 🐘 Complete PostgreSQL optimization with epoch timestamps
  - ☁️ Railway cloud deployment with persistent photo storage
  - 🔄 Database keep-alive system prevents cold starts
  - 💾 Multi-tier photo storage with automatic fallbacks
- 🔧 **Technical Improvements**:
  - 🔐 Enhanced authentication system with better session management
  - 📊 Advanced API endpoints for optimized data loading
  - 🏃‍♂️ Smart caching and performance optimizations
  - 🛡️ Improved data integrity with soft deletes and foreign key constraints

### v5.5.3 (Previous)
- 🎯 Enhanced Card Assignment: Card selection only shows checked-in players
- 🛡️ Data Integrity: Prevents cards for non-present players
- 👥 Better UX: Jersey numbers and attendance counts
- 📱 View-only improvements: Optimized interface

### v4.x Series
- Season Management system
- Suspension enforcement
- Mobile-optimized interfaces
- Performance improvements
- Authentication system

## 🤝 Support & Troubleshooting

### Common Issues
1. **Photo Upload Issues**: Check Railway volume permissions and fallback directories
2. **Database Connection**: Verify PostgreSQL DATABASE_URL environment variable
3. **Authentication Problems**: Clear browser cache and check session timeout
4. **Mobile Performance**: Ensure latest browser version with ES6+ support

### Performance Monitoring
- **Health Endpoint**: `/api/health` provides system status and database ping times
- **Keep-Alive Monitoring**: `/api/keep-alive` shows database warming status
- **Version Check**: `/api/version` confirms current deployment version

### Railway-Specific Support
- **Environment Variables**: Ensure DATABASE_URL is properly connected
- **Volume Storage**: Verify persistent storage is mounted at `/app/storage/photos`
- **Cold Start Issues**: Monitor keep-alive script execution
- **Build Logs**: Check Railway deployment logs for initialization errors

## 📄 License & Compliance

This application is designed for recreational soccer league management with focus on:
- **Data Privacy**: Secure handling of player information
- **GDPR Compliance**: Right to deletion with data preservation needs
- **Photo Rights**: Proper consent and usage policies
- **Performance Standards**: Optimized for mobile referee use

---

**CheckIn App v6.4.0** - Advanced Soccer League Management System
*Referee Personalization • Mobile Optimized • PostgreSQL Powered • Railway Cloud Ready*