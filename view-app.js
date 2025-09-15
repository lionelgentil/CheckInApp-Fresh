/**
 * CheckIn App v6.3.0 - View Only Mode
 * Read-only version for public viewing
 * Enhanced with referee personalization and event filtering
 */

// Utility function to convert epoch timestamp to Pacific timezone display
function epochToPacificDate(epochTimestamp, options = {}) {
    if (!epochTimestamp) return 'No date';
    
    const date = new Date(epochTimestamp * 1000); // Convert seconds to milliseconds
    
    const defaultOptions = {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'short', 
        day: 'numeric'
    };
    
    return date.toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

// Utility function to convert epoch timestamp to Pacific timezone time display  
function epochToPacificTime(epochTimestamp, options = {}) {
    if (!epochTimestamp) return 'No time';
    
    const date = new Date(epochTimestamp * 1000); // Convert seconds to milliseconds
    
    const defaultOptions = {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };
    
    return date.toLocaleTimeString('en-US', { ...defaultOptions, ...options });
}

// Utility function to determine season from event date (matches API logic)
function getEventSeason(eventEpoch) {
    const eventDate = new Date(eventEpoch * 1000);
    const eventYear = eventDate.getFullYear();
    const eventMonth = eventDate.getMonth() + 1; // getMonth() returns 0-11, we need 1-12
    
    if (eventMonth >= 1 && eventMonth <= 6) {
        // January 1st to June 30th -> Spring Season
        return `${eventYear}-Spring`;
    } else {
        // July 1st to December 31st -> Fall Season
        return `${eventYear}-Fall`;
    }
}

// Utility function to convert epoch timestamp to Pacific timezone date and time
function epochToPacificDateTime(epochTimestamp) {
    if (!epochTimestamp) return 'No date/time';
    
    const date = new Date(epochTimestamp * 1000);
    
    return date.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Utility function to get current epoch timestamp
function getCurrentEpochTimestamp() {
    return Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
}

class CheckInViewApp {
    constructor() {
        this.teams = []; // Full team data (loaded on demand)
        this.teamsBasic = []; // Lightweight team data (loaded by default)
        this.hasCompleteTeamsData = false; // Track if we have full teams data vs partial
        this.events = [];
        this.referees = [];
        this.currentModalType = null;
        this.cachedSuspensions = null; // Cache for suspension data
        this.selectedRefereeId = null; // Track selected referee for filtering
        this.selectedRefereeName = null; // Track selected referee name for display
        
        this.init();
    }
    
    // Centralized API request handler with session management (same as main app)
    async apiRequest(url, options = {}) {
        try {
            const response = await fetch(url, options);
            
            // Handle 401 Unauthorized - session expired
            if (response.status === 401) {
                console.warn('🔐 Session expired (401), redirecting to re-authenticate...');
                this.handleSessionExpired();
                return; // Don't continue processing
            }
            
            if (response.ok) {
                return await response.json();
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
        } catch (error) {
            // Don't handle network errors as session issues
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error('Network error:', error);
                throw new Error('Network error - please check your connection');
            }
            throw error;
        }
    }
    
    // Handle session expiration (view app version)
    handleSessionExpired() {
        // Close any open modals
        this.closeModal();
        this.closeLoadingModal();
        
        // Show user-friendly message
        const message = `
            🔐 Your session has expired for security reasons.
            
            You will be redirected to re-authenticate.
            
            Don't worry - this is normal after being idle!
        `;
        
        if (confirm(message)) {
            // Redirect to refresh the page and trigger re-authentication
            window.location.reload();
        } else {
            // User cancelled, still reload to show login
            setTimeout(() => {
                window.location.reload();
            }, 3000); // Give them 3 seconds then reload anyway
        }
    }
    
    // API calls with 401 handling for view app
    async fetch(url, options = {}) {
        return await this.apiRequest(url, options);
    }
    
    async init() {
        try {
            console.log('🚀 Initializing view app...');
            
            // Check if referee is already selected from localStorage
            const savedRefereeId = localStorage.getItem('selectedRefereeId');
            const savedRefereeName = localStorage.getItem('selectedRefereeName');
            
            console.log(`🔍 localStorage check: ID="${savedRefereeId}" (${typeof savedRefereeId}), Name="${savedRefereeName}"`);
            
            // Add URL parameter check to force referee selection
            const urlParams = new URLSearchParams(window.location.search);
            const forceSelection = urlParams.get('selectReferee') === 'true';
            
            if (forceSelection) {
                console.log('🔄 Force referee selection requested via URL parameter');
                localStorage.removeItem('selectedRefereeId');
                localStorage.removeItem('selectedRefereeName');
                this.selectedRefereeId = null;
                this.selectedRefereeName = null;
                await this.showRefereeSelection();
            } else if (savedRefereeId && savedRefereeName) {
                console.log('📋 Found saved referee selection:', savedRefereeName);
                this.selectedRefereeId = savedRefereeId;
                this.selectedRefereeName = savedRefereeName;
                console.log(`🎯 Set internal referee: ${this.selectedRefereeName} (${this.selectedRefereeId})`);
                await this.initializeApp();
            } else {
                console.log('👤 No referee selected, showing selection interface...');
                await this.showRefereeSelection();
            }
            
            console.log('✅ View app initialization complete');
        } catch (error) {
            console.error('❌ View app initialization failed:', error);
            // Show error to user instead of infinite loading
            const eventsContainer = document.getElementById('events-container');
            if (eventsContainer) {
                eventsContainer.innerHTML = `
                    <div class="error-message">
                        <h3>Failed to Load Application</h3>
                        <p>Error: ${error.message}</p>
                        <button onclick="location.reload()" class="btn btn-primary">Retry</button>
                    </div>
                `;
            }
        }
    }

    // Show referee selection interface
    async showRefereeSelection() {
        try {
            // Add CSS class to disable navigation
            document.body.classList.add('referee-selection-active');
            
            // Load referees data
            await this.loadReferees();
            
            // Hide all sections and show referee selection
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.remove('active');
            });
            
            // Create referee selection HTML
            const container = document.querySelector('.container');
            
            // Create referee selection section
            let refereeSection = document.getElementById('referee-selection-section');
            if (!refereeSection) {
                refereeSection = document.createElement('div');
                refereeSection.id = 'referee-selection-section';
                refereeSection.className = 'content-section active';
                container.appendChild(refereeSection);
            } else {
                refereeSection.classList.add('active');
            }
            
            refereeSection.innerHTML = `
                <div class="section-header">
                    <h2 class="section-title">Select Your Name</h2>
                </div>
                <div class="referee-selection-content">
                    <p>Please select your name from the list below to view only the games you are officiating:</p>
                    <div id="referee-list-container">
                        <div class="loading">Loading referees...</div>
                    </div>
                </div>
            `;
            
            // Render referee list
            this.renderRefereeSelectionList();
            
        } catch (error) {
            console.error('❌ Failed to show referee selection:', error);
        }
    }

    // Render the referee selection list
    renderRefereeSelectionList() {
        const container = document.getElementById('referee-list-container');
        if (!container) return;
        
        if (!this.referees || this.referees.length === 0) {
            container.innerHTML = '<div class="empty-state">No referees found</div>';
            return;
        }
        
        // Sort referees alphabetically, but keep "Guest" at the end
        const sortedReferees = [...this.referees].sort((a, b) => a.name.localeCompare(b.name));
        
        // Add Guest referee at the end
        const guestReferee = {
            id: 'guest',
            name: 'Guest',
            contact: 'Can view all games'
        };
        sortedReferees.push(guestReferee);
        
        const refereeListHtml = sortedReferees.map(referee => {
            const isGuest = referee.id === 'guest';
            return `
                <div class="referee-selection-item ${isGuest ? 'guest-referee' : ''}" onclick="app.selectReferee('${referee.id}', '${referee.name.replace(/'/g, "\\'")}')">
                    <div class="referee-info">
                        <div class="referee-name">${referee.name}</div>
                        <div class="referee-contact">${referee.contact || ''}</div>
                    </div>
                    <div class="select-arrow">→</div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="referee-list">
                ${refereeListHtml}
            </div>
        `;
    }

    // Handle referee selection
    async selectReferee(refereeId, refereeName) {
        try {
            console.log(`🎯 Referee selected: ${refereeName} (${refereeId})`);
            console.log(`🔍 Referee ID type: ${typeof refereeId}, value: "${refereeId}"`);
            
            this.selectedRefereeId = refereeId;
            this.selectedRefereeName = refereeName;
            
            // Save selection to localStorage
            localStorage.setItem('selectedRefereeId', refereeId);
            localStorage.setItem('selectedRefereeName', refereeName);
            
            console.log(`💾 Saved to localStorage: ${localStorage.getItem('selectedRefereeId')}, ${localStorage.getItem('selectedRefereeName')}`);
            
            // Remove CSS class to re-enable navigation
            document.body.classList.remove('referee-selection-active');
            
            // Hide referee selection and initialize app
            document.getElementById('referee-selection-section').classList.remove('active');
            
            await this.initializeApp();
            
        } catch (error) {
            console.error('❌ Failed to select referee:', error);
        }
    }

    // Initialize the main app after referee selection
    async initializeApp() {
        try {
            console.log(`🚀 Initializing app for referee: ${this.selectedRefereeName}`);
            
            // Update header to show selected referee
            this.updateHeaderWithReferee();
            
            // Load events and basic team info (lightweight) for initial display
            await Promise.all([
                this.loadEvents(),
                this.loadTeamsBasic() // Much faster - no player photos or details
            ]);
            
            // Debug referee and event data after loading
            this.debugRefereeEventData();
            
            console.log('✅ Data loaded, rendering events...');
            await this.renderEvents();
            
            console.log('✅ Events rendered, showing events section...');
            // Ensure Events section is shown by default
            this.showSection('events');
            
        } catch (error) {
            console.error('❌ App initialization failed:', error);
            throw error;
        }
    }

    // Debug method to check referee and event data
    debugRefereeEventData() {
        console.log('🔍 DEBUG: Referee and Event Data Analysis');
        console.log(`Selected Referee: "${this.selectedRefereeName}" (ID: "${this.selectedRefereeId}")`);
        console.log(`Total referees loaded: ${this.referees.length}`);
        console.log(`Total events loaded: ${this.events.length}`);
        
        // Show all referee IDs in the system
        const allRefereeIds = this.referees.map(r => ({id: r.id, name: r.name}));
        console.log('All referee IDs in system:', allRefereeIds);
        
        // Check if selected referee exists in referee list
        const selectedRefereeExists = this.referees.find(r => String(r.id) === String(this.selectedRefereeId));
        console.log('Selected referee exists in system:', selectedRefereeExists ? 'YES' : 'NO');
        
        // Analyze events and matches
        let totalMatches = 0;
        let matchesWithSelectedReferee = 0;
        
        this.events.forEach((event, eventIndex) => {
            console.log(`Event ${eventIndex + 1}: "${event.name}" (${event.matches?.length || 0} matches)`);
            
            if (event.matches) {
                event.matches.forEach((match, matchIndex) => {
                    totalMatches++;
                    const mainRefId = String(match.mainRefereeId || '');
                    const assistantRefId = String(match.assistantRefereeId || '');
                    const selectedRefId = String(this.selectedRefereeId || '');
                    
                    const hasSelectedReferee = (mainRefId === selectedRefId || assistantRefId === selectedRefId);
                    if (hasSelectedReferee) matchesWithSelectedReferee++;
                    
                    console.log(`  Match ${matchIndex + 1}: Main=${mainRefId}, Assistant=${assistantRefId}, HasSelected=${hasSelectedReferee}`);
                });
            }
        });
        
        console.log(`📊 Summary: ${totalMatches} total matches, ${matchesWithSelectedReferee} matches with selected referee`);
    }

    // Update header to show current referee and change option
    updateHeaderWithReferee() {
        const headerContent = document.getElementById('header-content');
        if (headerContent && this.selectedRefereeName) {
            // Find existing referee info or create it
            let refereeInfo = document.getElementById('referee-info');
            if (!refereeInfo) {
                refereeInfo = document.createElement('div');
                refereeInfo.id = 'referee-info';
                refereeInfo.style.cssText = `
                    background: rgba(255, 255, 255, 0.2);
                    padding: 5px 15px;
                    border-radius: 15px;
                    margin-top: 10px;
                    font-size: 0.85em;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                `;
                headerContent.appendChild(refereeInfo);
            }
            
            refereeInfo.innerHTML = `
                <span>👤 ${this.selectedRefereeName}</span>
                <button onclick="app.changeReferee()" style="
                    background: rgba(255, 255, 255, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    border-radius: 12px;
                    padding: 4px 8px;
                    font-size: 0.8em;
                    color: white;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onmouseover="this.style.background='rgba(255, 255, 255, 0.5)'" 
                   onmouseout="this.style.background='rgba(255, 255, 255, 0.3)'">
                    Change
                </button>
            `;
        }
        
        // Add mobile-specific referee info that's always visible
        this.updateMobileRefereeInfo();
    }

    // Add persistent referee info for mobile (always visible)
    updateMobileRefereeInfo() {
        if (!this.selectedRefereeName) return;
        
        const container = document.querySelector('.container');
        if (!container) return;
        
        // Find existing mobile referee info or create it
        let mobileRefereeInfo = document.getElementById('mobile-referee-info');
        if (!mobileRefereeInfo) {
            mobileRefereeInfo = document.createElement('div');
            mobileRefereeInfo.id = 'mobile-referee-info';
            mobileRefereeInfo.style.cssText = `
                background: rgba(255, 255, 255, 0.95);
                padding: 8px 15px;
                margin: 0 -20px 15px -20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                font-size: 0.9em;
                color: #333;
                border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                position: sticky;
                top: 0;
                z-index: 100;
            `;
            
            // Insert after the header but before main nav
            const mainNav = document.querySelector('.main-nav');
            if (mainNav) {
                container.insertBefore(mobileRefereeInfo, mainNav);
            } else {
                container.insertBefore(mobileRefereeInfo, container.firstChild);
            }
        }
        
        mobileRefereeInfo.innerHTML = `
            <span style="font-weight: 600;">👤 ${this.selectedRefereeName}</span>
            <button onclick="app.changeReferee()" style="
                background: #007bff;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 0.8em;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                touch-action: manipulation;
            " onmouseover="this.style.background='#0056b3'" 
               onmouseout="this.style.background='#007bff'"
               ontouchstart="this.style.transform='scale(0.95)'"
               ontouchend="this.style.transform='scale(1)'">
                Change Referee
            </button>
        `;
        
        // Show mobile info only on mobile devices
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const updateMobileVisibility = () => {
            if (mediaQuery.matches) {
                mobileRefereeInfo.style.display = 'flex';
            } else {
                mobileRefereeInfo.style.display = 'none';
            }
        };
        
        updateMobileVisibility();
        mediaQuery.addListener(updateMobileVisibility);
    }

    // Allow user to change referee selection
    async changeReferee() {
        try {
            console.log('🔄 Changing referee selection...');
            
            // Clear current selection
            this.selectedRefereeId = null;
            this.selectedRefereeName = null;
            localStorage.removeItem('selectedRefereeId');
            localStorage.removeItem('selectedRefereeName');
            
            // Show referee selection again (this will add the CSS class to disable navigation)
            await this.showRefereeSelection();
            
        } catch (error) {
            console.error('❌ Failed to change referee:', error);
        }
    }

    // Global function for debugging - reset referee selection
    resetRefereeSelection() {
        console.log('🔄 Resetting referee selection...');
        localStorage.removeItem('selectedRefereeId');
        localStorage.removeItem('selectedRefereeName');
        console.log('✅ Referee selection cleared. Reloading page...');
        window.location.reload();
    }
    
    // Season Management
    getCurrentSeason() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // JavaScript months are 0-indexed
        
        // Updated to match main app logic:
        // Spring season: Jan 1st to Jun 30th
        // Fall season: Jul 1st to Dec 31st
        if (month >= 1 && month <= 6) {
            return {
                type: 'Spring',
                year: year,
                startDate: new Date(year, 0, 1),  // Jan 1
                endDate: new Date(year, 5, 30)   // Jun 30
            };
        } else {
            return {
                type: 'Fall',
                year: year,
                startDate: new Date(year, 6, 1),  // Jul 1  
                endDate: new Date(year, 11, 31)  // Dec 31
            };
        }
    }
    
    isCurrentSeasonEvent(eventEpoch) {
        const currentSeason = this.getCurrentSeason();
        const eventEpochTime = eventEpoch * 1000; // Convert to milliseconds
        return eventEpochTime >= currentSeason.startDate.getTime() && eventEpochTime <= currentSeason.endDate.getTime();
    }
    
    // Lightweight team loading (just basic info for events display)
    async loadTeamsBasic() {
        try {
            console.log('🔄 Loading basic teams data...');
            const data = await this.fetch(`/api/teams-basic?_t=${Date.now()}`);
            this.teamsBasic = data;
            console.log(`✅ Loaded basic teams data: ${this.teamsBasic.length} teams`);
        } catch (error) {
            console.warn('❌ Teams-basic API not available, falling back to full teams API:', error);
            // Fallback to full API but extract only needed data
            await this.loadTeams();
            this.teamsBasic = this.teams.map(team => ({
                id: team.id,
                name: team.name,
                category: team.category,
                colorData: team.colorData,
                memberCount: team.members ? team.members.length : 0
            }));
            console.log(`✅ Fallback: extracted basic data from ${this.teamsBasic.length} teams`);
        }
    }

    // Full team loading (with all player data) - only when needed
    async loadTeams() {
        try {
            const data = await this.fetch(`/api/teams-no-photos?_t=${Date.now()}`);
            this.teams = data;
            this.hasCompleteTeamsData = true; // Mark that we have complete data
            console.log('🔍 Loaded full teams data:', this.teams.length, 'teams with all player details');
        } catch (error) {
            console.error('Failed to load teams:', error);
            this.teams = [];
            this.hasCompleteTeamsData = false;
        }
    }
    
    // Load only specific teams for performance optimization
    async loadSpecificTeams(teamIds) {
        if (!teamIds || teamIds.length === 0) return [];
        
        try {
            // Check if we already have these teams loaded
            const missingTeamIds = teamIds.filter(teamId => 
                !this.teams.some(t => t.id === teamId)
            );
            
            if (missingTeamIds.length === 0) {
                // All teams already loaded
                console.log(`✅ All teams already loaded: ${teamIds.join(', ')}`);
                return teamIds.map(teamId => this.teams.find(t => t.id === teamId));
            }
            
            // Load only the missing teams using the new endpoint
            console.log(`🎯 Loading specific teams: ${missingTeamIds.join(', ')}`);
            const response = await fetch(`/api/teams-specific?ids=${missingTeamIds.join(',')}&_t=${Date.now()}`);
            
            if (response.ok) {
                const loadedTeams = await response.json();
                console.log(`✅ Loaded ${loadedTeams.length} specific teams with full player data`);
                
                // Merge loaded teams into our teams array
                loadedTeams.forEach(loadedTeam => {
                    const existingIndex = this.teams.findIndex(t => t.id === loadedTeam.id);
                    if (existingIndex >= 0) {
                        this.teams[existingIndex] = loadedTeam;
                    } else {
                        this.teams.push(loadedTeam);
                    }
                });
                
                // Mark that we now have only partial data (not complete)
                this.hasCompleteTeamsData = false;
                
                // Return all requested teams
                return teamIds.map(teamId => this.teams.find(t => t.id === teamId));
            } else {
                console.warn(`❌ Specific teams API failed with status ${response.status}. Falling back to full load.`);
                await this.loadTeams();
                return teamIds.map(teamId => this.teams.find(t => t.id === teamId));
            }
        } catch (error) {
            console.error('Error loading specific teams:', error);
            console.log('🔄 Fallback: Loading all teams');
            await this.loadTeams();
            return teamIds.map(teamId => this.teams.find(t => t.id === teamId));
        }
    }
    
    // Get team info (tries basic first, loads full if needed)
    async getTeamInfo(teamId, needsFullData = false) {
        if (needsFullData) {
            // Need full player data
            if (!this.teams || this.teams.length === 0) {
                await this.loadTeams();
            }
            return this.teams.find(t => t.id === teamId);
        } else {
            // Just need basic info
            if (!this.teamsBasic || this.teamsBasic.length === 0) {
                await this.loadTeamsBasic();
            }
            return this.teamsBasic.find(t => t.id === teamId);
        }
    }
    
    async loadEvents() {
        try {
            console.log('🔄 Loading events...');
            const response = await fetch(`/api/events?_t=${Date.now()}`);
            if (response.ok) {
                this.events = await response.json();
                console.log(`✅ Loaded ${this.events.length} events`);
            } else {
                console.error('❌ Failed to load events, status:', response.status);
                this.events = [];
            }
        } catch (error) {
            console.error('❌ Error loading events:', error);
            this.events = [];
        }
    }
    
    async loadReferees() {
        try {
            const response = await fetch('/api/referees');
            if (response.ok) {
                this.referees = await response.json();
            } else {
                console.error('Failed to load referees');
                this.referees = [];
            }
        } catch (error) {
            console.error('Error loading referees:', error);
            this.referees = [];
        }
    }
    
    // UI Methods
    async showSection(sectionName) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Find and activate the clicked button
        const clickedBtn = event?.target || document.querySelector(`[onclick*="${sectionName}"]`);
        if (clickedBtn) {
            clickedBtn.classList.add('active');
        }
        
        // Use the generalized loading system for all sections
        return this.executeWithLoading(async () => {
            // Lazy load data for the section if not already loaded
            if (sectionName === 'teams') {
                // TEAMS BUG FIX: Only reload if we don't have complete teams data
                // (loadSpecificTeams might have loaded only partial data)
                if (!this.hasCompleteTeamsData) {
                    await this.loadTeams(); // Load complete team data for roster display
                }
                this.renderTeams();
            } else if (sectionName === 'events') {
                // Events already loaded and rendered with referee filtering in initializeApp()
                // Only re-render if events container is empty or not yet rendered
                const container = document.getElementById('events-container');
                if (!container || container.innerHTML.includes('Loading events...') || container.children.length === 0) {
                    console.log('🔄 Re-rendering events because container is empty or still loading');
                    await this.renderEvents();
                } else {
                    console.log('✅ Events already rendered with referee filtering, skipping re-render');
                }
            } else if (sectionName === 'referees') {
                if (this.referees.length === 0) {
                    await this.loadReferees();
                }
                this.renderReferees();
            } else if (sectionName === 'standings') {
                // Standings need full team data for calculations
                if (this.teams.length === 0) {
                    await this.loadTeams();
                }
                if (this.events.length === 0) {
                    await this.loadEvents();
                }
                this.renderStandings();
            } else if (sectionName === 'cards') {
                // Cards need full team data for player names
                if (this.teams.length === 0) {
                    await this.loadTeams();
                }
                if (this.events.length === 0) {
                    await this.loadEvents();
                }
                if (this.referees.length === 0) {
                    await this.loadReferees();
                }
                
                // Add a small delay to ensure all data is processed
                await new Promise(resolve => setTimeout(resolve, 500));
                
                this.renderCardTracker();
            } else if (sectionName === 'game-tracker') {
                // Game tracker needs events and referees for display
                if (this.events.length === 0) {
                    await this.loadEvents();
                }
                if (this.referees.length === 0) {
                    await this.loadReferees();
                }
                this.renderGameTracker();
            } else if (sectionName === 'season') {
                // Season management needs full data
                if (this.teams.length === 0) {
                    await this.loadTeams();
                }
                if (this.events.length === 0) {
                    await this.loadEvents();
                }
                if (this.referees.length === 0) {
                    await this.loadReferees();
                }
                this.renderSeasonManagement();
            }
            
            // Show section
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(sectionName + '-section').classList.add('active');
            
        }, {
            message: this.getSectionLoadingMessage(sectionName),
            showModal: true,
            errorHandler: (error) => {
                console.error(`Error loading ${sectionName} section:`, error);
                // Show error in the section container if available
                const container = document.getElementById(`${sectionName}-container`) || 
                                 document.getElementById(`${sectionName}-tracker-container`);
                if (container) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #dc3545;">
                            <h3>Error Loading ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}</h3>
                            <p>Failed to load data. Please refresh the page and try again.</p>
                            <p style="font-size: 0.9em; color: #666;">Error: ${error.message}</p>
                        </div>
                    `;
                }
            }
        });
    }
    
    // Get appropriate loading message for each section
    getSectionLoadingMessage(sectionName) {
        const messages = {
            'teams': 'Loading teams and player rosters with photos...',
            'events': 'Loading events and match schedules...',
            'referees': 'Loading referee information...',
            'standings': 'Calculating league standings...',
            'cards': 'Loading card tracker and analyzing all matches...',
            'game-tracker': 'Loading game tracker and match data...',
            'season': 'Loading season management data...'
        };
        return messages[sectionName] || 'Loading section...';
    }
    
    // Save Teams (for jersey number updates only)
    async saveMemberProfile(teamId, memberId, jerseyNumber) {
        try {
            const data = await this.fetch('/api/teams/member-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    teamId: teamId,
                    memberId: memberId,
                    jerseyNumber: jerseyNumber
                })
            });
            
            return data;
        } catch (error) {
            console.error('Error saving member profile:', error);
            throw error;
        }
    }
    
    // Limited member editing (jersey number and photo only)
    editMemberLimited(teamId, memberId) {
        const team = this.teams.find(t => t.id === teamId);
        const member = team.members.find(m => m.id === memberId);
        if (!member) return;
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const photoLabel = isMobile ? 'Take Photo' : 'Photo';
        
        const modal = this.createModal('Update Player Info', `
            <div class="form-group">
                <label class="form-label">Player Name</label>
                <input type="text" class="form-input disabled" value="${member.name}" readonly style="background: #f8f9fa; cursor: not-allowed;">
                <small style="color: #666; font-size: 0.85em;">Name cannot be changed in view mode</small>
            </div>
            <div class="form-group">
                <label class="form-label">Jersey Number</label>
                <input type="number" class="form-input" id="member-jersey" value="${member.jerseyNumber || ''}" min="1" max="99">
            </div>
            <div class="form-group">
                <label class="form-label">Gender</label>
                <select class="form-select disabled" disabled style="background: #f8f9fa; cursor: not-allowed;">
                    <option value="${member.gender || ''}">${member.gender || 'Not set'}</option>
                </select>
                <small style="color: #666; font-size: 0.85em;">Gender cannot be changed in view mode</small>
            </div>
            <div class="form-group">
                <label class="form-label">${photoLabel}</label>
                <input type="file" class="form-input file-input" id="member-photo" accept="image/*" ${isMobile ? 'capture="environment"' : ''}>
                ${member.photo ? `<img src="${member.photo}" alt="Current photo" class="preview-image" style="max-width: 100px; max-height: 100px; border-radius: 8px; margin-top: 10px;">` : ''}
                ${isMobile ? '<small style="color: #666; font-size: 0.85em; display: block; margin-top: 5px;">📸 This will open your camera</small>' : ''}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveMemberLimited('${teamId}', '${memberId}')">Update Player</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveMemberLimited(teamId, memberId) {
        const jerseyNumber = document.getElementById('member-jersey').value;
        const photoFile = document.getElementById('member-photo').files[0];
        
        const team = this.teams.find(t => t.id === teamId);
        const member = team.members.find(m => m.id === memberId);
        if (!member) return;
        
        try {
            let needsTeamsRefresh = false;
            
            // Handle photo upload separately if a new photo was selected
            if (photoFile) {
                console.log('Uploading new photo for member:', memberId);
                const photoUrl = await this.uploadPhoto(photoFile, memberId);
                console.log('Photo uploaded successfully:', photoUrl);
                // Photo upload automatically updates the database, so we need to refresh from server
                needsTeamsRefresh = true;
            }
            
            // Update jersey number if changed
            const newJerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
            if (member.jerseyNumber !== newJerseyNumber) {
                // Use new granular endpoint for member profile updates
                await this.saveMemberProfile(teamId, memberId, newJerseyNumber);
                member.jerseyNumber = newJerseyNumber; // Update local data
                needsTeamsRefresh = true;
            }
            
            // Refresh teams data from server if photo was uploaded or jersey number changed
            if (needsTeamsRefresh) {
                console.log('Refreshing teams data from server after member update...');
                await this.loadTeams();
            }
            
            this.renderTeams();
            this.closeModal();
        } catch (error) {
            console.error('Error updating player:', error);
            alert('Failed to update player: ' + error.message);
        }
    }
    
    // Photo upload method (same as main app)
    async uploadPhoto(file, memberId) {
        console.log('uploadPhoto called with:', { fileName: file.name, fileSize: file.size, memberId });
        
        if (!file || !memberId) {
            throw new Error('File and member ID are required');
        }
        
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('member_id', memberId);
        
        console.log('Sending photo upload request to /api/photos');
        
        const result = await this.fetch('/api/photos', {
            method: 'POST',
            body: formData
        });
        
        console.log('Photo upload result:', result);
        
        // 🚀 FIX: Don't add cache-busting to base64 data, only to URL endpoints
        let photoUrl = result.url;
        if (photoUrl && !photoUrl.startsWith('data:image/')) {
            // Only add cache-busting to API URLs, not base64 data
            photoUrl = photoUrl + (photoUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
        }
        
        return photoUrl;
    }
    
    // Utility method for file conversion (DEPRECATED - keeping for compatibility)
    async convertFileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    // Get member photo URL with gender defaults
    getMemberPhotoUrl(member) {
        // Check if member has a real custom photo
        if (member.photo) {
            // Skip gender defaults
            if (member.photo.includes('male.svg') || 
                member.photo.includes('female.svg') || 
                member.photo.includes('default.svg')) {
                return this.getGenderDefaultPhoto(member);
            }
            
            // Handle base64 images (for Railway deployment where filesystem is ephemeral)
            if (member.photo.startsWith('data:image/')) {
                return member.photo; // Return base64 image directly
            }
            
            // Check if it's an API URL with filename parameter (legacy format)
            if (member.photo.includes('/api/photos?filename=')) {
                const match = member.photo.match(/filename=([^&]+)/);
                if (match) {
                    const filename = decodeURIComponent(match[1]);
                    // Convert to direct static URL for better performance
                    return `/photos/${filename}`;
                } else {
                    return member.photo;
                }
            }
            
            // Check if it's a direct /photos/ URL (optimized format)
            if (member.photo.startsWith('/photos/')) {
                return member.photo; // Direct static URL (fastest)
            }
            
            // Check if it's a direct filename with valid extension
            if ((member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                member.photo.includes('.png') || member.photo.includes('.webp')) &&
                !member.photo.startsWith('/photos/') && !member.photo.startsWith('/api/photos') && !member.photo.startsWith('http')) {
                // Convert filename to direct static URL for better performance
                return `/photos/${member.photo}`;
            }
            
            // Check if it's already a full HTTP URL with valid extension
            if (member.photo.startsWith('http') && 
                (member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                 member.photo.includes('.png') || member.photo.includes('.webp'))) {
                // Return external URLs without cache-busting to avoid corrupting them
                return member.photo;
            }
        }
        
        // Use gender-based defaults for everyone else
        return this.getGenderDefaultPhoto(member);
    }
    
    // Helper method for gender defaults
    getGenderDefaultPhoto(member) {
        if (member.gender === 'male') {
            return '/photos/default-male.svg';
        } else if (member.gender === 'female') {
            return '/photos/default-female.svg';
        } else {
            // No gender specified, use male as default
            return '/photos/default-male.svg';
        }
    }
    
    // Helper function to generate card reasons dropdown HTML
    generateCardReasonsOptions(selectedReason = '') {
        if (!window.CheckInAppConfig || !window.CheckInAppConfig.cardReasons) {
            console.warn('Card reasons config not found, using fallback list');
            // Fallback list in case config doesn't load
            const fallbackReasons = [
                "Unsporting behavior", "Dissent by word or action", "Persistent infringement",
                "Delaying the restart of play", "Failure to respect distance", 
                "Entering/leaving without permission", "Sliding", "Reckless/aggressive challenge",
                "Denial of a goal scoring opportunity", "Stopping a promising attack",
                "Serious foul play", "Violent conduct", "Spitting",
                "Offensive/insulting language", "Second yellow card"
            ];
            return fallbackReasons.map(reason => 
                `<option value="${reason}" ${selectedReason === reason ? 'selected' : ''}>${reason}</option>`
            ).join('');
        }
        
        return window.CheckInAppConfig.cardReasons.map(reason => 
            `<option value="${reason}" ${selectedReason === reason ? 'selected' : ''}>${reason}</option>`
        ).join('');
    }

    // iOS-style score adjustment for mobile
    adjustScore(inputId, delta) {
        console.log(`🎯 adjustScore called:`, { inputId, delta });
        
        const input = document.getElementById(inputId);
        if (!input) {
            console.log(`❌ adjustScore: Input element not found:`, inputId);
            return;
        }
        
        console.log(`📊 adjustScore: Input found, current value:`, input.value);
        
        let currentValue = parseInt(input.value) || 0;
        let newValue = Math.max(0, Math.min(99, currentValue + delta)); // Keep between 0-99
        
        console.log(`📊 adjustScore: Changing from ${currentValue} to ${newValue}`);
        
        input.value = newValue;
        
        // Add visual feedback
        input.style.transform = 'scale(1.05)';
        setTimeout(() => {
            input.style.transform = 'scale(1)';
        }, 150);
        
        console.log(`✅ adjustScore: Score updated successfully`);
    }
    
    // Player Profile Management  
    async viewPlayerProfile(teamId, memberId) {
        return this.executeWithLoading(async () => {
            const team = this.teams.find(t => t.id === teamId);
            const member = team?.members.find(m => m.id === memberId);
            
            if (!team || !member) return;
            
            // Create team lookup cache for faster access
            const teamLookup = new Map();
            this.teams.forEach(t => teamLookup.set(t.id, t));
            
            // Get all current season cards for this player across all events - optimized version
            const matchCards = [];
            for (const event of this.events) {
                for (const match of event.matches) {
                    if (!match.cards) continue;
                    
                    // Find cards for this member in one pass
                    const memberCards = match.cards.filter(card => card.memberId === memberId);
                    if (memberCards.length === 0) continue;
                    
                    // Cache team lookups per match (not per card)
                    const homeTeam = teamLookup.get(match.homeTeamId);
                    const awayTeam = teamLookup.get(match.awayTeamId);
                    const matchInfo = `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`;
                    
                    // Process all cards for this member in this match
                    memberCards.forEach(card => {
                        matchCards.push({
                            type: 'match',
                            eventName: event.name,
                            eventDate: new Date(event.date_epoch * 1000).toLocaleDateString('en-US', { 
                                timeZone: 'America/Los_Angeles', 
                                year: 'numeric', 
                                month: '2-digit', 
                                day: '2-digit' 
                            }),
                            eventDate_epoch: event.date_epoch, // Add epoch for template compatibility
                            matchInfo,
                            cardType: card.cardType,
                            reason: card.reason,
                            notes: card.notes,
                            minute: card.minute,
                            mainReferee: match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null,
                            assistantReferee: match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null
                        });
                });
            }
        }
        
        // Fetch disciplinary records in parallel with UI building
        const disciplinaryPromise = this.fetchDisciplinaryRecords(memberId);
        
        // Wait for disciplinary records and display
        const disciplinaryRecords = await disciplinaryPromise;
        this.displayPlayerProfile(team, member, matchCards, disciplinaryRecords);
        
        }, {
            message: 'Loading player profile and disciplinary records...',
            showModal: true
        });
    }
    
    // Optimized helper method for fetching disciplinary records
    async fetchDisciplinaryRecords(memberId) {
        try {
            const response = await fetch(`/api/disciplinary-records?member_id=${memberId}`);
            if (response.ok) {
                const records = await response.json();
                return records.map(record => ({
                    type: 'prior',
                    eventDate: record.incidentDate_epoch ? new Date(record.incidentDate_epoch * 1000).toLocaleDateString('en-US', { 
                        timeZone: 'America/Los_Angeles', 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit' 
                    }) : (record.incidentDate || record.createdAt),
                    eventDate_epoch: record.incidentDate_epoch || record.created_at_epoch, // Add epoch for template compatibility
                    matchInfo: 'External incident',
                    cardType: record.cardType,
                    reason: record.reason,
                    notes: record.notes,
                    minute: null,
                    suspensionMatches: record.suspensionMatches,
                    suspensionServed: record.suspensionServed,
                    suspensionServedDate: record.suspensionServedDate
                }));
            } else {
                console.error('Failed to load disciplinary records:', response.status);
                return [];
            }
        } catch (error) {
            console.error('Error loading disciplinary records:', error);
            return [];
        }
    }
    
    // Optimized helper method for building profile base content
    buildPlayerProfileBase(team, member) {
        return `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 12px; text-align: center;">
                <div style="margin-bottom: 12px;">
                    <img src="${this.getMemberPhotoUrl(member)}" alt="${member.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 3px solid #2196F3;">
                </div>
                <h3 style="margin: 0 0 4px 0; color: #333; font-size: 1.1em;">${member.name}</h3>
                <p style="margin: 0; color: #666; font-size: 0.85em;">
                    ${team.name}${member.jerseyNumber ? ` • #${member.jerseyNumber}` : ''}${member.gender ? ` • ${member.gender}` : ''}
                    ${this.isMemberCaptain(member, team) ? ' • 👑 Captain' : ''}
                </p>
            </div>`;
    }
    
    // Helper function to check if a member is a captain (supports both legacy and new system)
    isMemberCaptain(member, team) {
        // Check new captains system
        if (team.captains && team.captains.some(c => c.memberId === member.id)) {
            return true;
        }
        
        // Check legacy captain system
        if (team.captainId && member.id === team.captainId) {
            return true;
        }
        
        return false;
    }
    
    // Optimized method for rendering card items
    renderCardItem(card) {
        const cardIcon = card.cardType === 'yellow' ? '🟨' : '🟥';
        const cardColor = card.cardType === 'yellow' ? '#ffc107' : '#dc3545';
        const typeIcon = card.type === 'match' ? '🏟️' : '📜';
        const typeLabel = card.type === 'match' ? 'Match' : 'Prior';
        
        return `
            <div style="padding: 12px; border-bottom: 1px solid #f8f9fa; background: white;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="font-size: 1.1em;">${cardIcon}</span>
                    <div style="flex: 1;">
                        <strong style="color: ${cardColor}; text-transform: capitalize; font-size: 0.9em;">${card.cardType} Card</strong>
                        ${card.minute ? `<span style="color: #666; font-size: 0.8em;"> - ${card.minute}'</span>` : ''}
                        <span style="margin-left: 8px; background: ${card.type === 'match' ? '#e3f2fd' : '#fff3e0'}; color: #666; padding: 1px 4px; border-radius: 3px; font-size: 0.7em;">${typeIcon} ${typeLabel}</span>
                    </div>
                    <small style="color: #666; font-size: 0.75em;">${epochToPacificDate(card.eventDate_epoch || card.eventDate)}</small>
                </div>
                ${card.type === 'match' ? `
                    <div style="font-size: 0.8em; color: #666; margin-bottom: 3px;">
                        <strong>Match:</strong> ${card.matchInfo}
                    </div>
                ` : ''}
                ${card.type === 'match' && (card.mainReferee || card.assistantReferee) ? `
                    <div style="font-size: 0.8em; color: #666; margin-bottom: 3px;">
                        <strong>Referee${card.mainReferee && card.assistantReferee ? 's' : ''}:</strong> 
                        ${card.mainReferee ? `${card.mainReferee.name}` : ''}${card.mainReferee && card.assistantReferee ? ', ' : ''}${card.assistantReferee ? `${card.assistantReferee.name}` : ''}
                    </div>
                ` : ''}
                ${card.reason ? `
                    <div style="font-size: 0.8em; color: #666; margin-bottom: 3px;">
                        <strong>Reason:</strong> ${card.reason}
                    </div>
                ` : ''}
                ${card.notes ? `
                    <div style="font-size: 0.75em; color: #888; font-style: italic;">
                        <strong>Notes:</strong> ${card.notes}
                    </div>
                ` : ''}
                ${card.suspensionMatches ? `
                    <div style="font-size: 0.75em; color: #856404; margin-top: 5px; padding: 4px 6px; background: #fff3cd; border-radius: 3px; display: inline-block;">
                        ⚖️ ${card.suspensionMatches} match suspension ${
                            card.suspensionServed 
                                ? `(✅ Served${card.suspensionServedDate ? ` on ${epochToPacificDate(card.suspensionServedDate_epoch || card.suspensionServedDate)}` : ''})` 
                                : '(⏳ Pending)'
                        }
                    </div>
                ` : ''}
            </div>`;
    }
    
    // Final display method with optimized rendering
    displayPlayerProfile(team, member, matchCards, disciplinaryRecords) {
        // Combine all cards and sort by date (most recent first)
        const allCards = [...matchCards, ...disciplinaryRecords];
        allCards.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
        
        const totalCards = allCards.length;
        const matchCardCount = matchCards.length;
        const priorCardCount = disciplinaryRecords.length;
        
        // Check if player has any red cards
        const hasRedCards = allCards.some(card => card.cardType === 'red');
        
        // Pre-render card items for better performance
        const cardItemsHtml = totalCards > 0 ? allCards.map(card => this.renderCardItem(card)).join('') : '';
        
        const modal = this.createModal(`Player Profile: ${member.name}`, `
            ${this.buildPlayerProfileBase(team, member)}
            
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 12px 0; color: #333; display: flex; align-items: center; gap: 8px; font-size: 1em;">
                    📋 Complete Disciplinary Record 
                    <span style="background: ${totalCards === 0 ? '#28a745' : hasRedCards ? '#dc3545' : '#ffc107'}; color: ${hasRedCards || totalCards === 0 ? 'white' : '#212529'}; padding: 2px 6px; border-radius: 10px; font-size: 0.75em; font-weight: normal;">
                        ${totalCards} total card${totalCards !== 1 ? 's' : ''}
                    </span>
                </h4>
                
                ${totalCards > 0 ? `
                    <div style="margin-bottom: 10px; font-size: 0.85em; color: #666;">
                        <span style="margin-right: 15px;">🏟️ ${matchCardCount} current season card${matchCardCount !== 1 ? 's' : ''}</span>
                        <span>📜 ${priorCardCount} lifetime card${priorCardCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px;">
                        ${cardItemsHtml}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 30px; color: #666; background: #f8f9fa; border-radius: 8px;">
                        <div style="font-size: 2em; margin-bottom: 8px;">✅</div>
                        <p style="margin: 0; font-style: italic; font-size: 0.9em;">Clean record - No disciplinary actions</p>
                    </div>
                `}
            </div>
            
            <div style="text-align: center;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    renderTeams() {
        const container = document.getElementById('teams-container');
        const selectedTeamId = document.getElementById('team-selector')?.value;
        
        // Get all teams and sort alphabetically
        let teamsToShow = this.teams.slice(); // Create a copy
        teamsToShow.sort((a, b) => a.name.localeCompare(b.name));
        
        if (teamsToShow.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No teams yet</h3>
                    <p>No teams available</p>
                </div>
            `;
            return;
        }
        
        // Create team selector dropdown with categories
        let selectorHtml = `
            <div class="team-selector-container">
                <label class="form-label">Select a team to view roster:</label>
                <select id="team-selector" class="form-select" onchange="app.renderTeams()">
                    <option value="">Choose a team...</option>
                    ${(() => {
                        const over30Teams = teamsToShow.filter(team => team.category === 'Over 30');
                        const over40Teams = teamsToShow.filter(team => team.category === 'Over 40');
                        
                        let optionsHtml = '';
                        
                        if (over30Teams.length > 0) {
                            optionsHtml += '<optgroup label="Over 30 Teams">';
                            over30Teams.forEach(team => {
                                optionsHtml += `<option value="${team.id}" ${selectedTeamId === team.id ? 'selected' : ''}>${team.name} - ${team.members.length} players</option>`;
                            });
                            optionsHtml += '</optgroup>';
                        }
                        
                        if (over40Teams.length > 0) {
                            optionsHtml += '<optgroup label="Over 40 Teams">';
                            over40Teams.forEach(team => {
                                optionsHtml += `<option value="${team.id}" ${selectedTeamId === team.id ? 'selected' : ''}>${team.name} - ${team.members.length} players</option>`;
                            });
                            optionsHtml += '</optgroup>';
                        }
                        
                        return optionsHtml;
                    })()}
                </select>
            </div>
        `;
        
        // Show selected team details
        if (selectedTeamId) {
            const selectedTeam = this.teams.find(team => team.id === selectedTeamId);
            if (selectedTeam) {
                // Get captain information (support both legacy captainId and new captains array)
                const captains = selectedTeam.captains || [];
                const legacyCaptain = selectedTeam.captainId ? selectedTeam.members.find(m => m.id === selectedTeam.captainId) : null;
                
                // Combine legacy and new captain systems
                const allCaptains = [...captains];
                if (legacyCaptain && !captains.some(c => c.memberId === legacyCaptain.id)) {
                    allCaptains.push({ memberId: legacyCaptain.id, memberName: legacyCaptain.name });
                }
                
                // Create captain names list
                const captainNames = allCaptains.map(c => c.memberName).join(', ');
                
                // Calculate roster statistics
                const totalPlayers = selectedTeam.members.length;
                const maleCount = selectedTeam.members.filter(m => m.gender === 'male').length;
                const femaleCount = selectedTeam.members.filter(m => m.gender === 'female').length;
                const unknownCount = totalPlayers - maleCount - femaleCount;
                
                // Calculate team-wide card statistics
                let teamCurrentSeasonYellow = 0;
                let teamCurrentSeasonRed = 0;
                let teamLifetimeYellow = 0; // Will be updated when lifetime cards load
                let teamLifetimeRed = 0;     // Will be updated when lifetime cards load
                
                selectedTeam.members.forEach(member => {
                    this.events.forEach(event => {
                        // Only count cards from current season events
                        if (this.isCurrentSeasonEvent(event.date_epoch)) {
                            event.matches.forEach(match => {
                                if (match.cards) {
                                    const memberCards = match.cards.filter(card => card.memberId === member.id);
                                    teamCurrentSeasonYellow += memberCards.filter(card => card.cardType === 'yellow').length;
                                    teamCurrentSeasonRed += memberCards.filter(card => card.cardType === 'red').length;
                                }
                            });
                        }
                    });
                });
                
                selectorHtml += `
                    <div class="selected-team-container">
                        <div class="team-card-full" style="border-left-color: ${selectedTeam.colorData}">
                            <div class="team-header">
                                <div>
                                    <div class="team-name">${selectedTeam.name}</div>
                                    <div class="team-category">${selectedTeam.category || ''}</div>
                                    ${allCaptains.length > 0 ? `<div class="team-captain">👑 Captain${allCaptains.length > 1 ? 's' : ''}: ${captainNames}</div>` : ''}
                                </div>
                            </div>
                            <div class="team-description">${selectedTeam.description || ''}</div>
                            ${totalPlayers > 0 ? `
                                <div class="roster-stats" style="margin: 12px 0; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 0.9em; color: #666;">
                                    <div style="margin-bottom: 6px;"><strong>👥 ${totalPlayers} player${totalPlayers !== 1 ? 's' : ''}</strong></div>
                                    ${maleCount > 0 || femaleCount > 0 ? `
                                        <div style="margin-bottom: 6px;">👨 ${maleCount} male${maleCount !== 1 ? 's' : ''} • 👩 ${femaleCount} female${femaleCount !== 1 ? 's' : ''} ${unknownCount > 0 ? `• ❓ ${unknownCount} unspecified` : ''}</div>
                                    ` : ''}
                                    <div id="team-card-stats-${selectedTeam.id}" style="margin-bottom: 3px;">
                                        <strong>📋 Team Cards:</strong> 
                                        ${teamCurrentSeasonYellow + teamCurrentSeasonRed > 0 ? `🟨${teamCurrentSeasonYellow} 🟥${teamCurrentSeasonRed} (current season)` : 'No current season cards'}
                                        <span id="team-lifetime-stats-${selectedTeam.id}"> • Loading lifetime stats...</span>
                                    </div>
                                </div>
                            ` : ''}
                            <div class="members-list-full">
                                ${selectedTeam.members
                                    .slice()
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map(member => {
                                    // Count current season cards for this member across current season matches only
                                    let currentSeasonYellowCards = 0;
                                    let currentSeasonRedCards = 0;
                                    
                                    this.events.forEach(event => {
                                        // Only count cards from current season events
                                        if (this.isCurrentSeasonEvent(event.date_epoch)) {
                                            event.matches.forEach(match => {
                                                if (match.cards) {
                                                    const memberCards = match.cards.filter(card => card.memberId === member.id);
                                                    currentSeasonYellowCards += memberCards.filter(card => card.cardType === 'yellow').length;
                                                    currentSeasonRedCards += memberCards.filter(card => card.cardType === 'red').length;
                                                }
                                            });
                                        }
                                    });
                                    
                                    // Note: Lifetime cards will be fetched asynchronously and updated via DOM manipulation
                                    // This is a placeholder that will be updated once the disciplinary records are loaded
                                    const currentCardsDisplay = [];
                                    if (currentSeasonYellowCards > 0) currentCardsDisplay.push(`🟨${currentSeasonYellowCards}`);
                                    if (currentSeasonRedCards > 0) currentCardsDisplay.push(`🟥${currentSeasonRedCards}`);
                                    const currentCardsText = currentCardsDisplay.length > 0 ? ` • ${currentCardsDisplay.join(' ')} (current season)` : '';
                                    
                                    return `
                                        <div class="member-item">
                                            <div class="member-info">
                                                <img src="${this.getMemberPhotoUrl(member)}" alt="${member.name}" class="member-photo">
                                                <div class="member-details">
                                                    <div class="member-name">${member.name}${this.isMemberCaptain(member, selectedTeam) ? ' 👑' : ''}</div>
                                                    <div class="member-meta" id="member-meta-${member.id}">
                                                        ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                                        ${member.gender ? ` • ${member.gender}` : ''}
                                                        ${currentCardsText}
                                                        <span class="lifetime-cards" id="lifetime-cards-${member.id}"> • Loading disciplinary records...</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="member-actions">
                                                <button class="btn btn-small" onclick="app.viewPlayerProfile('${selectedTeam.id}', '${member.id}')" title="View Profile">👤</button>
                                                <button class="btn btn-small btn-secondary" onclick="app.editMemberLimited('${selectedTeam.id}', '${member.id}')" title="Edit Jersey & Photo">✏️</button>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                                ${selectedTeam.members.length === 0 ? '<div class="empty-state"><p>No members yet</p></div>' : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        container.innerHTML = selectorHtml;
        
        // Load lifetime disciplinary records for displayed team members
        if (selectedTeamId) {
            const selectedTeam = this.teams.find(team => team.id === selectedTeamId);
            if (selectedTeam && selectedTeam.members.length > 0) {
                this.loadLifetimeCardsForTeam(selectedTeam);
            }
        }
    }
    
    // Load lifetime disciplinary cards for team members (optimized - single API call per team)
    async loadLifetimeCardsForTeam(team) {
        if (!team.members || team.members.length === 0) return;
        
        try {
            console.log(`🚀 Fetching lifetime cards for team "${team.name}" (${team.members.length} players)`);
            
            const response = await fetch(`/api/disciplinary-records?team_id=${team.id}`);
            if (response.ok) {
                const allRecords = await response.json();
                
                console.log(`✅ Received ${allRecords.length} disciplinary records for team ${team.name}`);
                
                // Group records by member ID for efficient lookup
                const recordsByMember = {};
                let totalLifetimeYellow = 0;
                let totalLifetimeRed = 0;
                
                // Create a set of team member IDs for filtering
                const teamMemberIds = new Set(team.members.map(member => member.id));
                
                allRecords.forEach(record => {
                    // Only process records for members of this specific team
                    if (teamMemberIds.has(record.memberId)) {
                        if (!recordsByMember[record.memberId]) {
                            recordsByMember[record.memberId] = [];
                        }
                        recordsByMember[record.memberId].push(record);
                        
                        // Count team-wide lifetime cards (only for this team's members)
                        if (record.cardType === 'yellow') totalLifetimeYellow++;
                        else if (record.cardType === 'red') totalLifetimeRed++;
                    }
                });
                
                // Update team-wide lifetime statistics
                const teamLifetimeElement = document.getElementById(`team-lifetime-stats-${team.id}`);
                if (teamLifetimeElement) {
                    if (totalLifetimeYellow > 0 || totalLifetimeRed > 0) {
                        teamLifetimeElement.textContent = ` • 🟨${totalLifetimeYellow} 🟥${totalLifetimeRed} (lifetime)`;
                    } else {
                        teamLifetimeElement.textContent = ' • No lifetime cards';
                    }
                }
                
                // Update DOM for each member
                team.members.forEach(member => {
                    const memberRecords = recordsByMember[member.id] || [];
                    
                    // Count lifetime cards
                    let lifetimeYellow = 0;
                    let lifetimeRed = 0;
                    
                    memberRecords.forEach(record => {
                        if (record.cardType === 'yellow') lifetimeYellow++;
                        else if (record.cardType === 'red') lifetimeRed++;
                    });
                    
                    // Update the DOM element for this member
                    const lifetimeElement = document.getElementById(`lifetime-cards-${member.id}`);
                    if (lifetimeElement) {
                        if (lifetimeYellow > 0 || lifetimeRed > 0) {
                            const lifetimeDisplay = [];
                            if (lifetimeYellow > 0) lifetimeDisplay.push(`🟨${lifetimeYellow}`);
                            if (lifetimeRed > 0) lifetimeDisplay.push(`🟥${lifetimeRed}`);
                            lifetimeElement.textContent = ` • ${lifetimeDisplay.join(' ')} (lifetime)`;
                        } else {
                            lifetimeElement.textContent = '';
                        }
                    }
                });
                
            } else {
                console.warn(`❌ Team API failed with status ${response.status}. Falling back to individual requests.`);
                
                // **Fallback Strategy**: If team API fails, fall back to individual requests
                console.log('🔄 Fallback: Using individual API calls per player');
                await this.loadLifetimeCardsForTeamFallback(team);
            }
        } catch (error) {
            console.error('❌ Team API request failed:', error);
            
            // **Fallback Strategy**: If team request fails, use individual requests
            console.log('🔄 Fallback: Using individual API calls per player');
            await this.loadLifetimeCardsForTeamFallback(team);
        }
    }
    
    // Fallback method using individual API calls (original approach)
    async loadLifetimeCardsForTeamFallback(team) {
        let totalLifetimeYellow = 0;
        let totalLifetimeRed = 0;
        
        for (const member of team.members) {
            try {
                const response = await fetch(`/api/disciplinary-records?member_id=${member.id}`);
                if (response.ok) {
                    const records = await response.json();
                    
                    // Count lifetime cards
                    let lifetimeYellow = 0;
                    let lifetimeRed = 0;
                    
                    records.forEach(record => {
                        if (record.cardType === 'yellow') {
                            lifetimeYellow++;
                            totalLifetimeYellow++;
                        } else if (record.cardType === 'red') {
                            lifetimeRed++;
                            totalLifetimeRed++;
                        }
                    });
                    
                    // Update the DOM element for this member
                    const lifetimeElement = document.getElementById(`lifetime-cards-${member.id}`);
                    if (lifetimeElement) {
                        if (lifetimeYellow > 0 || lifetimeRed > 0) {
                            const lifetimeDisplay = [];
                            if (lifetimeYellow > 0) lifetimeDisplay.push(`🟨${lifetimeYellow}`);
                            if (lifetimeRed > 0) lifetimeDisplay.push(`🟥${lifetimeRed}`);
                            lifetimeElement.textContent = ` • ${lifetimeDisplay.join(' ')} (lifetime)`;
                        } else {
                            lifetimeElement.textContent = '';
                        }
                    }
                } else {
                    // Hide loading text if API fails
                    const lifetimeElement = document.getElementById(`lifetime-cards-${member.id}`);
                    if (lifetimeElement) {
                        lifetimeElement.textContent = '';
                    }
                }
            } catch (error) {
                console.error('Error loading lifetime cards for member:', member.id, error);
                // Hide loading text on error
                const lifetimeElement = document.getElementById(`lifetime-cards-${member.id}`);
                if (lifetimeElement) {
                    lifetimeElement.textContent = '';
                }
            }
        }
        
        // Update team-wide lifetime statistics after processing all members
        const teamLifetimeElement = document.getElementById(`team-lifetime-stats-${team.id}`);
        if (teamLifetimeElement) {
            if (totalLifetimeYellow > 0 || totalLifetimeRed > 0) {
                teamLifetimeElement.textContent = ` • 🟨${totalLifetimeYellow} 🟥${totalLifetimeRed} (lifetime)`;
            } else {
                teamLifetimeElement.textContent = ' • No lifetime cards';
            }
        }
    }
    
    async renderEvents() {
        console.log('🔍 renderEvents called - teams loaded:', this.teams.length, 'events loaded:', this.events.length, 'referees loaded:', this.referees.length);
        console.log('📞 renderEvents call stack:', new Error().stack?.split('\n').slice(1, 4).join('\n  '));
        
        // Ensure referees are loaded for referee name display
        if (this.referees.length === 0) {
            console.log('📋 Loading referees for events display...');
            await this.loadReferees();
        }
        
        const container = document.getElementById('events-container');
        const showPastEvents = document.getElementById('show-past-events')?.checked || false;
        
        if (this.events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No events yet</h3>
                    <p>No events available</p>
                </div>
            `;
            return;
        }
        
        // Filter events based on date and toggle
        const todayEpoch = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000); // Convert to epoch seconds
        
        console.log(`📅 Today's epoch: ${todayEpoch}, Show past events: ${showPastEvents}`);
        
        let eventsToShow = this.events.filter(event => {
            // Use epoch timestamp for comparison (much simpler!)
            const eventEpoch = event.date_epoch;
            
            console.log(`📅 Event "${event.name}": epoch=${eventEpoch}, today=${todayEpoch}, isPast=${eventEpoch < todayEpoch}, isFuture=${eventEpoch >= todayEpoch}`);
            
            if (showPastEvents) {
                return eventEpoch < todayEpoch; // Show only past events
            } else {
                return eventEpoch >= todayEpoch; // Show only future events
            }
        });
        
        console.log(`📅 After date filtering: ${eventsToShow.length} events (${eventsToShow.map(e => e.name).join(', ')})`);

        // Filter events based on selected referee (if not Guest)
        if (this.selectedRefereeId && this.selectedRefereeId !== 'guest') {
            console.log(`🎯 Filtering events for referee: ${this.selectedRefereeName} (${this.selectedRefereeId})`);
            console.log(`📋 Total events before referee filtering: ${eventsToShow.length}`);
            
            // Debug: Log first event structure
            if (eventsToShow.length > 0) {
                console.log('📊 Sample event structure:', {
                    name: eventsToShow[0].name,
                    matchCount: eventsToShow[0].matches?.length || 0,
                    firstMatch: eventsToShow[0].matches?.[0] ? {
                        id: eventsToShow[0].matches[0].id,
                        mainRefereeId: eventsToShow[0].matches[0].mainRefereeId,
                        assistantRefereeId: eventsToShow[0].matches[0].assistantRefereeId
                    } : 'No matches'
                });
            }
            
            eventsToShow = eventsToShow.filter(event => {
                // Check if this event has any matches that this referee is officiating
                const hasMatchForReferee = event.matches && event.matches.some(match => {
                    // Convert IDs to strings for comparison to avoid type mismatches
                    const mainRefereeId = String(match.mainRefereeId || '');
                    const assistantRefereeId = String(match.assistantRefereeId || '');
                    const selectedRefereeId = String(this.selectedRefereeId || '');
                    
                    const isMainReferee = mainRefereeId === selectedRefereeId;
                    const isAssistantReferee = assistantRefereeId === selectedRefereeId;
                    
                    // Debug logging for first few matches
                    if (match === event.matches[0]) {
                        console.log(`🔍 Match ${match.id}: main=${mainRefereeId}, assistant=${assistantRefereeId}, selected=${selectedRefereeId}, isMain=${isMainReferee}, isAssistant=${isAssistantReferee}`);
                    }
                    
                    return isMainReferee || isAssistantReferee;
                });
                
                return hasMatchForReferee;
            });
            
            console.log(`📊 Found ${eventsToShow.length} events for referee ${this.selectedRefereeName} after both filters`);
            console.log('🎯 Final events after referee filtering:', eventsToShow.map(e => e.name));
            
        } else if (this.selectedRefereeId === 'guest') {
            console.log('👤 Guest referee - showing all events');
        } else {
            console.log('⚠️ No referee selected - this should not happen');
        }
        
        // Sort chronologically (future events ascending, past events descending)
        eventsToShow.sort((a, b) => {
            // Simple epoch comparison - no Date object creation needed!
            return showPastEvents ? b.date_epoch - a.date_epoch : a.date_epoch - b.date_epoch;
        });
        
        if (eventsToShow.length === 0) {
            let message, subtext;
            
            if (this.selectedRefereeId && this.selectedRefereeId !== 'guest') {
                // No events found for selected referee
                message = `No games assigned to ${this.selectedRefereeName}`;
                subtext = showPastEvents 
                    ? `${this.selectedRefereeName} has no past games assigned`
                    : `${this.selectedRefereeName} has no upcoming games assigned`;
            } else {
                // Generic no events message
                message = showPastEvents ? 'No past events' : 'No upcoming events';
                subtext = showPastEvents ? 'Past events will appear here' : 'Upcoming events will appear here';
            }
            
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${message}</h3>
                    <p>${subtext}</p>
                    ${this.selectedRefereeId && this.selectedRefereeId !== 'guest' ? `
                        <p style="margin-top: 15px;">
                            <button onclick="app.changeReferee()" class="btn">
                                Select Different Referee
                            </button>
                        </p>
                    ` : ''}
                </div>
            `;
            return;
        }
        
        container.innerHTML = eventsToShow.map(event => `
            <div class="event-card">
                <div class="event-header">
                    <div>
                        <div class="event-name">${event.name}</div>
                        <div class="event-date">${epochToPacificDate(event.date_epoch)}</div>
                    </div>
                </div>
                <div class="event-description">${event.description || ''}</div>
                <div class="matches-container">
                    ${(() => {
                        console.log(`🏟️ Rendering matches for event "${event.name}"`);
                        console.log(`📊 Total matches in event: ${event.matches?.length || 0}`);
                        console.log(`🎯 Selected referee: ${this.selectedRefereeName} (${this.selectedRefereeId})`);
                        
                        return event.matches
                            .filter(match => {
                                // If a specific referee is selected (not Guest), filter matches to only show ones they officiate
                                if (this.selectedRefereeId && this.selectedRefereeId !== 'guest') {
                                    const mainRefereeId = String(match.mainRefereeId || '');
                                    const assistantRefereeId = String(match.assistantRefereeId || '');
                                    const selectedRefereeId = String(this.selectedRefereeId || '');
                                    
                                    const isOfficating = (mainRefereeId === selectedRefereeId || assistantRefereeId === selectedRefereeId);
                                    
                                    // Enhanced debug logging for match filtering
                                    const homeTeam = this.teamsBasic.find(t => t.id === match.homeTeamId);
                                    const awayTeam = this.teamsBasic.find(t => t.id === match.awayTeamId);
                                    const matchLabel = `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`;
                                    
                                    if (!isOfficating) {
                                        console.log(`🚫 FILTERING OUT match ${match.id} (${matchLabel}): main=${mainRefereeId}, assistant=${assistantRefereeId}, selected=${selectedRefereeId}`);
                                    } else {
                                        console.log(`✅ KEEPING match ${match.id} (${matchLabel}): referee is officiating (main=${mainRefereeId === selectedRefereeId ? 'YES' : 'NO'}, assistant=${assistantRefereeId === selectedRefereeId ? 'YES' : 'NO'})`);
                                    }
                                    
                                    return isOfficating;
                                }
                                
                                // Show all matches for Guest referee or no referee selected
                                console.log(`👤 Guest referee - showing all matches`);
                                return true;
                            });
                    })()
                        .sort((a, b) => {
                            // Sort by time first (using epoch timestamps)
                            if (a.time_epoch && b.time_epoch) {
                                if (a.time_epoch !== b.time_epoch) {
                                    return a.time_epoch - b.time_epoch;
                                }
                            } else if (a.time_epoch && !b.time_epoch) {
                                return -1;
                            } else if (!a.time_epoch && b.time_epoch) {
                                return 1;
                            }
                            
                            // Then sort by field
                            if (a.field && b.field) {
                                return parseInt(a.field) - parseInt(b.field);
                            } else if (a.field && !b.field) {
                                return -1;
                            } else if (!a.field && b.field) {
                                return 1;
                            }
                            
                            return 0;
                        })
                        .map(match => {
                        const homeTeam = this.teamsBasic.find(t => t.id === match.homeTeamId);
                        const awayTeam = this.teamsBasic.find(t => t.id === match.awayTeamId);
                        const mainReferee = match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null;
                        const assistantReferee = match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null;
                        
                        const homeAttendanceCount = match.homeTeamAttendees ? match.homeTeamAttendees.length : 0;
                        const awayAttendanceCount = match.awayTeamAttendees ? match.awayTeamAttendees.length : 0;
                        const homeTotalPlayers = homeTeam ? homeTeam.memberCount : 0;
                        const awayTotalPlayers = awayTeam ? awayTeam.memberCount : 0;
                        
                        // Match status and score display
                        const hasScore = match.homeScore !== null && match.awayScore !== null;
                        const scoreDisplay = hasScore ? `${match.homeScore} - ${match.awayScore}` : '';
                        const statusDisplay = match.matchStatus === 'completed' ? '✅' : 
                                            match.matchStatus === 'in_progress' ? '⏱️' : 
                                            match.matchStatus === 'cancelled' ? '❌' : '';
                        
                        // Cards count
                        const cardCounts = match.cards ? match.cards.reduce((acc, card) => {
                            acc[card.cardType] = (acc[card.cardType] || 0) + 1;
                            return acc;
                        }, {}) : {};
                        
                        const cardsDisplay = [
                            cardCounts.yellow ? `🟨${cardCounts.yellow}` : '',
                            cardCounts.red ? `🟥${cardCounts.red}` : ''
                        ].filter(Boolean).join(' ');
                        
                        return `
                            <div class="match-item">
                                <div class="match-teams">
                                    <div class="team-info-match">
                                        <span class="team-name-match">${homeTeam ? homeTeam.name : 'Unknown Team'}</span>
                                        ${homeTeam && homeTeam.category ? `<div class="team-category-small">${homeTeam.category}</div>` : ''}
                                        <div class="attendance-count">👥 ${homeAttendanceCount}/${homeTotalPlayers}</div>
                                    </div>
                                    <div class="vs-text">
                                        ${hasScore ? scoreDisplay : 'VS'}
                                        ${statusDisplay ? `<div style="font-size: 0.8em;">${statusDisplay}</div>` : ''}
                                    </div>
                                    <div class="team-info-match">
                                        <span class="team-name-match">${awayTeam ? awayTeam.name : 'Unknown Team'}</span>
                                        ${awayTeam && awayTeam.category ? `<div class="team-category-small">${awayTeam.category}</div>` : ''}
                                        <div class="attendance-count">👥 ${awayAttendanceCount}/${awayTotalPlayers}</div>
                                    </div>
                                </div>
                                ${match.field ? `<div class="match-field">Field: ${match.field}</div>` : ''}
                                ${match.time_epoch ? `<div class="match-time">Time: ${epochToPacificTime(match.time_epoch)}</div>` : ''}
                                ${mainReferee ? `<div class="match-referee-events">
                                    <span class="referee-bubble">👨‍⚖️ ${mainReferee.name}</span>
                                    ${assistantReferee ? `<span class="referee-bubble">👨‍⚖️ ${assistantReferee.name}</span>` : ''}
                                </div>` : ''}
                                ${cardsDisplay ? `<div class="match-cards">Cards: ${cardsDisplay}</div>` : ''}
                                <div class="match-actions">
                                    <button class="btn btn-small" onclick="app.viewMatch('${event.id}', '${match.id}')" title="View Match">👁️</button>
                                    <button class="btn btn-small btn-secondary" onclick="editMatchResult('${event.id}', '${match.id}')" title="Edit Result">🏆</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    ${event.matches.length === 0 ? '<div class="empty-state"><p>No matches yet</p></div>' : ''}
                </div>
            </div>
        `).join('');
    }
    
    renderReferees() {
        const container = document.getElementById('referees-container');
        
        if (this.referees.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No referees yet</h3>
                    <p>No referees available</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.referees.map(referee => `
            <div class="team-card" style="border-left-color: #28a745">
                <div class="team-header">
                    <div>
                        <div class="team-name">${referee.name}</div>
                        ${referee.phone ? `<div class="team-category">📞 ${referee.phone}</div>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    renderStandings() {
        const container = document.getElementById('standings-container');
        const showCurrentSeasonOnly = document.getElementById('show-current-season-only')?.checked ?? true;
        
        // Calculate standings for each division
        const standings = this.calculateStandings(showCurrentSeasonOnly);
        
        if (standings.over30.length === 0 && standings.over40.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No match results yet</h3>
                    <p>Standings will appear when matches have been played and results entered</p>
                </div>
            `;
            return;
        }
        
        let htmlContent = '';
        
        // Over 30 Division
        if (standings.over30.length > 0) {
            htmlContent += `
                <div class="standings-division">
                    <div class="division-title">Over 30 Division</div>
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th class="standings-position">Pos</th>
                                <th class="team-name-header">Team</th>
                                <th>GP</th>
                                <th>W</th>
                                <th>D</th>
                                <th>L</th>
                                <th>GF</th>
                                <th>GA</th>
                                <th>GD</th>
                                <th class="standings-points">Pts</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${standings.over30.map((team, index) => `
                                <tr>
                                    <td class="standings-position">${index + 1}</td>
                                    <td class="team-name-cell">${team.name}</td>
                                    <td class="standings-stats">${team.gamesPlayed}</td>
                                    <td class="standings-stats">${team.wins}</td>
                                    <td class="standings-stats">${team.draws}</td>
                                    <td class="standings-stats">${team.losses}</td>
                                    <td class="standings-stats">${team.goalsFor}</td>
                                    <td class="standings-stats">${team.goalsAgainst}</td>
                                    <td class="standings-stats">${team.goalDifference >= 0 ? '+' : ''}${team.goalDifference}</td>
                                    <td class="standings-points">${team.points}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        // Over 40 Division
        if (standings.over40.length > 0) {
            htmlContent += `
                <div class="standings-division">
                    <div class="division-title">Over 40 Division</div>
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th class="standings-position">Pos</th>
                                <th class="team-name-header">Team</th>
                                <th>GP</th>
                                <th>W</th>
                                <th>D</th>
                                <th>L</th>
                                <th>GF</th>
                                <th>GA</th>
                                <th>GD</th>
                                <th class="standings-points">Pts</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${standings.over40.map((team, index) => `
                                <tr>
                                    <td class="standings-position">${index + 1}</td>
                                    <td class="team-name-cell">${team.name}</td>
                                    <td class="standings-stats">${team.gamesPlayed}</td>
                                    <td class="standings-stats">${team.wins}</td>
                                    <td class="standings-stats">${team.draws}</td>
                                    <td class="standings-stats">${team.losses}</td>
                                    <td class="standings-stats">${team.goalsFor}</td>
                                    <td class="standings-stats">${team.goalsAgainst}</td>
                                    <td class="standings-stats">${team.goalDifference >= 0 ? '+' : ''}${team.goalDifference}</td>
                                    <td class="standings-points">${team.points}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        container.innerHTML = htmlContent;
    }
    
    calculateStandings(currentSeasonOnly = true) {
        // Initialize team stats by division
        const teamStats = {};
        
        // Initialize all teams with zero stats
        this.teams.forEach(team => {
            if (team.category === 'Over 30' || team.category === 'Over 40') {
                teamStats[team.id] = {
                    id: team.id,
                    name: team.name,
                    category: team.category,
                    gamesPlayed: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                    goalDifference: 0,
                    points: 0
                };
            }
        });
        
        // Process completed matches
        this.events.forEach(event => {
            // Filter by season if requested
            if (currentSeasonOnly && !this.isCurrentSeasonEvent(event.date_epoch)) {
                return;
            }
            
            event.matches.forEach(match => {
                // Only process completed matches with scores
                if (match.matchStatus === 'completed' && 
                    match.homeScore !== null && 
                    match.awayScore !== null) {
                    
                    const homeTeam = teamStats[match.homeTeamId];
                    const awayTeam = teamStats[match.awayTeamId];
                    
                    if (homeTeam && awayTeam) {
                        const homeScore = parseInt(match.homeScore);
                        const awayScore = parseInt(match.awayScore);
                        
                        // Update games played
                        homeTeam.gamesPlayed++;
                        awayTeam.gamesPlayed++;
                        
                        // Update goals
                        homeTeam.goalsFor += homeScore;
                        homeTeam.goalsAgainst += awayScore;
                        awayTeam.goalsFor += awayScore;
                        awayTeam.goalsAgainst += homeScore;
                        
                        // Update win/draw/loss and points (3 points for win, 1 for draw)
                        if (homeScore > awayScore) {
                            // Home team wins
                            homeTeam.wins++;
                            homeTeam.points += 3;
                            awayTeam.losses++;
                        } else if (awayScore > homeScore) {
                            // Away team wins
                            awayTeam.wins++;
                            awayTeam.points += 3;
                            homeTeam.losses++;
                        } else {
                            // Draw
                            homeTeam.draws++;
                            awayTeam.draws++;
                            homeTeam.points += 1;
                            awayTeam.points += 1;
                        }
                        
                        // Update goal difference
                        homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
                        awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
                    }
                }
            });
        });
        
        // Separate and sort by division
        const over30Teams = Object.values(teamStats)
            .filter(team => team.category === 'Over 30')
            .sort((a, b) => {
                // Sort by: 1) Points, 2) Goal difference, 3) Goals for, 4) Team name
                if (b.points !== a.points) return b.points - a.points;
                if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
                if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
                return a.name.localeCompare(b.name);
            });
            
        const over40Teams = Object.values(teamStats)
            .filter(team => team.category === 'Over 40')
            .sort((a, b) => {
                // Sort by: 1) Points, 2) Goal difference, 3) Goals for, 4) Team name
                if (b.points !== a.points) return b.points - a.points;
                if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
                if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
                return a.name.localeCompare(b.name);
            });
        
        return {
            over30: over30Teams,
            over40: over40Teams
        };
    }
    
    // Helper function to create combined datetime for Card Tracker sorting
    getCardDateTime(card) {
        const baseDate = new Date(card.eventDate_epoch * 1000);
        
        if (card.matchTimeEpoch) {
            // Use time epoch directly if available
            const timeDate = new Date(card.matchTimeEpoch * 1000);
            // Combine date from event with time from time_epoch
            return new Date(
                baseDate.getFullYear(),
                baseDate.getMonth(), 
                baseDate.getDate(),
                timeDate.getHours(),
                timeDate.getMinutes(),
                timeDate.getSeconds()
            );
        } else if (card.matchTime && typeof card.matchTime === 'string') {
            // Parse time string (e.g., "13:30" or "1:30 PM")
            const timeStr = card.matchTime.trim();
            const [hours, minutes] = timeStr.includes(':') 
                ? timeStr.split(':').map(n => parseInt(n)) 
                : [0, 0];
            
            return new Date(
                baseDate.getFullYear(),
                baseDate.getMonth(),
                baseDate.getDate(),
                hours || 0,
                minutes || 0,
                0
            );
        } else {
            // No time available, use just the date (00:00:00)
            return baseDate;
        }
    }

    // Helper function to extract field number for Card Tracker sorting
    getCardFieldNumber(card) {
        if (!card.matchField) return 999999; // Put cards without field at end
        
        // Extract numeric part from field (e.g., "Field 1" -> 1, "1" -> 1)
        const fieldStr = card.matchField.toString().toLowerCase();
        const match = fieldStr.match(/(\d+)/);
        return match ? parseInt(match[1]) : 999999;
    }

    renderCardTracker() {
        console.log('🎯 renderCardTracker called');
        const container = document.getElementById('cards-tracker-container');
        const cardTypeFilter = document.getElementById('card-type-filter')?.value || 'all';
        
        console.log('📊 Card type filter:', cardTypeFilter);
        
        // Collect all cards from current season matches
        const cardRecords = this.collectCurrentSeasonCards();
        
        console.log('📊 Collected card records:', cardRecords.length);
        
        // Filter by card type if specified
        let filteredCards = cardRecords;
        if (cardTypeFilter !== 'all') {
            filteredCards = cardRecords.filter(card => card.cardType === cardTypeFilter);
        }
        
        console.log('📊 Filtered cards:', filteredCards.length);
        
        if (filteredCards.length === 0) {
            const message = cardTypeFilter === 'all' ? 'No cards issued' : `No ${cardTypeFilter} cards issued`;
            console.log('📊 No cards to display:', message);
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${message}</h3>
                    <p>Card records for the current season will appear here</p>
                </div>
            `;
            return;
        }
        
        console.log('📊 Displaying', filteredCards.length, 'cards');
        
        // Sort by combined date + time (most recent first), then by match, then by field number
        filteredCards.sort((a, b) => {
            const dateTimeA = this.getCardDateTime(a);
            const dateTimeB = this.getCardDateTime(b);
            
            // Primary sort: by most recent datetime first (descending)
            if (dateTimeA.getTime() !== dateTimeB.getTime()) {
                return dateTimeB - dateTimeA;
            }
            
            // Secondary sort: by field number (ascending) for cards at same datetime
            const fieldA = this.getCardFieldNumber(a);
            const fieldB = this.getCardFieldNumber(b);
            
            if (fieldA !== fieldB) {
                return fieldA - fieldB;
            }
            
            // Tertiary sort: by match (to group cards from same game together)
            if (a.matchInfo !== b.matchInfo) {
                return a.matchInfo.localeCompare(b.matchInfo);
            }
            
            // Quaternary sort: by team name for consistency within same match
            return a.teamName.localeCompare(b.teamName);
        });
        
        container.innerHTML = `
            <!-- Desktop Table View -->
            <table class="card-tracker-table">
                <thead>
                    <tr>
                        <th>Team</th>
                        <th>Player</th>
                        <th class="center-header">Card</th>
                        <th>Infraction</th>
                        <th>Notes</th>
                        <th>Match</th>
                        <th>Referee</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredCards.map(card => `
                        <tr>
                            <td class="team-name-badge">${card.teamName}</td>
                            <td class="player-name-cell">${card.playerName}</td>
                            <td class="center-cell">
                                <span class="card-type-badge card-type-${card.cardType}">
                                    ${card.cardType === 'yellow' ? '🟨 Yellow' : '🟥 Red'}
                                </span>
                            </td>
                            <td>${card.reason || 'Not specified'}</td>
                            <td class="notes-cell" title="${card.notes || ''}">${card.notes || '—'}</td>
                            <td class="match-info-cell">
                                <div><strong>${card.matchInfo}</strong></div>
                                <div style="font-size: 0.8em; color: #888;">${epochToPacificDate(card.eventDate_epoch || card.eventDate)}</div>
                                ${card.minute ? `<div style="font-size: 0.8em; color: #888;">${card.minute}'</div>` : ''}
                            </td>
                            <td class="referee-cell">${card.refereeName || 'Not recorded'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <!-- Mobile Card View -->
            <div class="card-tracker-mobile">
                ${filteredCards.map(card => `
                    <div class="card-record-item">
                        <div class="card-record-header">
                            <div class="card-type-section">
                                <span class="card-type-badge card-type-${card.cardType}">
                                    ${card.cardType === 'yellow' ? '🟨 Yellow' : '🟥 Red'}
                                </span>
                                ${card.minute ? `<span class="card-minute">${card.minute}'</span>` : ''}
                            </div>
                            <div class="card-date">${epochToPacificDate(card.eventDate_epoch || card.eventDate)}</div>
                        </div>
                        
                        <div class="card-record-details">
                            <div class="player-team-info">
                                <div class="player-name-large">${card.playerName}</div>
                                <div class="team-name-large">${card.teamName}</div>
                            </div>
                            
                            <div class="match-info-section">
                                <div class="match-teams"><strong>${card.matchInfo}</strong></div>
                                ${card.refereeName ? `<div class="referee-info">Referee: ${card.refereeName}</div>` : ''}
                            </div>
                            
                            ${card.reason ? `
                                <div class="infraction-section">
                                    <div class="infraction-label">Infraction:</div>
                                    <div class="infraction-text">${card.reason}</div>
                                </div>
                            ` : ''}
                            
                            ${card.notes ? `
                                <div class="notes-section">
                                    <div class="notes-label">Notes:</div>
                                    <div class="notes-text">${card.notes}</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <!-- Card Tracking Charts Section -->
            <div class="card-charts-section">
                <div class="charts-header">
                    <h3 class="charts-title">📊 Card Statistics & Analytics</h3>
                    <p class="charts-subtitle">Visual analysis of card issuance patterns for the current season</p>
                </div>
                
                <div class="charts-grid">
                    <div class="chart-container">
                        <h4 class="chart-title">Cards by Match Date</h4>
                        <div class="chart-canvas">
                            <canvas id="cards-by-date-chart"></canvas>
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        <h4 class="chart-title">Cards by Team & Division</h4>
                        <div class="chart-canvas">
                            <canvas id="cards-by-team-chart"></canvas>
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        <h4 class="chart-title">Cards by Infraction Reason</h4>
                        <div class="chart-canvas">
                            <canvas id="cards-by-reason-chart"></canvas>
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        <h4 class="chart-title">Cards by Referee</h4>
                        <div class="chart-canvas">
                            <canvas id="cards-by-referee-chart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Render the charts after the HTML is in place
        this.waitForChartJsAndRender(cardRecords);
    }
    
    collectCurrentSeasonCards() {
        const cardRecords = [];
        
        // Create lookup maps for efficiency
        const teamLookup = new Map();
        const refereeLookup = new Map();
        
        this.teams.forEach(team => teamLookup.set(team.id, team));
        this.referees.forEach(referee => refereeLookup.set(referee.id, referee));
        
        // Process all events and matches
        this.events.forEach(event => {
            // Only include current season events
            if (!this.isCurrentSeasonEvent(event.date_epoch)) {
                return;
            }
            
            event.matches.forEach(match => {
                if (!match.cards || match.cards.length === 0) {
                    return;
                }
                
                const homeTeam = teamLookup.get(match.homeTeamId);
                const awayTeam = teamLookup.get(match.awayTeamId);
                const mainReferee = refereeLookup.get(match.mainRefereeId);
                
                // Process each card in the match
                match.cards.forEach(card => {
                    // Determine which team the player belongs to
                    let playerTeam = null;
                    let playerName = card.memberName || 'Unknown Player'; // Use API-provided name first
                    
                    // Check home team first
                    if (homeTeam) {
                        const homePlayer = homeTeam.members.find(m => m.id === card.memberId);
                        if (homePlayer) {
                            playerTeam = homeTeam;
                            playerName = homePlayer.name; // Override with current team roster name if found
                        }
                    }
                    
                    // Check away team if not found in home team
                    if (!playerTeam && awayTeam) {
                        const awayPlayer = awayTeam.members.find(m => m.id === card.memberId);
                        if (awayPlayer) {
                            playerTeam = awayTeam;
                            playerName = awayPlayer.name; // Override with current team roster name if found
                        }
                    }
                    
                    cardRecords.push({
                        eventDate_epoch: event.date_epoch, // Add epoch for template compatibility
                        eventName: event.name,
                        matchInfo: `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`,
                        teamName: playerTeam?.name || 'Unknown Team',
                        playerName: playerName,
                        cardType: card.cardType,
                        reason: card.reason,
                        notes: card.notes,
                        minute: card.minute,
                        refereeName: mainReferee?.name,
                        // Add match time and field for enhanced sorting
                        matchTime: match.time,
                        matchTimeEpoch: match.time_epoch,
                        matchField: match.field
                    });
                });
            });
        });
        
        return cardRecords;
    }
    
    // Helper function to create team result bubbles for Game Tracker
    getTeamResultBubbles(homeTeam, awayTeam, homeScore, awayScore, hasScore) {
        if (!hasScore || homeScore === null || awayScore === null) {
            // No result available - show both teams as no-result
            return `
                <div class="match-teams-bubbled">
                    <span class="team-result-bubble no-result">${homeTeam}</span>
                    <span class="vs-separator">VS</span>
                    <span class="team-result-bubble no-result">${awayTeam}</span>
                </div>
            `;
        }
        
        const homeScoreNum = parseInt(homeScore);
        const awayScoreNum = parseInt(awayScore);
        
        let homeClass, awayClass;
        
        if (homeScoreNum > awayScoreNum) {
            // Home team wins
            homeClass = 'winner';
            awayClass = 'loser';
        } else if (awayScoreNum > homeScoreNum) {
            // Away team wins
            homeClass = 'loser';
            awayClass = 'winner';
        } else {
            // Tie
            homeClass = 'tie';
            awayClass = 'tie';
        }
        
        return `
            <div class="match-teams-bubbled">
                <span class="team-result-bubble ${homeClass}">${homeTeam}</span>
                <span class="vs-separator">VS</span>
                <span class="team-result-bubble ${awayClass}">${awayTeam}</span>
            </div>
        `;
    }

    renderGameTracker() {
        console.log('🎯 renderGameTracker called');
        const container = document.getElementById('game-tracker-container');
        const statusFilter = document.getElementById('game-status-filter')?.value || 'incomplete';
        const showCurrentSeasonOnly = document.getElementById('show-current-season-games')?.checked ?? true;
        
        console.log('📊 Game status filter:', statusFilter);
        console.log('📅 Current season only:', showCurrentSeasonOnly);
        
        // Collect all matches from all events
        const gameRecords = this.collectAllGameRecords();
        
        console.log('📊 Collected game records:', gameRecords.length);
        
        // Filter by season if specified
        let filteredGames = gameRecords;
        if (showCurrentSeasonOnly) {
            filteredGames = gameRecords.filter(game => this.isCurrentSeasonEvent(game.eventDate_epoch));
        }
        
        // Filter by status
        if (statusFilter !== 'all') {
            if (statusFilter === 'incomplete') {
                // Show games that are not completed or cancelled AND are in the past
                const today = new Date();
                today.setHours(23, 59, 59, 999); // End of today
                
                filteredGames = filteredGames.filter(game => {
                    const gameDate = new Date(game.eventDate_epoch * 1000); // Use epoch timestamp
                    return game.status !== 'completed' && 
                           game.status !== 'cancelled' && 
                           gameDate < today; // Only past games
                });
            } else {
                filteredGames = filteredGames.filter(game => game.status === statusFilter);
            }
        }
        
        console.log('📊 Filtered games:', filteredGames.length);
        
        if (filteredGames.length === 0) {
            const message = statusFilter === 'all' ? 'No games found' : 
                           statusFilter === 'incomplete' ? 'No incomplete games' : 
                           `No ${statusFilter} games found`;
            console.log('📊 No games to display:', message);
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${message}</h3>
                    <p>Game records will appear here when available</p>
                </div>
            `;
            return;
        }
        
        console.log('📊 Displaying', filteredGames.length, 'games');
        
        // Sort by combined date + time (most recent datetime first)
        filteredGames.sort((a, b) => {
            // Create combined datetime for proper chronological sorting
            const getGameDateTime = (game) => {
                const baseDate = new Date(game.eventDate_epoch * 1000);
                
                if (game.time_epoch) {
                    // Use time epoch directly if available
                    const timeDate = new Date(game.time_epoch * 1000);
                    // Combine date from event with time from time_epoch
                    return new Date(
                        baseDate.getFullYear(),
                        baseDate.getMonth(), 
                        baseDate.getDate(),
                        timeDate.getHours(),
                        timeDate.getMinutes(),
                        timeDate.getSeconds()
                    );
                } else if (game.time && typeof game.time === 'string') {
                    // Parse time string (e.g., "13:30" or "1:30 PM")
                    const timeStr = game.time.trim();
                    const [hours, minutes] = timeStr.includes(':') 
                        ? timeStr.split(':').map(n => parseInt(n)) 
                        : [0, 0];
                    
                    return new Date(
                        baseDate.getFullYear(),
                        baseDate.getMonth(),
                        baseDate.getDate(),
                        hours || 0,
                        minutes || 0,
                        0
                    );
                } else {
                    // No time available, use just the date (00:00:00)
                    return baseDate;
                }
            };
            
            const dateTimeA = getGameDateTime(a);
            const dateTimeB = getGameDateTime(b);
            
            // Primary sort: by most recent datetime first (descending)
            if (dateTimeA.getTime() !== dateTimeB.getTime()) {
                return dateTimeB - dateTimeA;
            }
            
            // Secondary sort: by field number (ascending) for games at same datetime
            const getFieldNumber = (game) => {
                if (!game.field) return 999999; // Put games without field at end
                
                // Extract numeric part from field (e.g., "Field 1" -> 1, "1" -> 1)
                const fieldStr = game.field.toString().toLowerCase();
                const match = fieldStr.match(/(\d+)/);
                return match ? parseInt(match[1]) : 999999;
            };
            
            const fieldA = getFieldNumber(a);
            const fieldB = getFieldNumber(b);
            
            return fieldA - fieldB; // Ascending order by field number
        });
        
        container.innerHTML = `
            <!-- Desktop Table View -->
            <div class="game-tracker-table-container">
                <table class="game-tracker-table">
                    <thead>
                        <tr>
                            <th>Date/Time</th>
                            <th>Event</th>
                            <th>Match</th>
                            <th>Score</th>
                            <th>Field</th>
                            <th>Status</th>
                            <th>Referee(s)</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredGames.map(game => `
                            <tr class="game-row ${game.status}">
                                <td class="date-time-cell">
                                    <div class="game-date">${epochToPacificDate(game.eventDate_epoch || game.eventDate)}</div>
                                    ${game.time_epoch ? `<div class="game-time">${epochToPacificTime(game.time_epoch)}</div>` : ''}
                                </td>
                                <td class="event-cell">
                                    <div class="event-name">${game.eventName}</div>
                                </td>
                                <td class="match-cell">
                                    ${this.getTeamResultBubbles(game.homeTeam, game.awayTeam, game.homeScore, game.awayScore, game.hasScore)}
                                </td>
                                <td class="score-cell">
                                    ${game.status === 'completed' && game.hasScore ? `${game.homeScore} - ${game.awayScore}` : '—'}
                                </td>
                                <td class="field-cell">
                                    ${game.field ? `Field ${game.field}` : '—'}
                                </td>
                                <td class="status-cell">
                                    <span class="status-badge status-${game.status}">${this.getStatusDisplay(game.status)}</span>
                                </td>
                                <td class="referee-cell">
                                    ${game.referees.length > 0 ? 
                                        game.referees.map(ref => `<span class="referee-bubble">${ref}</span>`).join('<br>') 
                                        : '—'}
                                </td>
                                <td class="actions-cell">
                                    ${game.status !== 'completed' && game.status !== 'cancelled' ? 
                                        `<button class="btn btn-small" onclick="editMatchResult('${game.eventId}', '${game.matchId}')" title="Edit Result">🏆</button>` 
                                        : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <!-- Mobile Card View -->
            <div class="game-tracker-mobile">
                ${filteredGames.map(game => `
                    <div class="game-record-item">
                        <div class="game-record-header">
                            <div class="game-info-section">
                                <div class="game-date-large">${epochToPacificDate(game.eventDate_epoch || game.eventDate)}</div>
                                ${game.time_epoch ? `<div class="game-time-large">${epochToPacificTime(game.time_epoch)}</div>` : ''}
                            </div>
                            <div class="game-status-section">
                                <span class="status-badge status-${game.status}">${this.getStatusDisplay(game.status)}</span>
                            </div>
                        </div>
                        
                        <div class="game-record-details">
                            <div class="event-info">
                                <div class="event-name-large">${game.eventName}</div>
                                ${this.getTeamResultBubbles(game.homeTeam, game.awayTeam, game.homeScore, game.awayScore, game.hasScore)}
                            </div>
                            
                            <div class="game-details-grid">
                                ${game.field ? `<div class="detail-item"><span class="detail-label">Field:</span> ${game.field}</div>` : ''}
                                <div class="detail-item"><span class="detail-label">Score:</span> ${game.status === 'completed' && game.hasScore ? `${game.homeScore} - ${game.awayScore}` : 'Not entered'}</div>
                                ${game.referees.length > 0 ? `
                                    <div class="detail-item">
                                        <span class="detail-label">Referee(s):</span>
                                        <div class="mobile-referees">
                                            ${game.referees.map(ref => `<span class="referee-bubble">${ref}</span>`).join(' ')}
                                        </div>
                                    </div>
                                ` : ''}
                                
                                ${game.status !== 'completed' && game.status !== 'cancelled' ? `
                                    <div class="detail-item">
                                        <button class="btn btn-small" onclick="editMatchResult('${game.eventId}', '${game.matchId}')">Edit Result 🏆</button>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    collectAllGameRecords() {
        console.log('🔍 collectAllGameRecords called');
        console.log('📊 Available events:', this.events.length);
        console.log('👥 Available teams basic:', this.teamsBasic.length);
        console.log('👨‍⚖️ Available referees:', this.referees.length);
        
        const gameRecords = [];
        
        // Create lookup maps for efficiency
        const teamLookup = new Map();
        const refereeLookup = new Map();
        
        this.teamsBasic.forEach(team => teamLookup.set(team.id, team));
        this.referees.forEach(referee => refereeLookup.set(referee.id, referee));
        
        // Process all events and matches
        this.events.forEach((event, eventIndex) => {
            console.log(`📅 Processing event ${eventIndex + 1}/${this.events.length}: ${event.name} (${new Date(event.date_epoch * 1000).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })})`);
            
            if (!event.matches || event.matches.length === 0) {
                console.log(`⚠️ Event ${event.name} has no matches`);
                return;
            }
            
            event.matches.forEach((match, matchIndex) => {
                console.log(`🏆 Processing match ${matchIndex + 1}/${event.matches.length}: ${match.homeTeamId} vs ${match.awayTeamId}`);
                
                const homeTeam = teamLookup.get(match.homeTeamId);
                const awayTeam = teamLookup.get(match.awayTeamId);
                const mainReferee = refereeLookup.get(match.mainRefereeId);
                const assistantReferee = refereeLookup.get(match.assistantRefereeId);
                
                // Build referees array
                const referees = [];
                if (mainReferee) referees.push(`👨‍⚖️ ${mainReferee.name}`);
                if (assistantReferee) referees.push(`👨‍⚖️ ${assistantReferee.name}`);
                
                const gameRecord = {
                    eventId: event.id,
                    matchId: match.id,
                    eventDate_epoch: event.date_epoch, // Keep epoch for template compatibility
                    time_epoch: match.time_epoch, // Use correct property name for template
                    eventName: event.name,
                    homeTeam: homeTeam?.name || 'Unknown Team',
                    awayTeam: awayTeam?.name || 'Unknown Team',
                    field: match.field,
                    status: match.matchStatus || 'scheduled',
                    hasScore: match.homeScore !== null && match.awayScore !== null,
                    homeScore: match.homeScore,
                    awayScore: match.awayScore,
                    referees: referees
                };
                
                console.log(`✅ Game record created:`, gameRecord);
                gameRecords.push(gameRecord);
            });
        });
        
        console.log(`🎯 Final result: ${gameRecords.length} game records collected`);
        return gameRecords;
    }
    
    getStatusDisplay(status) {
        const statusMap = {
            'scheduled': '📅 Scheduled',
            'in_progress': '⏱️ In Progress',
            'completed': '✅ Completed',
            'cancelled': '❌ Cancelled'
        };
        return statusMap[status] || '📅 Scheduled';
    }
    
    async waitForChartJsAndRender(cardRecords) {
        console.log('⏳ Waiting for Chart.js to load...');
        
        // Check if Chart.js is already available
        if (typeof Chart !== 'undefined') {
            console.log('✅ Chart.js is already loaded');
            this.renderCardTrackingCharts(cardRecords);
            return;
        }
        
        // Wait for Chart.js to load with timeout
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        const checkForChart = () => {
            attempts++;
            console.log(`🔍 Chart.js check attempt ${attempts}/${maxAttempts}`);
            
            if (typeof Chart !== 'undefined') {
                console.log('✅ Chart.js loaded successfully!');
                this.renderCardTrackingCharts(cardRecords);
                return;
            }
            
            if (attempts >= maxAttempts) {
                console.error('❌ Chart.js failed to load after', maxAttempts * 100, 'ms');
                this.showChartLoadingError();
                return;
            }
            
            // Try again in 100ms
            setTimeout(checkForChart, 100);
        };
        
        checkForChart();
    }
    
    showChartLoadingError() {
        const chartsSection = document.querySelector('.card-charts-section');
        if (chartsSection) {
            chartsSection.innerHTML = `
                <div class="charts-header">
                    <h3 class="charts-title">📊 Card Statistics & Analytics</h3>
                    <p class="charts-subtitle" style="color: #dc3545;">Chart.js library failed to load</p>
                </div>
                <div style="padding: 20px; text-align: center; color: #dc3545; background: #fff5f5; border-radius: 8px; margin: 20px;">
                    <p><strong>Charts are temporarily unavailable</strong></p>
                    <p style="font-size: 0.9em; margin-top: 10px;">The Chart.js library could not be loaded from the CDN.</p>
                    <p style="font-size: 0.9em;">Please check your internet connection and refresh the page.</p>
                    <button onclick="window.location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Reload Page
                    </button>
                </div>
            `;
        }
    }
    
    renderCardTrackingCharts(cardRecords) {
        console.log('🎯 renderCardTrackingCharts called with', cardRecords.length, 'card records');
        
        // Check if charts are globally disabled
        if (window.chartsDisabled) {
            console.log('📊 Charts are disabled globally');
            ['cards-by-date-chart', 'cards-by-team-chart', 'cards-by-reason-chart', 'cards-by-referee-chart'].forEach(chartId => {
                const canvas = document.getElementById(chartId);
                if (canvas) {
                    canvas.parentElement.innerHTML = '<div class="chart-no-data">Charts temporarily unavailable - Chart.js library failed to load</div>';
                }
            });
            return;
        }
        
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded! Cannot render charts.');
            ['cards-by-date-chart', 'cards-by-team-chart', 'cards-by-reason-chart', 'cards-by-referee-chart'].forEach(chartId => {
                const canvas = document.getElementById(chartId);
                if (canvas) {
                    canvas.parentElement.innerHTML = '<div class="chart-no-data">Chart.js library not loaded - charts unavailable</div>';
                }
            });
            return;
        }
        
        // Destroy existing charts if they exist
        if (this.cardCharts) {
            Object.values(this.cardCharts).forEach(chart => {
                if (chart) {
                    try {
                        chart.destroy();
                    } catch (e) {
                        console.warn('Error destroying chart:', e);
                    }
                }
            });
        }
        this.cardCharts = {};
        
        if (cardRecords.length === 0) {
            console.log('📊 No card records - showing empty state');
            // Show no data messages for all charts
            ['cards-by-date-chart', 'cards-by-team-chart', 'cards-by-reason-chart', 'cards-by-referee-chart'].forEach(chartId => {
                const canvas = document.getElementById(chartId);
                if (canvas) {
                    canvas.parentElement.innerHTML = '<div class="chart-no-data">No card data available for the current season</div>';
                }
            });
            return;
        }
        
        console.log('📊 Rendering charts with card data...');
        
        try {
            // 1. Cards by Match Date Chart
            this.renderCardsByDateChart(cardRecords);
            console.log('✅ Cards by date chart rendered');
        } catch (error) {
            console.error('❌ Error rendering cards by date chart:', error);
        }
        
        try {
            // 2. Cards by Team & Division Chart
            this.renderCardsByTeamChart(cardRecords);
            console.log('✅ Cards by team chart rendered');
        } catch (error) {
            console.error('❌ Error rendering cards by team chart:', error);
        }
        
        try {
            // 3. Cards by Infraction Reason Chart
            this.renderCardsByReasonChart(cardRecords);
            console.log('✅ Cards by reason chart rendered');
        } catch (error) {
            console.error('❌ Error rendering cards by reason chart:', error);
        }
        
        try {
            // 4. Cards by Referee Chart
            this.renderCardsByRefereeChart(cardRecords);
            console.log('✅ Cards by referee chart rendered');
        } catch (error) {
            console.error('❌ Error rendering cards by referee chart:', error);
        }
    }
    
    renderCardsByDateChart(cardRecords) {
        const canvas = document.getElementById('cards-by-date-chart');
        if (!canvas) return;
        
        // Group cards by date and card type
        const dateGroups = {};
        cardRecords.forEach(card => {
            const date = epochToPacificDate(card.eventDate_epoch || card.eventDate);
            if (!dateGroups[date]) {
                dateGroups[date] = { yellow: 0, red: 0 };
            }
            dateGroups[date][card.cardType]++;
        });
        
        // Sort dates chronologically
        const sortedDates = Object.keys(dateGroups).sort((a, b) => new Date(a) - new Date(b));
        const yellowData = sortedDates.map(date => dateGroups[date].yellow);
        const redData = sortedDates.map(date => dateGroups[date].red);
        
        this.cardCharts.byDate = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: sortedDates,
                datasets: [
                    {
                        label: 'Yellow Cards',
                        data: yellowData,
                        backgroundColor: '#ffc107',
                        borderColor: '#ffb000',
                        borderWidth: 1
                    },
                    {
                        label: 'Red Cards',
                        data: redData,
                        backgroundColor: '#dc3545',
                        borderColor: '#c82333',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Match Date'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Cards'
                        },
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
    
    renderCardsByTeamChart(cardRecords) {
        const canvas = document.getElementById('cards-by-team-chart');
        if (!canvas) return;
        
        // Group cards by team and card type
        const teamGroups = {};
        cardRecords.forEach(card => {
            const team = this.teams.find(t => t.name === card.teamName);
            const teamKey = team ? `${card.teamName} (${team.category || 'No Division'})` : card.teamName;
            
            if (!teamGroups[teamKey]) {
                teamGroups[teamKey] = { yellow: 0, red: 0 };
            }
            teamGroups[teamKey][card.cardType]++;
        });
        
        // Sort teams by total cards (descending)
        const sortedTeams = Object.keys(teamGroups).sort((a, b) => {
            const totalA = teamGroups[a].yellow + teamGroups[a].red;
            const totalB = teamGroups[b].yellow + teamGroups[b].red;
            return totalB - totalA;
        });
        
        const yellowData = sortedTeams.map(team => teamGroups[team].yellow);
        const redData = sortedTeams.map(team => teamGroups[team].red);
        
        this.cardCharts.byTeam = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: sortedTeams,
                datasets: [
                    {
                        label: 'Yellow Cards',
                        data: yellowData,
                        backgroundColor: '#ffc107',
                        borderColor: '#ffb000',
                        borderWidth: 1
                    },
                    {
                        label: 'Red Cards',
                        data: redData,
                        backgroundColor: '#dc3545',
                        borderColor: '#c82333',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Team (Division)'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Cards'
                        },
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
    
    renderCardsByReasonChart(cardRecords) {
        const canvas = document.getElementById('cards-by-reason-chart');
        if (!canvas) return;
        
        // Group cards by reason and card type
        const reasonGroups = {};
        cardRecords.forEach(card => {
            const reason = card.reason || 'Not specified';
            if (!reasonGroups[reason]) {
                reasonGroups[reason] = { yellow: 0, red: 0 };
            }
            reasonGroups[reason][card.cardType]++;
        });
        
        // Sort reasons by total cards (descending)
        const sortedReasons = Object.keys(reasonGroups).sort((a, b) => {
            const totalA = reasonGroups[a].yellow + reasonGroups[a].red;
            const totalB = reasonGroups[b].yellow + reasonGroups[b].red;
            return totalB - totalA;
        });
        
        const yellowData = sortedReasons.map(reason => reasonGroups[reason].yellow);
        const redData = sortedReasons.map(reason => reasonGroups[reason].red);
        
        this.cardCharts.byReason = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: sortedReasons,
                datasets: [
                    {
                        label: 'Yellow Cards',
                        data: yellowData,
                        backgroundColor: '#ffc107',
                        borderColor: '#ffb000',
                        borderWidth: 1
                    },
                    {
                        label: 'Red Cards',
                        data: redData,
                        backgroundColor: '#dc3545',
                        borderColor: '#c82333',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Infraction Reason'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Cards'
                        },
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
    
    renderCardsByRefereeChart(cardRecords) {
        const canvas = document.getElementById('cards-by-referee-chart');
        if (!canvas) return;
        
        // Group cards by referee and card type
        const refereeGroups = {};
        cardRecords.forEach(card => {
            const referee = card.refereeName || 'Not recorded';
            if (!refereeGroups[referee]) {
                refereeGroups[referee] = { yellow: 0, red: 0 };
            }
            refereeGroups[referee][card.cardType]++;
        });
        
        // Sort referees by total cards (descending)
        const sortedReferees = Object.keys(refereeGroups).sort((a, b) => {
            const totalA = refereeGroups[a].yellow + refereeGroups[a].red;
            const totalB = refereeGroups[b].yellow + refereeGroups[b].red;
            return totalB - totalA;
        });
        
        const yellowData = sortedReferees.map(referee => refereeGroups[referee].yellow);
        const redData = sortedReferees.map(referee => refereeGroups[referee].red);
        
        this.cardCharts.byReferee = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: sortedReferees,
                datasets: [
                    {
                        label: 'Yellow Cards',
                        data: yellowData,
                        backgroundColor: '#ffc107',
                        borderColor: '#ffb000',
                        borderWidth: 1
                    },
                    {
                        label: 'Red Cards',
                        data: redData,
                        backgroundColor: '#dc3545',
                        borderColor: '#c82333',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Referee'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Cards'
                        },
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
    
    // Season Management Methods (Read-Only View)
    renderSeasonManagement() {
        const container = document.getElementById('season-management-container');
        const seasonDisplay = document.getElementById('current-season-display');
        
        const currentSeason = this.getCurrentSeason();
        seasonDisplay.textContent = `${currentSeason.type} ${currentSeason.year}`;
        
        // Calculate season statistics
        const stats = this.calculateSeasonStats();
        
        container.innerHTML = `
            <div class="season-overview-card">
                <div class="season-title">
                    <span>🏆</span>
                    <span>${currentSeason.type} ${currentSeason.year} Season</span>
                </div>
                
                <div class="season-stats">
                    <div class="stat-item">
                        <div class="stat-number">${stats.totalEvents}</div>
                        <div class="stat-label">Events</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${stats.totalMatches}</div>
                        <div class="stat-label">Matches</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${stats.totalCards}</div>
                        <div class="stat-label">Cards Issued</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${stats.completedMatches}</div>
                        <div class="stat-label">Completed Matches</div>
                    </div>
                </div>
                
                ${this.renderPendingSuspensions(stats.pendingSuspensions)}
                
                <div class="view-only-notice">
                    <div class="view-only-notice-title">
                        <span>👀</span>
                        <span>Read-Only Mode</span>
                    </div>
                    <p style="margin: 0; color: #1565c0; font-size: 0.9em;">
                        Season management functions are not available in view-only mode. Use the main admin interface to close seasons and migrate data.
                    </p>
                </div>
            </div>
        `;
    }
    
    calculateSeasonStats() {
        const stats = {
            totalEvents: 0,
            totalMatches: 0,
            totalCards: 0,
            completedMatches: 0,
            pendingSuspensions: []
        };
        
        // Count current season events and matches
        this.events.forEach(event => {
            if (this.isCurrentSeasonEvent(event.date_epoch)) {
                stats.totalEvents++;
                stats.totalMatches += event.matches.length;
                
                event.matches.forEach(match => {
                    if (match.matchStatus === 'completed') {
                        stats.completedMatches++;
                    }
                    
                    if (match.cards) {
                        stats.totalCards += match.cards.length;
                        
                        // Check for unserved suspensions
                        match.cards.forEach(card => {
                            if (card.cardType === 'red' && 
                                card.suspensionMatches && 
                                card.suspensionMatches > 0 && 
                                !card.suspensionServed) {
                                
                                const team = this.teams.find(t => 
                                    t.members.some(m => m.id === card.memberId)
                                );
                                const member = team?.members.find(m => m.id === card.memberId);
                                
                                if (team && member) {
                                    stats.pendingSuspensions.push({
                                        playerName: member.name,
                                        teamName: team.name,
                                        matches: card.suspensionMatches,
                                        reason: card.reason || 'Not specified',
                                        eventName: event.name,
                                        eventDate: event.date
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });
        
        return stats;
    }
    
    renderPendingSuspensions(suspensions) {
        if (suspensions.length === 0) {
            return `
                <div class="pending-suspensions none">
                    <div class="suspensions-title none">
                        <span>✅</span>
                        <span>No Pending Suspensions</span>
                    </div>
                    <p style="margin: 0; color: #155724; font-style: italic;">All suspensions have been served or resolved.</p>
                </div>
            `;
        }
        
        return `
            <div class="pending-suspensions">
                <div class="suspensions-title">
                    <span>⚠️</span>
                    <span>Pending Suspensions (${suspensions.length})</span>
                </div>
                ${suspensions.map(suspension => `
                    <div class="suspension-item">
                        <div class="player-suspension-info">
                            <div class="player-name-suspension">${suspension.playerName}</div>
                            <div class="suspension-details">
                                ${suspension.teamName} • ${suspension.reason} • ${suspension.eventName}
                            </div>
                        </div>
                        <div class="suspension-matches">${suspension.matches} match${suspension.matches !== 1 ? 'es' : ''}</div>
                    </div>
                `).join('')}
                <p style="margin: 10px 0 0 0; color: #856404; font-size: 0.9em; font-style: italic;">
                    ⚠️ These suspensions must be resolved before the season can be closed.
                </p>
            </div>
        `;
    }
    
    // View Match (read-only)
    async viewMatch(eventId, matchId) {
        this.currentModalType = 'match';
        
        // LOADING SPINNER: Show loading modal immediately
        this.showLoadingModal('Loading players and their pictures... (this can take several seconds)');
        
        // Declare variables outside try block to fix scoping issue
        let event, match, homeTeam, awayTeam, mainReferee, assistantReferee;
        
        try {
            event = this.events.find(e => e.id === eventId);
            match = event.matches.find(m => m.id === matchId);
            
            // Load only the specific teams needed for this match (performance optimization)
            const requiredTeamIds = [match.homeTeamId, match.awayTeamId];
            const matchTeams = await this.loadSpecificTeams(requiredTeamIds);
            homeTeam = matchTeams.find(t => t.id === match.homeTeamId);
            awayTeam = matchTeams.find(t => t.id === match.awayTeamId);
            
            // Load referees if needed
            if (this.referees.length === 0) {
                await this.loadReferees();
            }
            
            mainReferee = match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null;
            assistantReferee = match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null;
        
        // Match status display
        const statusMap = {
            'scheduled': '📅 Scheduled',
            'in_progress': '⏱️ In Progress', 
            'completed': '✅ Completed',
            'cancelled': '❌ Cancelled'
        };
        const statusDisplay = statusMap[match.matchStatus] || '📅 Scheduled';
        
        // Score display
        const hasScore = match.homeScore !== null && match.awayScore !== null;
        const scoreSection = hasScore ? `
            <div style="margin-bottom: 20px; padding: 15px; background: #e8f5e8; border-radius: 8px; text-align: center;">
                <h3 style="margin: 0 0 10px 0; color: #28a745;">Final Score</h3>
                <div style="font-size: 2em; font-weight: bold; color: #333;">
                    ${homeTeam.name}: ${match.homeScore} - ${match.awayScore} :${awayTeam.name}
                </div>
            </div>
        ` : '';
        
        // Cards summary for header (simple count)
        const cardsSummary = match.cards && match.cards.length > 0 ? (() => {
            const yellowCount = match.cards.filter(card => card.cardType === 'yellow').length;
            const redCount = match.cards.filter(card => card.cardType === 'red').length;
            const parts = [];
            if (yellowCount > 0) parts.push(`🟨${yellowCount}`);
            if (redCount > 0) parts.push(`🟥${redCount}`);
            return parts.join(' ');
        })() : '';
        
        // Detailed cards display for separate section
        const cardsSection = match.cards && match.cards.length > 0 ? `
            <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px;">
                <h4 style="margin: 0 0 15px 0; color: #856404;">Cards & Disciplinary Actions</h4>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${match.cards.map(card => {
                        // Try to find member in current team rosters, otherwise use API-provided name
                        const member = [...homeTeam.members, ...awayTeam.members].find(m => m.id === card.memberId);
                        const memberName = member ? member.name : (card.memberName || 'Unknown Player');
                        const teamName = homeTeam.members.some(m => m.id === card.memberId) ? homeTeam.name : awayTeam.name;
                        const cardIcon = card.cardType === 'yellow' ? '🟨' : '🟥';
                        const cardColor = card.cardType === 'yellow' ? '#ffc107' : '#dc3545';
                        
                        return `
                            <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid ${cardColor};">
                                <span style="font-size: 1.2em;">${cardIcon}</span>
                                <div style="flex: 1;">
                                    <strong>${memberName}</strong> (${teamName})
                                    ${card.minute ? `<span style="color: #666;"> - ${card.minute}'</span>` : ''}
                                    ${card.reason ? `<div style="font-size: 0.9em; color: #666; margin-top: 2px;">${card.reason}</div>` : ''}
                                    ${card.notes ? `<div style="font-size: 0.85em; color: #888; margin-top: 2px; font-style: italic;">Notes: ${card.notes}</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        ` : '';
        
        // Check if check-in is locked
        const isLocked = this.isCheckInLocked(event, match);
        const lockInfo = this.getLockTimeInfo(event, match);
        const lockStatusDisplay = isLocked && lockInfo ? 
            `🔒 Locked since ${lockInfo.lockDate} at ${lockInfo.lockTimeFormatted}` : '';
        
        const modal = this.createModal(`${homeTeam.name} vs ${awayTeam.name}`, `
            <!-- Mobile-Optimized Check-In Interface -->
            <div class="mobile-checkin-interface">
                <!-- Optimized Header with All Match Details Inline -->
                <div class="checkin-header">
                    <div class="match-info-left">
                        <div class="match-score-line">
                            ${hasScore ? `<span class="score-display">${match.homeScore} - ${match.awayScore}</span>` : ''}
                            <span class="match-status ${match.matchStatus}">${statusDisplay}</span>
                        </div>
                        <div class="match-details-inline">
                            <span class="match-date">${epochToPacificDate(event.date_epoch)}</span>
                            ${match.time_epoch ? `<span class="match-time">${epochToPacificTime(match.time_epoch)}</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="match-info-right">
                        ${match.field ? `<div class="match-field">🏟️ Field ${match.field}</div>` : ''}
                        ${mainReferee ? `<div class="match-referee">
                            <span class="referee-bubble">👨‍⚖️ ${mainReferee.name}</span>
                            ${assistantReferee ? `<span class="referee-bubble">👨‍⚖️ ${assistantReferee.name}</span>` : ''}
                        </div>` : ''}
                        ${cardsSummary ? `<div class="cards-summary">📋 ${cardsSummary}</div>` : ''}
                        ${lockStatusDisplay ? `<div class="lock-status">${lockStatusDisplay}</div>` : ''}
                    </div>
                </div>
                
                <!-- Team Toggle - Compact Design -->
                <div class="team-toggle-compact">
                    <button class="team-toggle-btn active" id="home-toggle" onclick="app.toggleGridTeam('home')" style="border-left: 4px solid ${homeTeam.colorData};">
                        <span class="team-name">${homeTeam.name}</span>
                        <div class="attendance-count" id="home-attendance-count">
                            <div class="female-count">0/0 Female</div>
                            <div class="male-count">0/0 Male</div>
                        </div>
                    </button>
                    <button class="team-toggle-btn" id="away-toggle" onclick="app.toggleGridTeam('away')" style="border-left: 4px solid ${awayTeam.colorData};">
                        <span class="team-name">${awayTeam.name}</span>
                        <div class="attendance-count" id="away-attendance-count">
                            <div class="female-count">0/0 Female</div>
                            <div class="male-count">0/0 Male</div>
                        </div>
                    </button>
                </div>
                
                <!-- Collapsible Card Summary -->
                <div id="team-card-summary" class="team-card-summary" style="display: none;">
                    <div class="card-summary-header" onclick="app.toggleCardSummary()">
                        <span id="card-summary-text">ℹ️ 0 Players with cards</span>
                        <span id="card-summary-icon">▼</span>
                    </div>
                    <div id="card-summary-content" class="card-summary-content" style="display: none;">
                        <!-- Card details will be populated here -->
                    </div>
                </div>
                
                <!-- Detailed Cards Section (if any) -->
                ${cardsSection ? `<div class="detailed-cards-section" style="padding: 0 20px;">${cardsSection}</div>` : ''}
                
                <!-- Single Scroll Player Grid (No Nested Scrolling) -->
                <div class="checkin-grid-area">
                    <div id="grid-home-team" class="team-grid-section active">
                        <div id="grid-container-home" class="player-grid-container-fullscreen"></div>
                    </div>
                    
                    <div id="grid-away-team" class="team-grid-section">
                        <div id="grid-container-away" class="player-grid-container-fullscreen"></div>
                    </div>
                </div>
                
                <!-- Quick Stats Footer - Hidden since info moved to team header -->
                <div class="checkin-footer" style="display: none;">
                    <div id="grid-pagination-info" class="pagination-info-compact"></div>
                </div>
            </div>
        `, 'checkin-modal');
        
        // LOADING SPINNER: Close loading modal before showing the main modal
        this.closeLoadingModal();
        
        document.body.appendChild(modal);
        
        // Initialize the check-in interface
        await this.initializeCheckInInterface(eventId, matchId, homeTeam, awayTeam, match);
        
        // Force update attendance counts after DOM is fully created
        setTimeout(() => {
            console.log('🔢 Force updating attendance counts after modal creation');
            this.updateAttendanceCounts(match);
        }, 200);
        
        } catch (error) {
            console.error('Error in viewMatch:', error);
            this.closeLoadingModal();
            alert('Failed to load match details. Please try again.');
        }
    }
    
    // Check-in lock system
    isCheckInLocked(event, match) {
        // Use epoch-based lock calculation for reliability
        if (!match.time_epoch) return false;
        
        try {
            // Debug logging to track epoch conversion issues
            const matchEpoch = match.time_epoch;
            const matchDate = new Date(matchEpoch * 1000);
            const currentEpoch = getCurrentEpochTimestamp();
            const currentDate = new Date(currentEpoch * 1000);
            
            console.log('🕐 Lock check debug:', {
                matchId: match.id,
                match_time_epoch: matchEpoch,
                calculated_match_date: matchDate.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'}),
                current_epoch: currentEpoch,
                current_date: currentDate.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'}),
                event_date_epoch: event.date_epoch,
                event_date: new Date(event.date_epoch * 1000).toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})
            });
            
            // Calculate lock time: game start + 1h 40m (game) + 1h (grace) = 2h 40m total
            const lockTimeEpoch = matchEpoch + (2 * 60 + 40) * 60; // 2h 40m in seconds
            const lockDate = new Date(lockTimeEpoch * 1000);
            
            console.log('🔒 Lock calculation:', {
                lock_time_epoch: lockTimeEpoch,
                lock_date: lockDate.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'}),
                is_locked: currentEpoch > lockTimeEpoch
            });
            
            return currentEpoch > lockTimeEpoch;
        } catch (error) {
            console.error('Error calculating epoch lock time:', error);
            return false; // Don't lock on error
        }
    }
    
    getLockTimeInfo(event, match) {
        // Use epoch-based lock calculation for reliability
        if (!match.time_epoch) return null;
        
        try {
            const lockTimeEpoch = match.time_epoch + (2 * 60 + 40) * 60; // 2h 40m in seconds
            
            return {
                lockTime: new Date(lockTimeEpoch * 1000), // For backward compatibility
                lockDate: epochToPacificDate(lockTimeEpoch, { month: 'numeric', day: 'numeric', year: 'numeric' }),
                lockTimeFormatted: epochToPacificTime(lockTimeEpoch, { hour12: true }).toLowerCase(),
                lockTimeEpoch: lockTimeEpoch
            };
        } catch (error) {
            console.error('Error getting epoch lock time info:', error);
            return null;
        }
    }
    
    // New helper functions for mobile check-in interface
    
    async initializeCheckInInterface(eventId, matchId, homeTeam, awayTeam, match) {
        // Store current match data
        this.currentEventId = eventId;
        this.currentMatchId = matchId;
        this.currentHomeTeam = homeTeam;
        this.currentAwayTeam = awayTeam;
        this.currentMatch = match;
        this.currentGridTeam = 'home'; // Default to home team
        
        // Check if check-in is locked
        const event = this.events.find(e => e.id === eventId);
        this.currentCheckInLocked = this.isCheckInLocked(event, match);
        
        console.log('Check-in lock status:', this.currentCheckInLocked);
        
        // Update attendance counts
        this.updateAttendanceCounts(match);
        
        // Initialize with home team displayed by default
        this.renderGridTeamFullscreen('home', homeTeam, match.homeTeamAttendees || []);
        this.updatePaginationInfo();
        await this.updateCardSummary(); // Initialize card summary for home team
    }
    
    updateAttendanceCounts(match) {
        console.log('🔢 updateAttendanceCounts called with:', {
            homeAttendees: match.homeTeamAttendees ? match.homeTeamAttendees.length : 0,
            awayAttendees: match.awayTeamAttendees ? match.awayTeamAttendees.length : 0,
            hasHomeTeam: !!this.currentHomeTeam,
            hasAwayTeam: !!this.currentAwayTeam
        });
        
        const homeAttendees = match.homeTeamAttendees || [];
        const awayAttendees = match.awayTeamAttendees || [];
        
        const homeCountElement = document.getElementById('home-attendance-count');
        const awayCountElement = document.getElementById('away-attendance-count');
        
        console.log('🔢 DOM elements found:', {
            homeCountElement: !!homeCountElement,
            awayCountElement: !!awayCountElement
        });
        
        if (homeCountElement && this.currentHomeTeam) {
            const homeMembers = this.currentHomeTeam.members;
            const homeMaleTotal = homeMembers.filter(m => m.gender === 'male').length;
            const homeFemaleTotal = homeMembers.filter(m => m.gender === 'female').length;
            
            let homeMalePresent = 0, homeFemalePresent = 0;
            homeAttendees.forEach(attendee => {
                // Handle both object format {memberId: "id", name: "name"} and string format "id"
                const attendeeId = typeof attendee === 'object' ? attendee.memberId : attendee;
                const member = homeMembers.find(m => m.id === attendeeId);
                if (member) {
                    if (member.gender === 'male') homeMalePresent++;
                    else if (member.gender === 'female') homeFemalePresent++;
                } else {
                    console.log('❌ Home attendee not found in roster:', attendee);
                }
            });
            
            console.log('🏠 Home team calculations:', {
                totalMembers: homeMembers.length,
                maleTotal: homeMaleTotal,
                femaleTotal: homeFemaleTotal,
                malePresent: homeMalePresent,
                femalePresent: homeFemalePresent,
                attendeesIds: homeAttendees,
                firstFewMemberIds: homeMembers.slice(0, 3).map(m => ({id: m.id, name: m.name}))
            });
            
            const femaleCountEl = homeCountElement.querySelector('.female-count');
            const maleCountEl = homeCountElement.querySelector('.male-count');
            
            console.log('🏠 Home DOM elements:', {
                femaleCountEl: !!femaleCountEl,
                maleCountEl: !!maleCountEl
            });
            
            if (femaleCountEl) {
                if (homeFemaleTotal > 0) {
                    const newText = `${homeFemalePresent}/${homeFemaleTotal} Female`;
                    console.log('🏠 Setting female count to:', newText);
                    femaleCountEl.textContent = newText;
                    femaleCountEl.style.display = 'block';
                } else {
                    femaleCountEl.style.display = 'none';
                }
            }
            if (maleCountEl) {
                if (homeMaleTotal > 0) {
                    const newText = `${homeMalePresent}/${homeMaleTotal} Male`;
                    console.log('🏠 Setting male count to:', newText);
                    maleCountEl.textContent = newText;
                    maleCountEl.style.display = 'block';
                } else {
                    maleCountEl.style.display = 'none';
                }
            }
        }
        
        if (awayCountElement && this.currentAwayTeam) {
            const awayMembers = this.currentAwayTeam.members;
            const awayMaleTotal = awayMembers.filter(m => m.gender === 'male').length;
            const awayFemaleTotal = awayMembers.filter(m => m.gender === 'female').length;
            
            let awayMalePresent = 0, awayFemalePresent = 0;
            awayAttendees.forEach(attendee => {
                // Handle both object format {memberId: "id", name: "name"} and string format "id"
                const attendeeId = typeof attendee === 'object' ? attendee.memberId : attendee;
                const member = awayMembers.find(m => m.id === attendeeId);
                if (member) {
                    if (member.gender === 'male') awayMalePresent++;
                    else if (member.gender === 'female') awayFemalePresent++;
                    console.log('✅ Away attendee found:', member.name, `(${member.gender})`);
                } else {
                    console.log('❌ Away attendee not found in roster:', attendee, 'parsed ID:', attendeeId);
                }
            });
            
            console.log('✈️ Away team calculations:', {
                totalMembers: awayMembers.length,
                maleTotal: awayMaleTotal,
                femaleTotal: awayFemaleTotal,
                malePresent: awayMalePresent,
                femalePresent: awayFemalePresent,
                attendeesIds: awayAttendees,
                firstFewMemberIds: awayMembers.slice(0, 3).map(m => ({id: m.id, name: m.name}))
            });
            
            const femaleCountEl = awayCountElement.querySelector('.female-count');
            const maleCountEl = awayCountElement.querySelector('.male-count');
            
            if (femaleCountEl) {
                if (awayFemaleTotal > 0) {
                    const newText = `${awayFemalePresent}/${awayFemaleTotal} Female`;
                    console.log('✈️ Setting female count to:', newText);
                    femaleCountEl.textContent = newText;
                    femaleCountEl.style.display = 'block';
                } else {
                    femaleCountEl.style.display = 'none';
                }
            }
            if (maleCountEl) {
                if (awayMaleTotal > 0) {
                    const newText = `${awayMalePresent}/${awayMaleTotal} Male`;
                    console.log('✈️ Setting male count to:', newText);
                    maleCountEl.textContent = newText;
                    maleCountEl.style.display = 'block';
                } else {
                    maleCountEl.style.display = 'none';
                }
            }
        }
    }
    
    // Initialize the grid view with data
    initializeGridView(eventId, matchId, homeTeam, awayTeam, match) {
        this.currentEventId = eventId;
        this.currentMatchId = matchId;
        this.currentMatch = match;
        this.currentHomeTeam = homeTeam;
        this.currentAwayTeam = awayTeam;
        this.currentGridTeam = 'home';
        this.currentGridPage = 0;
        
        this.renderGridTeam('home');
        this.renderGridTeam('away');
    }
    
    // Toggle between home and away team in new mobile interface
    async toggleGridTeam(teamType) {
        this.currentGridTeam = teamType;
        
        // Update toggle button states
        const homeToggle = document.getElementById('home-toggle');
        const awayToggle = document.getElementById('away-toggle');
        
        if (teamType === 'home') {
            homeToggle.classList.add('active');
            awayToggle.classList.remove('active');
        } else {
            homeToggle.classList.remove('active');
            awayToggle.classList.add('active');
        }
        
        // Show/hide team sections
        const homeSection = document.getElementById('grid-home-team');
        const awaySection = document.getElementById('grid-away-team');
        
        if (teamType === 'home') {
            homeSection.classList.add('active');
            awaySection.classList.remove('active');
        } else {
            homeSection.classList.remove('active');
            awaySection.classList.add('active');
        }
        
        // Render the selected team
        const team = teamType === 'home' ? this.currentHomeTeam : this.currentAwayTeam;
        const attendees = teamType === 'home' ? 
            (this.currentMatch?.homeTeamAttendees || []) : 
            (this.currentMatch?.awayTeamAttendees || []);
            
        await this.renderGridTeamFullscreen(teamType, team, attendees);
        this.updatePaginationInfo();
        
        // Clear previous team's card summary first to avoid confusion
        this.clearCardSummary();
        
        // Then update with new team's card summary
        await this.updateCardSummary();
    }
    
    // Toggle card summary collapse/expand
    toggleCardSummary() {
        const content = document.getElementById('card-summary-content');
        const icon = document.getElementById('card-summary-icon');
        
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▲';
            icon.classList.add('expanded');
        } else {
            content.style.display = 'none';
            icon.textContent = '▼';
            icon.classList.remove('expanded');
        }
    }
    
    // Clear card summary to avoid showing previous team's data
    clearCardSummary() {
        const summary = document.getElementById('team-card-summary');
        const summaryText = document.getElementById('card-summary-text');
        const summaryContent = document.getElementById('card-summary-content');
        const summaryIcon = document.getElementById('card-summary-icon');
        
        if (summary) {
            summary.style.display = 'none';
        }
        if (summaryText) {
            summaryText.textContent = 'ℹ️ 0 Players with cards';
        }
        if (summaryContent) {
            summaryContent.innerHTML = '';
            summaryContent.style.display = 'none';
        }
        if (summaryIcon) {
            summaryIcon.textContent = '▼';
            summaryIcon.classList.remove('expanded');
        }
    }

    // Update card summary for current team
    async updateCardSummary() {
        if (!this.currentGridTeam || !this.events) return;
        
        const team = this.currentGridTeam === 'home' ? this.currentHomeTeam : this.currentAwayTeam;
        if (!team) return;
        
        const summary = document.getElementById('team-card-summary');
        const summaryText = document.getElementById('card-summary-text');
        const summaryContent = document.getElementById('card-summary-content');
        
        if (!summary || !summaryText || !summaryContent) return;
        
        console.log('🔍 Debugging card summary for team:', team.name);
        console.log('🔍 Total events:', this.events.length);
        
        // OPTIMIZATION: Use efficient DB query instead of client-side processing
        console.log('🔍 Loading card summary from database...');
        
        let playersWithCards = [];
        try {
            const response = await fetch(`/api/team-card-summary?team_id=${team.id}`);
            if (response.ok) {
                const cardSummaryData = await response.json();
                console.log('🔍 Card summary loaded:', cardSummaryData.length, 'players with cards');
                
                playersWithCards = cardSummaryData.map(player => {
                    const parts = [];
                    
                    // Show current season match cards if any
                    if (player.currentSeasonYellow > 0 || player.currentSeasonRed > 0) {
                        const currentCards = [];
                        if (player.currentSeasonYellow > 0) currentCards.push(`🟨${player.currentSeasonYellow}`);
                        if (player.currentSeasonRed > 0) currentCards.push(`🟥${player.currentSeasonRed}`);
                        parts.push(`${currentCards.join(' ')} this season`);
                    }
                    
                    // Show lifetime disciplinary records if any
                    if (player.lifetimeYellow > 0 || player.lifetimeRed > 0) {
                        const lifetimeCards = [];
                        if (player.lifetimeYellow > 0) lifetimeCards.push(`🟨${player.lifetimeYellow}`);
                        if (player.lifetimeRed > 0) lifetimeCards.push(`🟥${player.lifetimeRed}`);
                        parts.push(`${lifetimeCards.join(' ')} lifetime`);
                    }
                    
                    // If no current season but has match cards, show all match cards
                    if (parts.length === 0 && (player.allMatchYellow > 0 || player.allMatchRed > 0)) {
                        const allCards = [];
                        if (player.allMatchYellow > 0) allCards.push(`🟨${player.allMatchYellow}`);
                        if (player.allMatchRed > 0) allCards.push(`🟥${player.allMatchRed}`);
                        parts.push(`${allCards.join(' ')} match cards`);
                    }
                    
                    return {
                        name: player.memberName,
                        text: parts.join(' • ')
                    };
                });
            } else {
                console.log('Could not load card summary, using fallback');
                playersWithCards = [];
            }
        } catch (error) {
            console.log('Error loading card summary:', error);
            playersWithCards = [];
        }
        
        console.log('🔍 Players with cards:', playersWithCards.length, playersWithCards);
        
        if (playersWithCards.length === 0) {
            summary.style.display = 'none';
            return;
        }
        
        // Show summary with proper styling
        summary.style.display = 'block';
        // Force our styling via JavaScript since CSS isn't taking effect
        summary.style.background = 'linear-gradient(135deg, #fff3cd, #ffeaa7)';
        summary.style.border = '1px solid #f39c12';
        summary.style.borderRadius = '12px';
        summary.style.maxWidth = '600px';
        summary.style.margin = '10px 20px 0 20px'; // Add horizontal margins like team boxes
        summary.style.padding = '0';
        summary.style.boxShadow = '0 2px 8px rgba(243, 156, 18, 0.2)';
        
        summaryText.textContent = `ℹ️ ${playersWithCards.length} Player${playersWithCards.length !== 1 ? 's' : ''} with cards`;
        
        // Also style the header
        const summaryHeader = summary.querySelector('.card-summary-header');
        if (summaryHeader) {
            summaryHeader.style.fontSize = '0.85em';
            summaryHeader.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            summaryHeader.style.fontWeight = '600';
            summaryHeader.style.color = '#856404';
            summaryHeader.style.background = 'linear-gradient(135deg, #fff3cd, #ffeaa7)';
        }
        
        // Build detailed content
        const content = playersWithCards.map(player => {
            return `<div class="player-card-summary" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 0.85em; font-weight: 500;">
                <span class="player-name" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 700;">${player.name}:</span> ${player.text}
            </div>`;
        }).join('');
        
        summaryContent.innerHTML = content;
        
        // Apply consistent styling to the content area
        summaryContent.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        summaryContent.style.fontSize = '0.85em';
    }

    // New function to render team grid in fullscreen mode
    async renderGridTeamFullscreen(teamType, team, attendees) {
        const containerId = `grid-container-${teamType}`;
        const container = document.getElementById(containerId);
        
        if (!container || !team) return;
        
        // Get match team IDs for bulk suspension loading
        const event = this.events.find(e => e.id === this.currentEventId);
        const match = event ? event.matches.find(m => m.id === this.currentMatchId) : null;
        const matchTeamIds = match ? [match.homeTeamId, match.awayTeamId] : [team.id];
        
        // Load suspensions for all teams involved in this match (cached)
        if (!this.cachedSuspensions) {
            this.cachedSuspensions = await this.loadTeamSuspensions(matchTeamIds, event ? event.date_epoch : null);
        }
        
        // Add suspension status to members using cached data
        const membersWithSuspensions = team.members.map(member => {
            const suspensionStatus = this.cachedSuspensions[member.id] || { isSuspended: false, suspensionType: null };
            return { ...member, suspensionStatus };
        });
        
        // Render all players in fullscreen grid (no pagination, just scroll)
        container.innerHTML = membersWithSuspensions
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(member => {
                const isCheckedIn = attendees.some(a => a.memberId === member.id);
                const isLocked = this.currentCheckInLocked || false;
                const isSuspended = member.suspensionStatus.isSuspended;
                
                return `
                    <div class="player-grid-item ${isCheckedIn ? 'checked-in' : ''} ${isLocked ? 'locked' : ''} ${isSuspended ? 'suspended' : ''}" 
                         ${!isLocked && !isSuspended ? `onclick="app.toggleGridPlayerAttendance('${this.currentEventId}', '${this.currentMatchId}', '${member.id}', '${teamType}')"` : ''}
                         title="${isSuspended ? `SUSPENDED: ${member.suspensionStatus.reason}` : isLocked ? 'Check-in is locked for this match' : 'Click to toggle attendance'}">
                        ${this.isMemberCaptain(member, team) ? '<div class="grid-captain-icon">👑</div>' : ''}
                        ${isSuspended ? `<div class="grid-suspension-icon ${member.suspensionStatus.suspensionType === 'yellow_accumulation' ? 'yellow-accumulation' : ''}">🚫</div>` : ''}
                        ${member.photo ? 
                            `<img src="${this.getMemberPhotoUrl(member)}" alt="${member.name}" class="player-grid-photo">` :
                            `<div class="player-grid-photo" style="background: #ddd; display: flex; align-items: center; justify-content: center; color: #666; font-size: 20px;">👤</div>`
                        }
                        <div class="player-grid-content">
                            <div class="player-grid-name">${member.name}</div>
                            ${member.jerseyNumber ? `<div class="player-grid-jersey">#${member.jerseyNumber}</div>` : ''}
                        </div>
                        <div class="grid-check-icon">${isSuspended ? '🚫' : isLocked ? '🔒' : '✓'}</div>
                    </div>
                `;
            }).join('');
    }
    
    // Update pagination info for new interface
    updatePaginationInfo() {
        const infoElement = document.getElementById('grid-pagination-info');
        if (!infoElement) return;
        
        const team = this.currentGridTeam === 'home' ? this.currentHomeTeam : this.currentAwayTeam;
        if (!team) return;
        
        const attendees = this.currentGridTeam === 'home' ? 
            (this.currentMatch?.homeTeamAttendees || []) : 
            (this.currentMatch?.awayTeamAttendees || []);
            
        const totalPlayers = team.members.length;
        const checkedIn = attendees.length;
        
        // Footer info removed as requested - player count now shown in team header
        // infoElement.innerHTML = `${checkedIn}/${totalPlayers} players checked in • Tap to toggle`;
    }
    
    // Render grid for specific team with scrolling (no pagination)
    renderGridTeam(teamType) {
        const team = teamType === 'home' ? this.currentHomeTeam : this.currentAwayTeam;
        const attendees = teamType === 'home' ? this.currentMatch.homeTeamAttendees : this.currentMatch.awayTeamAttendees;
        
        const container = document.getElementById(`grid-container-${teamType}`);
        const paginationInfo = document.getElementById(`grid-pagination-info-${teamType}`);
        const paginationContainer = document.getElementById(`grid-pagination-${teamType}`);
        
        if (!team || !team.members) return;
        
        const totalPlayers = team.members.length;
        
        // Update info to show total players
        paginationInfo.innerHTML = `${totalPlayers} player${totalPlayers !== 1 ? 's' : ''} • Scroll to find players`;
        
        // Render all grid items with new structure (no pagination) - sorted alphabetically
        container.innerHTML = team.members
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(member => {
            const isCheckedIn = attendees.some(a => a.memberId === member.id);
            
            return `
                <div class="player-grid-item ${isCheckedIn ? 'checked-in' : ''}" 
                     onclick="app.toggleGridPlayerAttendance('${this.currentEventId}', '${this.currentMatchId}', '${member.id}', '${teamType}')">
                    <div class="grid-check-icon">✓</div>
                    ${this.isMemberCaptain(member, team) ? '<div class="grid-captain-icon">👑</div>' : ''}
                    <img src="${this.getMemberPhotoUrl(member)}" alt="${member.name}" class="player-grid-photo">
                    <div class="player-grid-content">
                        <div class="player-grid-name">${member.name}</div>
                        ${member.jerseyNumber ? `<div class="player-grid-jersey">#${member.jerseyNumber}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Clear pagination controls (not needed for scrolling)
        paginationContainer.innerHTML = '';
    }
    
    // Check if player is currently suspended
    async checkPlayerSuspensionStatus(memberId) {
        try {
            // Check both disciplinary records AND match cards for suspensions
            const response = await fetch(`/api/disciplinary-records?member_id=${memberId}`);
            let disciplinaryRecords = [];
            
            if (response.ok) {
                disciplinaryRecords = await response.json();
            } else {
                console.warn('Could not check disciplinary records:', response.status);
            }
            
            // Find any unserved suspensions from disciplinary records
            const activeDisciplinaryRecords = disciplinaryRecords.filter(record => 
                record.cardType === 'red' && 
                record.suspensionMatches && 
                record.suspensionMatches > 0 && 
                !record.suspensionServed
            );
            
            // Also check for unserved suspensions from match cards
            const activeMatchCards = [];
            this.events.forEach(event => {
                event.matches.forEach(match => {
                    if (match.cards) {
                        match.cards.forEach(card => {
                            if (card.memberId === memberId && 
                                card.cardType === 'red' && 
                                card.suspensionMatches && 
                                card.suspensionMatches > 0 && 
                                !card.suspensionServed) {
                                activeMatchCards.push({
                                    eventName: event.name,
                                    eventDate: new Date(event.date_epoch * 1000).toLocaleDateString('en-US', { 
                            timeZone: 'America/Los_Angeles', 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit' 
                        }),
                                    suspensionMatches: card.suspensionMatches,
                                    reason: card.reason
                                });
                            }
                        });
                    }
                });
            });
            
            const totalActiveSuspensions = [...activeDisciplinaryRecords, ...activeMatchCards];
            
            if (totalActiveSuspensions.length > 0) {
                const totalMatches = totalActiveSuspensions.reduce((sum, record) => {
                    return sum + (record.suspensionMatches || 0);
                }, 0);
                
                return {
                    suspended: true,
                    totalMatches: totalMatches,
                    records: totalActiveSuspensions,
                    sources: {
                        disciplinary: activeDisciplinaryRecords.length,
                        matches: activeMatchCards.length
                    }
                };
            }
            
            return { suspended: false };
        } catch (error) {
            console.error('Error checking suspension status:', error);
            return { suspended: false }; // Allow check-in if there's an error
        }
    }

    // Toggle player attendance in grid view
    async toggleGridPlayerAttendance(eventId, matchId, memberId, teamType) {
        // Check if check-in is locked first
        const event = this.events.find(e => e.id === eventId);
        const match = event?.matches.find(m => m.id === matchId);
        
        if (!event || !match) {
            console.error('Event or match not found');
            alert('Event or match not found. Please refresh and try again.');
            return;
        }
        
        // Lock check - prevent any modifications if locked
        if (this.isCheckInLocked(event, match)) {
            const lockInfo = this.getLockTimeInfo(event, match);
            const lockMessage = lockInfo ? 
                `🔒 Check-in is locked for this match.\n\nLocked since ${lockInfo.lockDate} at ${lockInfo.lockTimeFormatted}.\n\nCheck-in was automatically locked 1 hour after the game ended (game duration: 1h 40m + 1h grace period).` :
                `🔒 Check-in is locked for this match.\n\nModifications are no longer allowed.`;
            
            alert(lockMessage);
            return;
        }
        
        const attendeesArray = teamType === 'home' ? match.homeTeamAttendees : match.awayTeamAttendees;
        const existingIndex = attendeesArray.findIndex(a => a.memberId === memberId);
        
        // Find the grid item for immediate UI update
        const gridItem = document.querySelector(`[onclick*="'${memberId}'"][onclick*="'${teamType}'"]`);
        const checkIcon = gridItem?.querySelector('.grid-check-icon');
        
        // Store original state for potential rollback
        const originalAttendees = [...attendeesArray];
        const wasCheckedIn = existingIndex >= 0;
        
        // UPDATE UI IMMEDIATELY for instant feedback (same as before the suspension feature)
        if (gridItem) {
            if (wasCheckedIn) {
                // Remove check-in
                attendeesArray.splice(existingIndex, 1);
                gridItem.classList.remove('checked-in');
                console.log('Removed attendance for member:', memberId);
            } else {
                // Add check-in
                const team = this.teams.find(t => t.id === (teamType === 'home' ? match.homeTeamId : match.awayTeamId));
                const member = team?.members.find(m => m.id === memberId);
                
                if (!team || !member) {
                    console.error('Team or member not found');
                    alert('Team or member not found. Please refresh and try again.');
                    return;
                }
                
                attendeesArray.push({
                    memberId: memberId,
                    name: member.name,
                    checkedInAt_epoch: Math.floor(Date.now() / 1000)
                });
                gridItem.classList.add('checked-in');
                console.log('Added attendance for member:', memberId);
            }
        }
        
        // Check for suspensions AFTER UI update (for check-ins only) - this runs in background  
        if (!wasCheckedIn) {
            try {
                // Use cached suspension data if available, otherwise fall back to API call
                let suspensionStatus;
                if (this.cachedSuspensions && this.cachedSuspensions[memberId]) {
                    suspensionStatus = this.cachedSuspensions[memberId];
                } else {
                    suspensionStatus = await this.getPlayerSuspensionStatus(memberId, event.date_epoch);
                }
                
                if (suspensionStatus.isSuspended) {
                    // Revert the check-in if player is suspended
                    const currentIndex = attendeesArray.findIndex(a => a.memberId === memberId);
                    if (currentIndex >= 0) {
                        attendeesArray.splice(currentIndex, 1);
                        if (gridItem) {
                            gridItem.classList.remove('checked-in');
                        }
                        
                        // Show suspension warning modal
                        const team = this.teams.find(t => t.id === (teamType === 'home' ? match.homeTeamId : match.awayTeamId));
                        const member = team?.members.find(m => m.id === memberId);
                        
                        await this.showSuspensionWarning(member?.name || 'Player', suspensionStatus);
                        console.log('Reverted check-in due to suspension:', memberId);
                    }
                }
            } catch (error) {
                console.error('Error checking suspension status:', error);
                // Don't revert on error - allow the check-in to stand
            }
        }
        
        // Update current match reference for interface updates
        this.currentMatch = match;
        
        // Update attendance counts in the interface
        this.updateAttendanceCounts(match);
        this.updatePaginationInfo();
        
        // Save to server in background (don't await for UI responsiveness)
        try {
            console.log('Updating attendance via optimized API...');
            
            // Use efficient attendance-only endpoint (no admin auth required)
            const response = await fetch('/api/attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    eventId: eventId,
                    matchId: matchId,
                    memberId: memberId,
                    teamType: teamType,
                    action: 'toggle',
                    bypass_lock: false  // View app should NOT bypass locks
                })
            });
            
            if (!response.ok) {
                // Handle specific error cases
                if (response.status === 423) {
                    // 423 Locked - attendance is locked for this match
                    const errorData = await response.json().catch(() => ({}));
                    
                    // Log debug info from server for lock case
                    if (errorData.debug) {
                        console.log('🔒 Lock debug info:', errorData.debug);
                    }
                    
                    throw new Error(errorData.message || 'Check-in is locked for this match');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Attendance updated successfully:', result);
            
            // Always log debug info from server for troubleshooting
            if (result.debug) {
                console.log('🔒 Server debug info:', result.debug);
                console.log('🕐 Lock status:', result.debug.is_locked ? 'LOCKED ❌' : 'UNLOCKED ✅');
                console.log('⏰ Times:', {
                    gameStart: `${result.debug.match_date} ${result.debug.match_time}`,
                    currentTime: result.debug.current_time_pdt,
                    message: result.debug.debug_message
                });
            } else {
                console.log('⚠️ No debug info received from server');
            }
            
            // Update the events display in the background (no modal refresh)
            await this.renderEvents();
        } catch (error) {
            console.error('Failed to update attendance:', error);
            
            // Revert the data changes on error
            if (teamType === 'home') {
                match.homeTeamAttendees = originalAttendees;
            } else {
                match.awayTeamAttendees = originalAttendees;
            }
            
            // Revert UI changes on error
            if (gridItem) {
                if (wasCheckedIn) {
                    gridItem.classList.add('checked-in');
                } else {
                    gridItem.classList.remove('checked-in');
                }
            }
            
            // Update attendance counts after revert
            this.updateAttendanceCounts(match);
            this.updatePaginationInfo();
            
            alert(`Failed to update attendance: ${error.message}\n\nChanges have been reverted.`);
        }
    }
    
    // Load lifetime disciplinary cards for match check-in (optimized - team-based API calls)
    async loadLifetimeCardsForMatch(homeTeam, awayTeam) {
        const allPlayers = [...homeTeam.members, ...awayTeam.members];
        
        if (allPlayers.length === 0) return;
        
        try {
            console.log(`🚀 Fetching lifetime cards for match: ${homeTeam.name} vs ${awayTeam.name}`);
            
            // Make two team-based API calls in parallel
            const [homeResponse, awayResponse] = await Promise.all([
                fetch(`/api/disciplinary-records?team_id=${homeTeam.id}`),
                fetch(`/api/disciplinary-records?team_id=${awayTeam.id}`)
            ]);
            
            if (homeResponse.ok && awayResponse.ok) {
                const [homeRecords, awayRecords] = await Promise.all([
                    homeResponse.json(),
                    awayResponse.json()
                ]);
                
                const allRecords = [...homeRecords, ...awayRecords];
                console.log(`✅ Received ${allRecords.length} disciplinary records for match teams`);
                
                // Group records by member ID for efficient lookup
                const recordsByMember = {};
                allRecords.forEach(record => {
                    if (!recordsByMember[record.memberId]) {
                        recordsByMember[record.memberId] = [];
                    }
                    recordsByMember[record.memberId].push(record);
                });
                
                // Update DOM for each member
                allPlayers.forEach(member => {
                    const memberRecords = recordsByMember[member.id] || [];
                    
                    // Count lifetime cards
                    let lifetimeYellow = 0;
                    let lifetimeRed = 0;
                    
                    memberRecords.forEach(record => {
                        if (record.cardType === 'yellow') lifetimeYellow++;
                        else if (record.cardType === 'red') lifetimeRed++;
                    });
                    
                    // Update both possible DOM elements for this member (home and away)
                    const homeElement = document.getElementById(`match-lifetime-cards-${member.id}`);
                    const awayElement = document.getElementById(`match-lifetime-cards-away-${member.id}`);
                    
                    let lifetimeText = '';
                    if (lifetimeYellow > 0 || lifetimeRed > 0) {
                        const lifetimeDisplay = [];
                        if (lifetimeYellow > 0) lifetimeDisplay.push(`🟨${lifetimeYellow}`);
                        if (lifetimeRed > 0) lifetimeDisplay.push(`🟥${lifetimeRed}`);
                        lifetimeText = ` | ${lifetimeDisplay.join(' ')} (lifetime)`;
                    }
                    
                    if (homeElement) homeElement.textContent = lifetimeText;
                    if (awayElement) awayElement.textContent = lifetimeText;
                });
                
            } else {
                console.warn(`❌ Team API failed. Home: ${homeResponse.status}, Away: ${awayResponse.status}. Falling back to individual requests.`);
                
                // **Fallback Strategy**: If team API fails, fall back to individual requests
                console.log('🔄 Fallback: Using individual API calls per player');
                await this.loadLifetimeCardsForMatchFallback(allPlayers);
            }
        } catch (error) {
            console.error('❌ Team API request failed:', error);
            
            // **Fallback Strategy**: If team request fails, use individual requests
            console.log('🔄 Fallback: Using individual API calls per player');
            await this.loadLifetimeCardsForMatchFallback(allPlayers);
        }
    }
    
    // Fallback method for match check-in using individual API calls (original approach)
    async loadLifetimeCardsForMatchFallback(allPlayers) {
        for (const member of allPlayers) {
            try {
                const response = await fetch(`/api/disciplinary-records?member_id=${member.id}`);
                if (response.ok) {
                    const records = await response.json();
                    
                    // Count lifetime cards
                    let lifetimeYellow = 0;
                    let lifetimeRed = 0;
                    
                    records.forEach(record => {
                        if (record.cardType === 'yellow') lifetimeYellow++;
                        else if (record.cardType === 'red') lifetimeRed++;
                    });
                    
                    // Update both possible DOM elements for this member (home and away)
                    const homeElement = document.getElementById(`match-lifetime-cards-${member.id}`);
                    const awayElement = document.getElementById(`match-lifetime-cards-away-${member.id}`);
                    
                    let lifetimeText = '';
                    if (lifetimeYellow > 0 || lifetimeRed > 0) {
                        const lifetimeDisplay = [];
                        if (lifetimeYellow > 0) lifetimeDisplay.push(`🟨${lifetimeYellow}`);
                        if (lifetimeRed > 0) lifetimeDisplay.push(`🟥${lifetimeRed}`);
                        lifetimeText = ` | ${lifetimeDisplay.join(' ')} (lifetime)`;
                    }
                    
                    if (homeElement) homeElement.textContent = lifetimeText;
                    if (awayElement) awayElement.textContent = lifetimeText;
                    
                } else {
                    // Hide loading text if API fails
                    const homeElement = document.getElementById(`match-lifetime-cards-${member.id}`);
                    const awayElement = document.getElementById(`match-lifetime-cards-away-${member.id}`);
                    if (homeElement) homeElement.textContent = '';
                    if (awayElement) awayElement.textContent = '';
                }
            } catch (error) {
                console.error('Error loading lifetime cards for member:', member.id, error);
                // Hide loading text on error
                const homeElement = document.getElementById(`match-lifetime-cards-${member.id}`);
                const awayElement = document.getElementById(`match-lifetime-cards-away-${member.id}`);
                if (homeElement) homeElement.textContent = '';
                if (awayElement) awayElement.textContent = '';
            }
        }
    }
    
    async editMatchResult(eventId, matchId) {
        // Check if we're on mobile and use mobile interface
        if (window.innerWidth <= 768) {
            return this.editMatchResultMobile(eventId, matchId);
        }
        
        // Desktop version (existing code)
        return this.editMatchResultDesktop(eventId, matchId);
    }
    
    // Mobile-optimized match result interface
    async editMatchResultMobile(eventId, matchId) {
        // Ensure full team data is loaded for player dropdowns
        if (this.teams.length === 0) {
            await this.loadTeams(); // Need full team data for card player selection
        }
        
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        const mainReferee = match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null;
        const assistantReferee = match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null;
        
        if (!match) return;
        
        // Store current match for card functions
        this.currentMatch = match;
        this.currentMatchCards = [...(match.cards || [])];
        
        // Create mobile modal
        const modal = document.createElement('div');
        modal.className = 'mobile-match-result-modal active';
        modal.innerHTML = `
            <div class="mobile-match-result-content">
                <div class="mobile-match-header">
                    <h3 class="mobile-match-title">Match Result</h3>
                    <button class="mobile-close-btn" onclick="app.closeMobileMatchResult()">×</button>
                </div>
                
                <div class="mobile-match-body">
                    <!-- Match Info Banner -->
                    <div class="mobile-match-info-banner">
                        <div class="mobile-match-info-grid">
                            <div class="mobile-info-badge date">
                                📅 ${epochToPacificDate(event.date_epoch)}
                            </div>
                            <div class="mobile-info-badge time">
                                ⏰ ${match.time_epoch ? epochToPacificTime(match.time_epoch) : 'TBD'}
                            </div>
                            <div class="mobile-info-badge field">
                                🏟️ ${match.field ? `Field ${match.field}` : 'TBD'}
                            </div>
                            <div class="mobile-info-badge referee">
                                👨‍⚽️ ${mainReferee ? mainReferee.name : 'TBD'}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Score Entry -->
                    <div class="mobile-score-section">
                        <div class="mobile-score-header">Final Score</div>
                        <div class="mobile-score-container">
                            <div class="mobile-team-score">
                                <div class="mobile-team-score-label">${homeTeam.name}</div>
                                <div class="mobile-score-input-container">
                                    <button class="mobile-score-btn" onclick="app.adjustMobileScore('home', -1)">−</button>
                                    <div class="mobile-score-display" id="mobile-home-score">${match.homeScore !== null ? match.homeScore : 0}</div>
                                    <button class="mobile-score-btn" onclick="app.adjustMobileScore('home', 1)">+</button>
                                </div>
                            </div>
                            <div class="mobile-vs-divider">VS</div>
                            <div class="mobile-team-score">
                                <div class="mobile-team-score-label">${awayTeam.name}</div>
                                <div class="mobile-score-input-container">
                                    <button class="mobile-score-btn" onclick="app.adjustMobileScore('away', -1)">−</button>
                                    <div class="mobile-score-display" id="mobile-away-score">${match.awayScore !== null ? match.awayScore : 0}</div>
                                    <button class="mobile-score-btn" onclick="app.adjustMobileScore('away', 1)">+</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Cards & Disciplinary -->
                    <div class="mobile-cards-section">
                        <div class="mobile-section-header">
                            🟨 Cards & Disciplinary Actions
                        </div>
                        <div id="mobile-cards-container">
                            ${this.renderMobileCards()}
                        </div>
                        <div class="mobile-add-card-buttons">
                            <button class="mobile-add-card-btn" onclick="app.showAddCardModal()">
                                ➕ Add Card
                            </button>
                        </div>
                    </div>
                    
                    <!-- Notes -->
                    <div class="mobile-notes-section">
                        <div class="mobile-section-header">
                            📝 Match Notes
                        </div>
                        <textarea class="mobile-notes-textarea" id="mobile-match-notes" placeholder="Add any notes about the match...">${match.matchNotes || ''}</textarea>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div class="mobile-action-buttons">
                    <button class="mobile-action-btn cancel" onclick="app.closeMobileMatchResult()">
                        Cancel
                    </button>
                    <button class="mobile-action-btn save" id="mobile-save-btn">
                        Save Result
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listener for save button
        const saveBtn = document.getElementById('mobile-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                console.log('Save button clicked via event listener');
                this.saveMobileMatchResult(eventId, matchId);
            });
        }
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }
    
    // Mobile match result helper functions
    renderMobileCards() {
        if (!this.currentMatchCards || this.currentMatchCards.length === 0) {
            return '<div class="mobile-no-cards">No cards issued for this match</div>';
        }
        
        return this.currentMatchCards.map((card, index) => {
            const homeTeam = this.teams.find(t => t.id === this.currentMatch.homeTeamId);
            const awayTeam = this.teams.find(t => t.id === this.currentMatch.awayTeamId);
            
            // Find player in both team rosters and checked-in players
            let player = null;
            let playerTeam = null;
            
            // First try to find in home team
            if (homeTeam?.members) {
                player = homeTeam.members.find(p => p.id === card.memberId);
                if (player) {
                    playerTeam = homeTeam;
                }
            }
            
            // If not found in home team, try away team
            if (!player && awayTeam?.members) {
                player = awayTeam.members.find(p => p.id === card.memberId);
                if (player) {
                    playerTeam = awayTeam;
                }
            }
            
            return `
                <div class="mobile-card-item ${card.cardType}">
                    <div class="mobile-card-info">
                        <div class="mobile-card-player">
                            ${card.cardType === 'yellow' ? '🟨' : '🟥'} ${player?.name || 'Unknown Player'} (${playerTeam?.name || 'Unknown Team'})
                        </div>
                        <div class="mobile-card-details">
                            Minute: ${card.minute || 'N/A'} • ${card.reason || 'No reason specified'}
                            ${card.notes ? `<br><em>Notes: ${card.notes}</em>` : ''}
                        </div>
                    </div>
                    <button class="mobile-card-remove" onclick="app.removeMobileCard(${index})">×</button>
                </div>
            `;
        }).join('');
    }
    
    adjustMobileScore(team, delta) {
        const scoreElement = document.getElementById(`mobile-${team}-score`);
        let currentScore = parseInt(scoreElement.textContent) || 0;
        const newScore = Math.max(0, Math.min(99, currentScore + delta));
        scoreElement.textContent = newScore;
    }
    
    showAddCardModal() {
        const homeTeam = this.teams.find(t => t.id === this.currentMatch.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === this.currentMatch.awayTeamId);
        
        // Only show checked-in players using the View app's data structure
        const checkedInPlayers = {
            home: [],
            away: []
        };
        
        console.log('Current match:', this.currentMatch);
        console.log('Home team members:', homeTeam?.members);
        console.log('Away team members:', awayTeam?.members);
        console.log('Match homeTeamAttendees:', this.currentMatch.homeTeamAttendees);
        console.log('Match awayTeamAttendees:', this.currentMatch.awayTeamAttendees);
        
        // Use the View app's attendance data structure
        if (this.currentMatch.homeTeamAttendees && Array.isArray(this.currentMatch.homeTeamAttendees)) {
            this.currentMatch.homeTeamAttendees.forEach(attendee => {
                // Handle both object format {memberId: X} and direct ID format
                const playerId = typeof attendee === 'object' ? attendee.memberId : attendee;
                const player = homeTeam?.members?.find(p => p.id === playerId);
                if (player) {
                    console.log('Adding home player:', player.name);
                    checkedInPlayers.home.push(player);
                }
            });
        }
        
        if (this.currentMatch.awayTeamAttendees && Array.isArray(this.currentMatch.awayTeamAttendees)) {
            this.currentMatch.awayTeamAttendees.forEach(attendee => {
                // Handle both object format {memberId: X} and direct ID format
                const playerId = typeof attendee === 'object' ? attendee.memberId : attendee;
                const player = awayTeam?.members?.find(p => p.id === playerId);
                if (player) {
                    console.log('Adding away player:', player.name);
                    checkedInPlayers.away.push(player);
                }
            });
        }
        
        console.log('Final checked-in players:', checkedInPlayers);
        
        const modal = document.createElement('div');
        modal.className = 'card-creation-modal';
        modal.innerHTML = `
            <div class="card-creation-content">
                <div class="card-creation-header">
                    <h3 class="card-creation-title">Add Card</h3>
                </div>
                
                <div class="card-form-group">
                    <label class="card-form-label">Card Type</label>
                    <div class="card-type-selector">
                        <div class="card-type-option yellow" data-type="yellow">
                            🟨 Yellow Card
                        </div>
                        <div class="card-type-option red" data-type="red">
                            🟥 Red Card
                        </div>
                    </div>
                </div>
                
                <div class="card-form-group">
                    <label class="card-form-label">Player</label>
                    <select class="card-form-select" id="card-player-select">
                        <option value="">Select Player</option>
                        ${checkedInPlayers.home.length > 0 ? `
                            <optgroup label="${homeTeam.name}">
                                ${checkedInPlayers.home.map(player => `
                                    <option value="${player.id}">${player.name} (#${player.jerseyNumber || 'N/A'})</option>
                                `).join('')}
                            </optgroup>
                        ` : ''}
                        ${checkedInPlayers.away.length > 0 ? `
                            <optgroup label="${awayTeam.name}">
                                ${checkedInPlayers.away.map(player => `
                                    <option value="${player.id}">${player.name} (#${player.jerseyNumber || 'N/A'})</option>
                                `).join('')}
                            </optgroup>
                        ` : ''}
                        ${checkedInPlayers.home.length === 0 && checkedInPlayers.away.length === 0 ? 
                            '<option value="" disabled>No checked-in players available</option>' : ''
                        }
                    </select>
                </div>
                
                <div class="card-form-group">
                    <label class="card-form-label">Minute</label>
                    <input type="number" class="card-form-select" id="card-minute" min="1" max="200" step="1" placeholder="Match minute (1-200)">
                </div>
                
                <div class="card-form-group">
                    <label class="card-form-label">Reason</label>
                    <select class="card-form-select" id="card-reason-select">
                        <option value="">Select Reason</option>
                        ${window.CheckInAppConfig.cardReasons.map(reason => 
                            `<option value="${reason}">${reason}</option>`
                        ).join('')}
                    </select>
                </div>
                
                <div class="card-form-group">
                    <label class="card-form-label">Notes (Optional)</label>
                    <textarea class="card-form-textarea" id="card-notes" placeholder="Additional details about the incident..."></textarea>
                </div>
                
                <div class="card-creation-actions">
                    <button class="card-action-btn cancel" onclick="app.closeAddCardModal()">Cancel</button>
                    <button class="card-action-btn save" onclick="app.saveNewCard()">Add Card</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners for card type selection
        modal.querySelectorAll('.card-type-option').forEach(option => {
            option.addEventListener('click', (e) => {
                modal.querySelectorAll('.card-type-option').forEach(opt => opt.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });
        
        // Auto-select yellow card by default
        modal.querySelector('.card-type-option.yellow').click();
    }
    
    closeAddCardModal() {
        const modal = document.querySelector('.card-creation-modal');
        if (modal) {
            modal.remove();
        }
    }
    
    saveNewCard() {
        const modal = document.querySelector('.card-creation-modal');
        const selectedType = modal.querySelector('.card-type-option.selected');
        const playerId = modal.querySelector('#card-player-select').value;
        const minute = modal.querySelector('#card-minute').value;
        const reason = modal.querySelector('#card-reason-select').value;
        const notes = modal.querySelector('#card-notes').value.trim();
        
        // Validation
        if (!selectedType) {
            alert('Please select a card type');
            return;
        }
        
        if (!playerId) {
            alert('Please select a player');
            return;
        }
        
        if (!reason) {
            alert('Please select a reason');
            return;
        }
        
        // Validate minute if provided
        if (minute && minute.trim() !== '') {
            const minuteNum = parseInt(minute);
            if (isNaN(minuteNum)) {
                alert('Minute must be a valid number');
                return;
            }
            if (minuteNum < 1 || minuteNum > 200) {
                alert('Minute must be between 1 and 200');
                return;
            }
        }
        
        // Determine which team the player belongs to
        const homeTeam = this.teams.find(t => t.id === this.currentMatch.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === this.currentMatch.awayTeamId);
        
        let teamType = null;
        if (homeTeam?.members?.find(p => p.id === playerId)) {
            teamType = 'home';
        } else if (awayTeam?.members?.find(p => p.id === playerId)) {
            teamType = 'away';
        }
        
        if (!teamType) {
            alert('Error: Could not determine which team the player belongs to');
            return;
        }
        
        // Create new card
        const newCard = {
            cardType: selectedType.dataset.type,
            memberId: playerId, // Keep as string (UUID format)
            teamType: teamType, // Add required teamType field
            minute: minute ? parseInt(minute) : null,
            reason: reason,
            notes: notes || null
        };
        
        this.currentMatchCards.push(newCard);
        
        // Re-render cards
        const container = document.getElementById('mobile-cards-container');
        container.innerHTML = this.renderMobileCards();
        
        // Close modal
        this.closeAddCardModal();
    }
    
    removeMobileCard(index) {
        this.currentMatchCards.splice(index, 1);
        
        // Re-render cards
        const container = document.getElementById('mobile-cards-container');
        container.innerHTML = this.renderMobileCards();
    }
    
    closeMobileMatchResult() {
        const modal = document.querySelector('.mobile-match-result-modal');
        if (modal) {
            modal.remove();
        }
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Clear current match data
        this.currentMatch = null;
        this.currentMatchCards = null;
    }
    
    async saveMobileMatchResult(eventId, matchId) {
        console.log('🔄 saveMobileMatchResult called with:', { eventId, matchId });
        
        try {
            const homeScore = parseInt(document.getElementById('mobile-home-score').textContent) || 0;
            const awayScore = parseInt(document.getElementById('mobile-away-score').textContent) || 0;
            const notesElement = document.getElementById('mobile-match-notes');
            const notes = notesElement ? notesElement.value.trim() : '';
            
            console.log('📊 Collected data:', { homeScore, awayScore, notes, notesLength: notes.length, cards: this.currentMatchCards });
            console.log('📝 Notes element found:', !!notesElement, 'Notes value:', `"${notes}"`);
            
            // Validate that eventId and matchId are present (keep as UUIDs, don't convert to int)
            if (!eventId || !matchId) {
                alert(`Missing IDs: eventId=${eventId}, matchId=${matchId}`);
                return;
            }
            
            const matchResult = {
                eventId: eventId, // Keep as UUID string
                matchId: matchId, // Keep as UUID string
                homeScore: homeScore,
                awayScore: awayScore,
                matchStatus: 'completed',
                matchNotes: notes,
                cards: this.currentMatchCards.map(card => ({
                    memberId: card.memberId,
                    teamType: card.teamType, // Include required teamType field
                    cardType: card.cardType,
                    minute: card.minute,
                    reason: card.reason,
                    notes: card.notes,
                    eventId: eventId, // Keep as UUID string
                    matchId: matchId  // Keep as UUID string
                }))
            };
            
            console.log('Saving mobile match result:', matchResult);
            console.log('📝 Match notes in request:', matchResult.matchNotes, 'Length:', matchResult.matchNotes?.length);
            
            const response = await fetch('/api/match-results', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-View-Only': 'true'  // Indicate this is from View app
                },
                body: JSON.stringify(matchResult)
            });
            
            console.log('📥 Response received:', response.status, response.statusText);
            
            if (response.ok) {
                console.log('✅ Match result saved successfully');
                this.closeMobileMatchResult();
                
                // Refresh events to show updated results
                await this.loadEvents();
                await this.renderEvents();
                
                // Show success message
                alert('Match result saved successfully!');
            } else {
                const errorText = await response.text();
                console.error('❌ Failed to save match result:', response.status, errorText);
                
                // Show detailed error for debugging
                alert(`Failed to save match result.\nStatus: ${response.status}\nError: ${errorText}\n\nThis might be because the View app doesn't have permission to save results.`);
            }
        } catch (error) {
            console.error('❌ Error saving match result:', error);
            alert('Error saving match result. Please try again.');
        }
    }

    // Desktop version (renamed from original)  
    async editMatchResultDesktop(eventId, matchId) {
        // Ensure full team data is loaded for player dropdowns
        if (this.teams.length === 0) {
            await this.loadTeams(); // Need full team data for card player selection
        }
        
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        const mainReferee = match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null;
        const assistantReferee = match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null;
        
        if (!match) return;
        
        // Store current match for addCard function
        this.currentMatch = match;
        
        const modal = this.createModal(`Match Result: ${homeTeam.name} vs ${awayTeam.name}`, `
            <div class="match-result-mobile">
                <!-- Match Status Section -->
                <div class="form-section">
                    <label class="form-label">Match Status</label>
                    <select class="form-select-mobile" id="match-status">
                        <option value="scheduled" ${match.matchStatus === 'scheduled' ? 'selected' : ''}>📅 Scheduled</option>
                        <option value="in_progress" ${match.matchStatus === 'in_progress' ? 'selected' : ''}>⏱️ In Progress</option>
                        <option value="completed" ${match.matchStatus === 'completed' ? 'selected' : ''}>✅ Completed</option>
                        <option value="cancelled" ${match.matchStatus === 'cancelled' ? 'selected' : ''}>❌ Cancelled</option>
                    </select>
                </div>

                <!-- Score Section -->
                <div class="form-section">
                    <label class="form-label">Final Score</label>
                    <div class="score-input-container">
                        <div class="team-score-input">
                            <div class="team-name-label">${homeTeam.name}</div>
                            <div class="score-input-wrapper">
                                <input type="number" class="score-input" id="home-score" value="${match.homeScore !== null ? match.homeScore : ''}" min="0" max="99" placeholder="0" readonly>
                                <div class="score-stepper">
                                    <button type="button" class="score-stepper-btn" onclick="app.adjustScore('home-score', 1)">+</button>
                                    <button type="button" class="score-stepper-btn" onclick="app.adjustScore('home-score', -1)">−</button>
                                </div>
                            </div>
                        </div>
                        <div class="vs-divider">VS</div>
                        <div class="team-score-input">
                            <div class="team-name-label">${awayTeam.name}</div>
                            <div class="score-input-wrapper">
                                <input type="number" class="score-input" id="away-score" value="${match.awayScore !== null ? match.awayScore : ''}" min="0" max="99" placeholder="0" readonly>
                                <div class="score-stepper">
                                    <button type="button" class="score-stepper-btn" onclick="app.adjustScore('away-score', 1)">+</button>
                                    <button type="button" class="score-stepper-btn" onclick="app.adjustScore('away-score', -1)">−</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                ${mainReferee ? `
                <!-- Officials Section -->
                <div class="form-section">
                    <label class="form-label">Match Officials</label>
                    <div class="officials-info">
                        <div class="official-name">Referee: ${mainReferee.name}</div>
                        ${assistantReferee ? `<div class="assistant-name">Assistant: ${assistantReferee.name}</div>` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Notes Section -->
                <div class="form-section">
                    <label class="form-label">Match Notes</label>
                    <textarea class="form-input-mobile" id="match-notes" rows="3" placeholder="Enter any notes about this match (optional)">${match.matchNotes || ''}</textarea>
                </div>

                <!-- Cards Section -->
                <div class="form-section">
                    <label class="form-label">Cards & Disciplinary Actions</label>
                    <div id="cards-container" class="cards-mobile-container">
                        ${match.cards && match.cards.length > 0 ? match.cards.map((card, index) => {
                            return `
                                <div class="card-item-mobile">
                                    <div class="card-header-mobile ${card.cardType}">
                                        <div class="card-type-display ${card.cardType}">
                                            ${card.cardType === 'yellow' ? '🟨 YELLOW CARD' : '🟥 RED CARD'}
                                        </div>
                                        <button class="btn-remove-card" onclick="app.removeCard(${index})">×</button>
                                    </div>
                                    <div class="card-details-mobile">
                                        <div class="form-row-mobile">
                                            <label class="mobile-label">Player</label>
                                            <select class="form-select-mobile" data-card-index="${index}" data-field="memberId">
                                                <option value="">Select Player</option>
                                                ${homeTeam.members
                                                    .filter(m => match.attendance && match.attendance.some(a => a.memberId === m.id && a.present))
                                                    .slice()
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(m => `<option value="${m.id}" ${card.memberId === m.id ? 'selected' : ''}>${m.name} (${homeTeam.name})</option>`).join('')}
                                                ${awayTeam.members
                                                    .filter(m => match.attendance && match.attendance.some(a => a.memberId === m.id && a.present))
                                                    .slice()
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(m => `<option value="${m.id}" ${card.memberId === m.id ? 'selected' : ''}>${m.name} (${awayTeam.name})</option>`).join('')}
                                            </select>
                                        </div>
                                        <div class="form-row-mobile-dual">
                                            <div class="form-col-mobile">
                                                <label class="mobile-label">Card Type</label>
                                                <select class="form-select-mobile" data-card-index="${index}" data-field="cardType">
                                                    <option value="yellow" ${card.cardType === 'yellow' ? 'selected' : ''}>🟨 Yellow</option>
                                                    <option value="red" ${card.cardType === 'red' ? 'selected' : ''}>🟥 Red</option>
                                                </select>
                                            </div>
                                            <div class="form-col-mobile">
                                                <label class="mobile-label">Minute</label>
                                                <input type="number" class="form-input-mobile" placeholder="Min" data-card-index="${index}" data-field="minute" value="${card.minute || ''}" min="1" max="120">
                                            </div>
                                        </div>
                                        <div class="form-row-mobile">
                                            <label class="mobile-label">Reason</label>
                                            <select class="form-select-mobile" data-card-index="${index}" data-field="reason">
                                                <option value="">Select Reason</option>
                                                ${this.generateCardReasonsOptions(card.reason)}
                                            </select>
                                        </div>
                                        <div class="form-row-mobile">
                                            <label class="mobile-label">Additional Notes</label>
                                            <input type="text" class="form-input-mobile" placeholder="Optional notes" data-card-index="${index}" data-field="notes" value="${card.notes || ''}">
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('') : '<div class="no-cards-message">No cards issued for this match</div>'}
                    </div>
                    <button class="btn-add-card" onclick="app.addCard()">+ Add Card</button>
                </div>

                <!-- Action Buttons -->
                <div class="action-buttons-mobile">
                    <button class="btn-mobile btn-cancel" onclick="app.closeModal()">Cancel</button>
                    <button class="btn-mobile btn-save" onclick="app.saveMatchResult('${eventId}', '${matchId}')">Save Result</button>
                </div>
            </div>
        `);
        
        document.body.appendChild(modal);
        
        // Add event listeners for score stepper buttons after modal is added to DOM
        // Find all score stepper buttons and replace onclick with proper event listeners
        const allStepperButtons = modal.querySelectorAll('.score-stepper-btn[onclick]');
        
        console.log('🔍 Debug: Found stepper buttons:', allStepperButtons.length);
        
        allStepperButtons.forEach((button, index) => {
            const onclickAttr = button.getAttribute('onclick');
            console.log(`🔍 Debug: Button ${index}:`, {
                element: button,
                onclick: onclickAttr,
                textContent: button.textContent,
                className: button.className
            });
            
            // Parse the onclick attribute to determine which function to call
            if (onclickAttr && onclickAttr.includes('adjustScore')) {
                // Extract the parameters from onclick="app.adjustScore('home-score', 1)"
                const match = onclickAttr.match(/adjustScore\('([^']+)',\s*(-?\d+)\)/);
                if (match) {
                    const scoreId = match[1]; // 'home-score' or 'away-score'
                    const increment = parseInt(match[2]); // 1 or -1
                    
                    console.log(`✅ Debug: Setting up event listener for button ${index}:`, {
                        scoreId,
                        increment,
                        buttonText: button.textContent
                    });
                    
                    // Remove the onclick attribute and add proper event listener
                    button.removeAttribute('onclick');
                    button.addEventListener('click', (e) => {
                        console.log(`🎯 Debug: Button clicked:`, {
                            scoreId,
                            increment,
                            buttonText: button.textContent,
                            event: e
                        });
                        this.adjustScore(scoreId, increment);
                    });
                } else {
                    console.log(`❌ Debug: Could not parse onclick for button ${index}:`, onclickAttr);
                }
            } else {
                console.log(`❌ Debug: Button ${index} does not have adjustScore onclick:`, onclickAttr);
            }
        });
        
        // Also log all buttons in the modal for debugging
        const allButtons = modal.querySelectorAll('button');
        console.log('🔍 Debug: All buttons in modal:', allButtons.length);
        allButtons.forEach((btn, i) => {
            console.log(`Button ${i}:`, {
                className: btn.className,
                textContent: btn.textContent,
                onclick: btn.getAttribute('onclick')
            });
        });
    }
    
    addCard() {
        const container = document.getElementById('cards-container');
        const existingCards = container.querySelectorAll('.card-item-mobile');
        const newIndex = existingCards.length;
        
        // Remove "no cards" message if it exists
        const noCardsMsg = container.querySelector('.no-cards-message');
        if (noCardsMsg) noCardsMsg.remove();
        
        const homeTeam = this.teams.find(t => t.id === this.currentMatch?.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === this.currentMatch?.awayTeamId);
        
        const cardHtml = `
            <div class="card-item-mobile">
                <div class="card-header-mobile yellow">
                    <div class="card-type-display yellow">🟨 YELLOW CARD</div>
                    <button class="btn-remove-card" onclick="app.removeCard(${newIndex})">×</button>
                </div>
                <div class="card-details-mobile">
                    <div class="form-row-mobile">
                        <label class="mobile-label">Player</label>
                        <select class="form-select-mobile" data-card-index="${newIndex}" data-field="memberId">
                            <option value="">Select Player</option>
                            ${homeTeam?.members
                                .filter(m => this.currentMatch?.homeTeamAttendees && this.currentMatch.homeTeamAttendees.some(a => a.memberId === m.id))
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(m => `<option value="${m.id}">${m.name} (${homeTeam.name})</option>`).join('') || ''}
                            ${awayTeam?.members
                                .filter(m => this.currentMatch?.awayTeamAttendees && this.currentMatch.awayTeamAttendees.some(a => a.memberId === m.id))
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(m => `<option value="${m.id}">${m.name} (${awayTeam.name})</option>`).join('') || ''}
                        </select>
                    </div>
                    <div class="form-row-mobile-dual">
                        <div class="form-col-mobile">
                            <label class="mobile-label">Card Type</label>
                            <select class="form-select-mobile" data-card-index="${newIndex}" data-field="cardType" onchange="app.updateCardHeader(${newIndex})">
                                <option value="yellow">🟨 Yellow</option>
                                <option value="red">🟥 Red</option>
                            </select>
                        </div>
                        <div class="form-col-mobile">
                            <label class="mobile-label">Minute</label>
                            <input type="number" class="form-input-mobile" placeholder="Min" data-card-index="${newIndex}" data-field="minute" min="1" max="120">
                        </div>
                    </div>
                    <div class="form-row-mobile">
                        <label class="mobile-label">Reason</label>
                        <select class="form-select-mobile" data-card-index="${newIndex}" data-field="reason">
                            <option value="">Select Reason</option>
                            ${this.generateCardReasonsOptions()}
                        </select>
                    </div>
                    <div class="form-row-mobile">
                        <label class="mobile-label">Additional Notes</label>
                        <input type="text" class="form-input-mobile" placeholder="Optional notes" data-card-index="${newIndex}" data-field="notes">
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', cardHtml);
    }
    
    // Helper function to update card header when card type changes
    updateCardHeader(index) {
        const cardItem = document.querySelectorAll('.card-item-mobile')[index];
        if (!cardItem) return;
        
        const cardTypeSelect = cardItem.querySelector('[data-field="cardType"]');
        const cardHeader = cardItem.querySelector('.card-header-mobile');
        const cardDisplay = cardItem.querySelector('.card-type-display');
        
        if (cardTypeSelect && cardHeader && cardDisplay) {
            const cardType = cardTypeSelect.value;
            
            // Update header classes
            cardHeader.className = `card-header-mobile ${cardType}`;
            cardDisplay.className = `card-type-display ${cardType}`;
            cardDisplay.textContent = cardType === 'yellow' ? '🟨 YELLOW CARD' : '🟥 RED CARD';
        }
    }
    
    removeCard(index) {
        const cardItems = document.querySelectorAll('.card-item-mobile');
        if (cardItems[index]) {
            cardItems[index].remove();
            
            // Re-index remaining cards
            const remainingCards = document.querySelectorAll('.card-item-mobile');
            remainingCards.forEach((card, newIndex) => {
                card.querySelectorAll('[data-card-index]').forEach(element => {
                    element.setAttribute('data-card-index', newIndex);
                });
                
                // Update onChange handler for card type select
                const cardTypeSelect = card.querySelector('[data-field="cardType"]');
                if (cardTypeSelect) {
                    cardTypeSelect.setAttribute('onchange', `app.updateCardHeader(${newIndex})`);
                }
                
                const deleteBtn = card.querySelector('.btn-remove-card');
                if (deleteBtn) {
                    deleteBtn.setAttribute('onclick', `app.removeCard(${newIndex})`);
                }
            });
            
            // Add "no cards" message if no cards remain
            if (remainingCards.length === 0) {
                document.getElementById('cards-container').innerHTML = '<div class="no-cards-message">No cards issued for this match</div>';
            }
        }
    }
    
    async saveMatchResult(eventId, matchId) {
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!match) return;
        
        // Get form values
        let matchStatus = document.getElementById('match-status').value;
        const homeScore = document.getElementById('home-score').value;
        const awayScore = document.getElementById('away-score').value;
        const matchNotes = document.getElementById('match-notes').value.trim();
        
        // Smart status suggestion: if entering scores but status is still "Scheduled", suggest "Completed"
        const hasScores = homeScore !== '' || awayScore !== '';
        if (hasScores && matchStatus === 'scheduled') {
            const shouldComplete = await this.showConfirmDialog(
                'Status Change Suggestion',
                'You\'re entering match results but the status is still "Scheduled".\n\nWould you like to change the status to "Completed"?',
                'Yes',
                'No'
            );
            if (shouldComplete) {
                matchStatus = 'completed';
                // Update the form field to reflect the change
                document.getElementById('match-status').value = 'completed';
            }
        }
        
        // Collect cards data
        const cardItems = document.querySelectorAll('.card-item-mobile');
        const cards = [];
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        
        cardItems.forEach((cardItem, index) => {
            const memberId = cardItem.querySelector('[data-field="memberId"]').value;
            const cardType = cardItem.querySelector('[data-field="cardType"]').value;
            const minute = cardItem.querySelector('[data-field="minute"]').value;
            const reason = cardItem.querySelector('[data-field="reason"]').value;
            const notes = cardItem.querySelector('[data-field="notes"]').value;
            
            if (memberId && cardType) {
                // Determine team type
                const isHomePlayer = homeTeam.members.some(m => m.id === memberId);
                const teamType = isHomePlayer ? 'home' : 'away';
                
                cards.push({
                    memberId: memberId,
                    teamType: teamType,
                    cardType: cardType,
                    minute: minute ? parseInt(minute) : null,
                    reason: reason || null,
                    notes: notes || null
                });
            }
        });
        
        try {
            // Use new granular endpoint for match results
            const response = await fetch('/api/match-results', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    eventId: eventId,
                    matchId: matchId,
                    homeScore: homeScore,
                    awayScore: awayScore,
                    matchStatus: matchStatus,
                    matchNotes: matchNotes,
                    cards: cards
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to save match result: ${response.status} ${response.statusText}`);
            }
            
            // Update local data
            match.matchStatus = matchStatus;
            match.homeScore = homeScore !== '' ? parseInt(homeScore) : null;
            match.awayScore = awayScore !== '' ? parseInt(awayScore) : null;
            match.matchNotes = matchNotes;
            match.cards = cards;
            
            await this.renderEvents();
            this.closeModal();
        } catch (error) {
            console.error('Error saving match result:', error);
            alert('Failed to save match result: ' + error.message);
        }
    }
    
    toggleTeamView(viewType) {
        const homeSection = document.getElementById('home-team-section');
        const awaySection = document.getElementById('away-team-section');
        
        if (!homeSection || !awaySection) return;
        
        switch (viewType) {
            case 'home':
                homeSection.style.display = 'block';
                awaySection.style.display = 'none';
                break;
            case 'away':
                homeSection.style.display = 'none';
                awaySection.style.display = 'block';
                break;
            case 'both':
            default:
                homeSection.style.display = 'block';
                awaySection.style.display = 'block';
                break;
        }
    }
    
    // Save Events (for attendance updates)
    async saveEvents() {
        try {
            const response = await fetch(`/api/events?_t=${Date.now()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.events)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save events');
            }
            
            // Clear suspension cache after saving events to ensure fresh data on next load
            this.cachedSuspensions = null;
            console.log('🧹 Cache cleared after events save (including suspensions)');
            
            return await response.json();
        } catch (error) {
            console.error('Error saving events:', error);
            throw error;
        }
    }
    
    // Toggle Match Attendance (same as main app but optimized for view mode)
    async toggleMatchAttendance(eventId, matchId, memberId, teamType) {
        console.log('toggleMatchAttendance called:', { eventId, matchId, memberId, teamType });
        
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!event || !match) {
            console.error('Event or match not found:', { event: !!event, match: !!match });
            alert('Event or match not found. Please refresh and try again.');
            return;
        }
        
        const attendeesArray = teamType === 'home' ? match.homeTeamAttendees : match.awayTeamAttendees;
        const existingIndex = attendeesArray.findIndex(a => a.memberId === memberId);
        
        // Store original state for potential rollback
        const originalAttendees = [...attendeesArray];
        
        // Update the UI immediately for smooth UX
        const attendeeRow = document.querySelector(`[onclick*="'${memberId}'"][onclick*="'${teamType}'"]`);
        const checkbox = attendeeRow?.querySelector('.attendance-checkbox');
        
        if (existingIndex >= 0) {
            // Remove attendance
            attendeesArray.splice(existingIndex, 1);
            console.log('Removed attendance for member:', memberId);
            
            // Update UI immediately
            if (attendeeRow && checkbox) {
                attendeeRow.classList.remove('checked-in');
                checkbox.classList.remove('checked');
                checkbox.textContent = '○';
            }
        } else {
            // Add attendance
            const team = this.teams.find(t => t.id === (teamType === 'home' ? match.homeTeamId : match.awayTeamId));
            const member = team.members.find(m => m.id === memberId);
            
            if (!team || !member) {
                console.error('Team or member not found:', { team: !!team, member: !!member });
                alert('Team or member not found. Please refresh and try again.');
                return;
            }
            
            attendeesArray.push({
                memberId: memberId,
                name: member.name,
                checkedInAt: new Date().toISOString()
            });
            console.log('Added attendance for member:', memberId);
            
            // Update UI immediately
            if (attendeeRow && checkbox) {
                attendeeRow.classList.add('checked-in');
                checkbox.classList.add('checked');
                checkbox.textContent = '✓';
            }
        }
        
        try {
            console.log('Updating attendance via optimized API...');
            
            // Use efficient attendance-only endpoint (no admin auth required)
            const response = await fetch('/api/attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    eventId: eventId,
                    matchId: matchId,
                    memberId: memberId,
                    teamType: teamType,
                    action: 'toggle'
                })
            });
            
            if (!response.ok) {
                // Handle specific error cases
                if (response.status === 423) {
                    // 423 Locked - attendance is locked for this match
                    const errorData = await response.json().catch(() => ({}));
                    
                    // Log debug info from server for lock case
                    if (errorData.debug) {
                        console.log('🔒 Lock debug info:', errorData.debug);
                    }
                    
                    throw new Error(errorData.message || 'Check-in is locked for this match');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Attendance updated successfully:', result);
        } catch (error) {
            console.error('Failed to save events:', error);
            
            // Revert the data changes on error
            if (teamType === 'home') {
                match.homeTeamAttendees = originalAttendees;
            } else {
                match.awayTeamAttendees = originalAttendees;
            }
            
            // Revert UI changes on error
            if (attendeeRow && checkbox) {
                const wasCheckedIn = originalAttendees.some(a => a.memberId === memberId);
                if (wasCheckedIn) {
                    attendeeRow.classList.add('checked-in');
                    checkbox.classList.add('checked');
                    checkbox.textContent = '✓';
                } else {
                    attendeeRow.classList.remove('checked-in');
                    checkbox.classList.remove('checked');
                    checkbox.textContent = '○';
                }
            }
            
            alert(`Failed to update attendance: ${error.message}\n\nChanges have been reverted.`);
        }
    }
    
    // Modal Management
    createModal(title, content, modalType = 'default') {
        const modal = document.createElement('div');
        modal.className = modalType === 'checkin-modal' ? 'modal checkin-modal' : 'modal';
        
        if (modalType === 'checkin-modal') {
            // Full-screen mobile check-in modal with sticky header
            modal.innerHTML = `
                <div class="modal-content-fullscreen">
                    <div class="modal-header-sticky">
                        <h2 class="modal-title-compact">${title}</h2>
                        <button class="close-btn-prominent" onclick="app.closeModal()">✕</button>
                    </div>
                    <div class="modal-body-scrollable">
                        ${content}
                    </div>
                </div>
            `;
        } else {
            // Standard modal
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">${title}</h2>
                        <button class="close-btn" onclick="app.closeModal()">&times;</button>
                    </div>
                    ${content}
                </div>
            `;
        }
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
        
        return modal;
    }
    
    // Show confirmation dialog with Yes/No buttons
    showConfirmDialog(title, message, yesText = 'Yes', noText = 'No') {
        return new Promise((resolve) => {
            const modal = this.createModal(title, `
                <div class="modal-body">
                    <p style="font-size: 16px; line-height: 1.5; white-space: pre-line;">${message}</p>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                        <button class="btn btn-secondary" onclick="app.resolveConfirmDialog(false)">${noText}</button>
                        <button class="btn btn-primary" onclick="app.resolveConfirmDialog(true)">${yesText}</button>
                    </div>
                </div>
            `);
            
            // Store the resolve function for the button handlers
            this.confirmDialogResolve = resolve;
            
            document.body.appendChild(modal);
        });
    }
    
    // Resolve the confirmation dialog
    resolveConfirmDialog(result) {
        if (this.confirmDialogResolve) {
            this.confirmDialogResolve(result);
            this.confirmDialogResolve = null;
        }
        this.closeModal();
    }
    
    // LOADING SPINNER: Show loading modal
    showLoadingModal(message = 'Loading...') {
        // Remove any existing loading modal first
        this.closeLoadingModal();
        
        const loadingModal = document.createElement('div');
        loadingModal.id = 'loading-modal';
        loadingModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
            backdrop-filter: blur(2px);
        `;
        
        loadingModal.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                min-width: 200px;
            ">
                <div style="
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #2196F3;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 15px auto;
                "></div>
                <div style="
                    color: #333;
                    font-size: 16px;
                    font-weight: 500;
                ">${message}</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        document.body.appendChild(loadingModal);
    }
    
    // LOADING SPINNER: Close loading modal
    closeLoadingModal() {
        const loadingModal = document.getElementById('loading-modal');
        if (loadingModal) {
            loadingModal.remove();
        }
    }
    
    // 🔄 GENERALIZED LOADING SYSTEM: Execute any action with loading feedback (View App)
    async executeWithLoading(action, options = {}) {
        const {
            message = 'Loading...',
            button = null,
            showModal = true,
            errorHandler = null
        } = options;
        
        // Store original button state
        let originalButtonText = '';
        let originalButtonDisabled = false;
        
        try {
            // Show loading feedback
            if (showModal) {
                this.showLoadingModal(message);
            }
            
            // Disable and update button if provided
            if (button) {
                originalButtonText = button.innerHTML;
                originalButtonDisabled = button.disabled;
                button.disabled = true;
                button.innerHTML = `
                    <span style="display: inline-flex; align-items: center; gap: 8px;">
                        <div style="
                            width: 16px;
                            height: 16px;
                            border: 2px solid transparent;
                            border-top: 2px solid currentColor;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                        "></div>
                        Loading...
                    </span>
                `;
            }
            
            // Execute the action
            const result = await action();
            
            return result;
            
        } catch (error) {
            console.error('Action failed:', error);
            
            // Use custom error handler if provided, otherwise show generic alert
            if (errorHandler) {
                errorHandler(error);
            } else {
                alert('Action failed. Please try again.');
            }
            
            throw error;
            
        } finally {
            // Always clean up loading state
            if (showModal) {
                this.closeLoadingModal();
            }
            
            // Restore button state
            if (button) {
                button.disabled = originalButtonDisabled;
                button.innerHTML = originalButtonText;
            }
        }
    }
    
    // 🎯 Quick wrapper for modal actions (most common in view app)
    async handleModalAction(action, message = 'Loading...') {
        return this.executeWithLoading(action, {
            message: message,
            showModal: true
        });
    }
    
    // 🎯 Quick wrapper for button actions
    async handleButtonAction(button, action, message = 'Loading...') {
        return this.executeWithLoading(action, {
            button: button,
            message: message,
            showModal: false // Don't show modal for button actions, just button feedback
        });
    }
    
    // Generic onclick handler that extracts button reference
    handleActionClick(event, action, ...args) {
        event.preventDefault();
        const button = event.target.closest('button');
        return action(...args, button);
    }
    
    // 🔄 LOADING-WRAPPED USER ACTIONS: View app specific actions with loading feedback
    
    // Wrapper for view match with loading (already has loading but now standardized)
    async viewMatchWithLoading(eventId, matchId, button = null) {
        return this.handleModalAction(
            () => this.viewMatch(eventId, matchId),
            'Loading match details and player rosters...'
        );
    }
    
    closeModal() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.remove();
        });
        
        this.currentModalType = null;
    }

    // Suspension Status Checking Methods
    async loadTeamSuspensions(teamIds, eventDate = null) {
        try {
            // Get all active suspensions for members of these teams
            const response = await fetch(`/api/suspensions?status=active`);
            
            if (!response.ok) {
                console.warn('Failed to load suspension data:', response.status);
                return {};
            }
            
            const allSuspensions = await response.json();
            
            // Group suspensions by member ID for quick lookup
            const suspensionsByMember = {};
            allSuspensions.forEach(suspension => {
                if (!suspensionsByMember[suspension.memberId]) {
                    suspensionsByMember[suspension.memberId] = [];
                }
                suspensionsByMember[suspension.memberId].push(suspension);
            });
            
            // Convert to the format expected by the UI using AUTOMATIC CALCULATION
            const memberSuspensionStatus = {};
            Object.keys(suspensionsByMember).forEach(memberId => {
                const memberSuspensions = suspensionsByMember[memberId];
                
                // Calculate actual remaining events based on event dates (AUTOMATIC LOGIC)
                let totalEventsRemaining = 0;
                const processedSuspensions = [];
                
                for (const suspension of memberSuspensions) {
                    // Try to find the actual event date when the red card occurred using cardSourceId (match ID)
                    let actualSuspensionStartEpoch = suspension.suspensionStartEpoch; // Default to DB value
                    
                    if (suspension.cardSourceId && suspension.cardSourceId !== 'accumulation') {
                        // Find the match that corresponds to this suspension
                        for (const event of this.events) {
                            const match = event.matches?.find(m => m.id === suspension.cardSourceId);
                            if (match) {
                                // Use the event date when the red card actually occurred
                                actualSuspensionStartEpoch = event.date_epoch;
                                break;
                            }
                        }
                    }
                    
                    // Get all events since suspension start date, ordered chronologically
                    // Only count events that occurred BEFORE the event we're trying to check into
                    const cutoffDate = eventDate || (Date.now() / 1000); // Use event date if provided, otherwise current time
                    const eventsSinceSuspension = this.events
                        .filter(event => event.date_epoch > actualSuspensionStartEpoch && event.date_epoch < cutoffDate)
                        .sort((a, b) => a.date_epoch - b.date_epoch);
                    
                    // Calculate how many events have passed since suspension
                    const eventsPassedCount = eventsSinceSuspension.length;
                    
                    // Calculate remaining events for this suspension
                    const remainingForThisSuspension = Math.max(0, suspension.suspensionEvents - eventsPassedCount);
                    
                    totalEventsRemaining += remainingForThisSuspension;
                    
                    processedSuspensions.push({
                        ...suspension,
                        calculatedRemaining: remainingForThisSuspension,
                        eventsPassed: eventsPassedCount,
                        actualStartDate: actualSuspensionStartEpoch // Store the corrected start date
                    });
                    
                    // Debug logging with corrected dates
                    console.log(`🔍 Check-in Suspension Debug for player (loadTeamSuspensions):`, {
                        memberId: Object.keys(suspensionsByMember).find(id => suspensionsByMember[id].includes(suspension)),
                        dbSuspensionStartDate: new Date(suspension.suspensionStartEpoch * 1000).toISOString().split('T')[0],
                        actualSuspensionStartDate: new Date(actualSuspensionStartEpoch * 1000).toISOString().split('T')[0],
                        cardSourceId: suspension.cardSourceId,
                        suspensionEvents: suspension.suspensionEvents,
                        eventsPassedCount,
                        eventsSinceSuspension: eventsSinceSuspension.map(e => new Date(e.date_epoch * 1000).toISOString().split('T')[0]),
                        calculatedRemaining: remainingForThisSuspension
                    });
                }
                
                // Only add to cache if there are remaining events (truly suspended)
                if (totalEventsRemaining > 0) {
                    memberSuspensionStatus[memberId] = {
                        isSuspended: true,
                        suspensionType: memberSuspensions.length > 1 ? 'multiple' : memberSuspensions[0].cardType,
                        totalMatches: totalEventsRemaining,
                        suspensions: processedSuspensions,
                        reason: `${memberSuspensions.length} suspension${memberSuspensions.length > 1 ? 's' : ''} (${totalEventsRemaining} events remaining)`,
                        remainingEvents: totalEventsRemaining
                    };
                }
            });
            
            console.log(`📋 Loaded suspensions for ${Object.keys(memberSuspensionStatus).length} suspended players (automatic calculation)`);
            return memberSuspensionStatus;
            
        } catch (error) {
            console.error('Error loading team suspensions:', error);
            return {};
        }
    }

    async getPlayerSuspensionStatus(playerId, eventDate = null) {
        try {
            // If we have cached suspension data, use it
            if (this.cachedSuspensions && this.cachedSuspensions[playerId]) {
                return this.cachedSuspensions[playerId];
            }
            
            // Fallback to individual API call if no cached data
            const suspensionsResponse = await fetch(`/api/suspensions?memberId=${playerId}&status=active`);
            
            if (!suspensionsResponse.ok) {
                console.warn('Failed to load suspension data');
                return { isSuspended: false };
            }
            
            const activeSuspensions = await suspensionsResponse.json();
            
            // Check if player has any active suspensions
            if (activeSuspensions.length === 0) {
                return { 
                    isSuspended: false, 
                    suspensionType: null,
                    totalMatches: 0 
                };
            }
            
            // Calculate actual remaining events based on event dates (AUTOMATIC LOGIC)
            let totalEventsRemaining = 0;
            const processedSuspensions = [];
            
            for (const suspension of activeSuspensions) {
                // Try to find the actual event date when the red card occurred using cardSourceId (match ID)
                let actualSuspensionStartEpoch = suspension.suspensionStartEpoch; // Default to DB value
                
                if (suspension.cardSourceId && suspension.cardSourceId !== 'accumulation') {
                    // Find the match that corresponds to this suspension
                    for (const event of this.events) {
                        const match = event.matches?.find(m => m.id === suspension.cardSourceId);
                        if (match) {
                            // Use the event date when the red card actually occurred
                            actualSuspensionStartEpoch = event.date_epoch;
                            break;
                        }
                    }
                }
                
                // Get all events since suspension start date, ordered chronologically
                // Only count events that occurred BEFORE the event we're trying to check into
                const cutoffDate = eventDate || (Date.now() / 1000); // Use event date if provided, otherwise current time
                const eventsSinceSuspension = this.events
                    .filter(event => event.date_epoch > actualSuspensionStartEpoch && event.date_epoch < cutoffDate)
                    .sort((a, b) => a.date_epoch - b.date_epoch);
                
                // Calculate how many events have passed since suspension
                const eventsPassedCount = eventsSinceSuspension.length;
                
                // Debug logging for suspension calculation
                console.log(`🔍 Check-in Suspension Debug for player ${playerId} (getPlayerSuspensionStatus):`, {
                    dbSuspensionStartDate: new Date(suspension.suspensionStartEpoch * 1000).toISOString().split('T')[0],
                    actualSuspensionStartDate: new Date(actualSuspensionStartEpoch * 1000).toISOString().split('T')[0],
                    eventDate: eventDate ? new Date(eventDate * 1000).toISOString().split('T')[0] : 'current time',
                    cardSourceId: suspension.cardSourceId,
                    suspensionEvents: suspension.suspensionEvents,
                    eventsPassedCount,
                    eventsSinceSuspension: eventsSinceSuspension.map(e => new Date(e.date_epoch * 1000).toISOString().split('T')[0]),
                    calculatedRemaining: Math.max(0, suspension.suspensionEvents - eventsPassedCount)
                });
                
                // Calculate remaining events for this suspension
                const remainingForThisSuspension = Math.max(0, suspension.suspensionEvents - eventsPassedCount);
                
                totalEventsRemaining += remainingForThisSuspension;
                
                processedSuspensions.push({
                    ...suspension,
                    calculatedRemaining: remainingForThisSuspension,
                    eventsPassed: eventsPassedCount
                });
                
                console.log(`📊 Suspension calculation for ${playerId}:`, {
                    originalEvents: suspension.suspensionEvents,
                    eventsPassed: eventsPassedCount,
                    remaining: remainingForThisSuspension,
                    suspensionStartDate: new Date(suspension.suspensionStartEpoch * 1000).toLocaleDateString()
                });
            }
            
            return {
                isSuspended: totalEventsRemaining > 0,
                suspensionType: activeSuspensions.length > 1 ? 'multiple' : activeSuspensions[0].cardType,
                totalMatches: totalEventsRemaining,
                suspensions: processedSuspensions,
                reason: `${activeSuspensions.length} suspension${activeSuspensions.length > 1 ? 's' : ''} (${totalEventsRemaining} events remaining)`,
                remainingEvents: totalEventsRemaining
            };
            
        } catch (error) {
            console.error('Error checking suspension status:', error);
            return { isSuspended: false };
        }
    }

    async showSuspensionWarning(playerName, suspensionInfo) {
        const warningMessage = suspensionInfo.suspensionType === 'yellow-accumulation' 
            ? `${playerName} is suspended due to yellow card accumulation (${suspensionInfo.reason}).\n\nThis player cannot be checked in until the suspension is resolved by the advisory board.`
            : `${playerName} is suspended due to a red card.\n\nRemaining events: ${suspensionInfo.remainingEvents || 0}\n\nThis player cannot be checked in during their suspension period.`;
        
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content suspension-warning-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">🚫 Player Suspended</h2>
                        <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="suspension-warning-content">
                        <div class="warning-icon">⚠️</div>
                        <div class="warning-message">${warningMessage.replace(/\n/g, '<br>')}</div>
                    </div>
                    <div class="suspension-warning-actions">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                            OK, I Understand
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Auto-remove after 10 seconds for better UX
            setTimeout(() => {
                if (document.body.contains(modal)) {
                    modal.remove();
                }
                resolve(false);
            }, 10000);
            
            // Also remove on click outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            });
        });
    }
}

// Global functions for onclick handlers
async function showSection(sectionName) {
    await app.showSection(sectionName);
}

async function editMatchResult(eventId, matchId) {
    await app.editMatchResult(eventId, matchId);
}

// Initialize app
const app = new CheckInViewApp();