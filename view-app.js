/**
 * CheckIn App v4.7.5 - View Only Mode
 * Read-only version for public viewing
 */

// Version constant - update this single location to change version everywhere
const APP_VERSION = '4.9.1';

class CheckInViewApp {
    constructor() {
        this.teams = []; // Full team data (loaded on demand)
        this.teamsBasic = []; // Lightweight team data (loaded by default)
        this.hasCompleteTeamsData = false; // Track if we have full teams data vs partial
        this.events = [];
        this.referees = [];
        this.currentModalType = null;
        
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
        // Load events and basic team info (lightweight) for initial display
        await Promise.all([
            this.loadEvents(),
            this.loadTeamsBasic() // Much faster - no player photos or details
        ]);
        this.renderEvents();
        
        // Ensure Events section is shown by default
        this.showSection('events');
    }
    
    // Season Management
    getCurrentSeason() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // JavaScript months are 0-indexed
        const day = now.getDate();
        
        // Spring season: Feb 15th to June 30th
        if ((month === 2 && day >= 15) || (month >= 3 && month <= 6)) {
            return {
                type: 'Spring',
                year: year,
                startDate: new Date(year, 1, 15), // Feb 15
                endDate: new Date(year, 5, 30)    // June 30
            };
        }
        // Fall season: Aug 1st to Dec 31st
        else if (month >= 8 && month <= 12) {
            return {
                type: 'Fall',
                year: year,
                startDate: new Date(year, 7, 1),  // Aug 1
                endDate: new Date(year, 11, 31)  // Dec 31
            };
        }
        // Between seasons - determine which season we're closer to
        else {
            if (month === 1 || (month === 2 && day < 15)) {
                // January or early February - closer to upcoming Spring season
                return {
                    type: 'Spring',
                    year: year,
                    startDate: new Date(year, 1, 15), // Feb 15
                    endDate: new Date(year, 5, 30)    // June 30
                };
            } else {
                // July - closer to upcoming Fall season
                return {
                    type: 'Fall',
                    year: year,
                    startDate: new Date(year, 7, 1),  // Aug 1
                    endDate: new Date(year, 11, 31)  // Dec 31
                };
            }
        }
    }
    
    isCurrentSeasonEvent(eventDate) {
        const currentSeason = this.getCurrentSeason();
        const event = new Date(eventDate);
        return event >= currentSeason.startDate && event <= currentSeason.endDate;
    }
    
    // Lightweight team loading (just basic info for events display)
    async loadTeamsBasic() {
        try {
            const data = await this.fetch(`/api/teams-basic?_t=${Date.now()}`);
            this.teamsBasic = data;
            console.log('🚀 Loaded basic teams data:', this.teamsBasic.length, 'teams');
        } catch (error) {
            console.warn('Teams-basic API not available, falling back to full teams API:', error);
            // Fallback to full API but extract only needed data
            await this.loadTeams();
            this.teamsBasic = this.teams.map(team => ({
                id: team.id,
                name: team.name,
                category: team.category,
                colorData: team.colorData,
                memberCount: team.members ? team.members.length : 0
            }));
        }
    }

    // Full team loading (with all player data) - only when needed
    async loadTeams() {
        try {
            const data = await this.fetch(`/api/teams?_t=${Date.now()}`);
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
            const response = await fetch(`/api/events?_t=${Date.now()}`);
            if (response.ok) {
                this.events = await response.json();
            } else {
                console.error('Failed to load events');
                this.events = [];
            }
        } catch (error) {
            console.error('Error loading events:', error);
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
        
        // Lazy load data for the section if not already loaded
        if (sectionName === 'teams') {
            // TEAMS BUG FIX: Only reload if we don't have complete teams data
            // (loadSpecificTeams might have loaded only partial data)
            if (!this.hasCompleteTeamsData) {
                // Show loading spinner for teams section
                this.showLoadingModal('Loading all teams with player photos... Please be patient, this can take several seconds.');
                try {
                    await this.loadTeams(); // Load complete team data for roster display
                    this.closeLoadingModal();
                } catch (error) {
                    this.closeLoadingModal();
                    console.error('Error loading teams:', error);
                }
            }
            this.renderTeams();
        } else if (sectionName === 'events') {
            // Events already loaded with basic team info in init()
            this.renderEvents();
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
            // Show loading spinner for cards section
            this.showLoadingModal('Loading all cards for all teams... This can take up to 30 seconds as we analyze every match and player.');
            
            try {
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
                this.closeLoadingModal();
            } catch (error) {
                this.closeLoadingModal();
                console.error('Error loading cards section:', error);
                // Show error in cards container
                const container = document.getElementById('cards-tracker-container');
                if (container) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #dc3545;">
                            <h3>Error Loading Cards</h3>
                            <p>Failed to load card data. Please refresh the page and try again.</p>
                            <p style="font-size: 0.9em; color: #666;">Error: ${error.message}</p>
                        </div>
                    `;
                }
            }
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
            
            // Check if it's an API URL with filename parameter
            if (member.photo.includes('/api/photos?filename=')) {
                const match = member.photo.match(/filename=([^&]+)/);
                if (match) {
                    const filename = match[1];
                    // Check if the filename has a valid image extension
                    if (filename.includes('.jpg') || filename.includes('.jpeg') || 
                        filename.includes('.png') || filename.includes('.webp')) {
                        // Return the full API URL without additional cache-busting to avoid corrupting the URL
                        return member.photo;
                    }
                }
            }
            
            // Check if it's a direct filename with valid extension
            if ((member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                member.photo.includes('.png') || member.photo.includes('.webp')) &&
                !member.photo.startsWith('/api/photos') && !member.photo.startsWith('http')) {
                // Convert filename to API URL without cache-busting to avoid corrupting URLs
                return `/api/photos?filename=${encodeURIComponent(member.photo)}`;
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
            return 'photos/defaults/male.svg';
        } else if (member.gender === 'female') {
            return 'photos/defaults/female.svg';
        } else {
            // No gender specified, use male as default
            return 'photos/defaults/male.svg';
        }
    }
    
    // Player Profile Management  
    async viewPlayerProfile(teamId, memberId) {
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
                        eventDate: event.date,
                        matchInfo,
                        cardType: card.cardType,
                        reason: card.reason,
                        notes: card.notes,
                        minute: card.minute
                    });
                });
            }
        }
        
        // Fetch disciplinary records in parallel with UI building
        const disciplinaryPromise = this.fetchDisciplinaryRecords(memberId);
        
        // Wait for disciplinary records and display
        const disciplinaryRecords = await disciplinaryPromise;
        this.displayPlayerProfile(team, member, matchCards, disciplinaryRecords);
    }
    
    // Optimized helper method for fetching disciplinary records
    async fetchDisciplinaryRecords(memberId) {
        try {
            const response = await fetch(`/api/disciplinary-records?member_id=${memberId}`);
            if (response.ok) {
                const records = await response.json();
                return records.map(record => ({
                    type: 'prior',
                    eventDate: record.incidentDate || record.createdAt,
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
                    ${member.id === team.captainId ? ' • 👑 Captain' : ''}
                </p>
            </div>`;
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
                    <small style="color: #666; font-size: 0.75em;">${new Date(card.eventDate).toLocaleDateString()}</small>
                </div>
                ${card.type === 'match' ? `
                    <div style="font-size: 0.8em; color: #666; margin-bottom: 3px;">
                        <strong>Match:</strong> ${card.matchInfo}
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
                                ? `(✅ Served${card.suspensionServedDate ? ` on ${new Date(card.suspensionServedDate).toLocaleDateString()}` : ''})` 
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
        
        // Pre-render card items for better performance
        const cardItemsHtml = totalCards > 0 ? allCards.map(card => this.renderCardItem(card)).join('') : '';
        
        const modal = this.createModal(`Player Profile: ${member.name}`, `
            ${this.buildPlayerProfileBase(team, member)}
            
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 12px 0; color: #333; display: flex; align-items: center; gap: 8px; font-size: 1em;">
                    📋 Complete Disciplinary Record 
                    <span style="background: ${totalCards > 0 ? '#dc3545' : '#28a745'}; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.75em; font-weight: normal;">
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
                const captain = selectedTeam.captainId ? selectedTeam.members.find(m => m.id === selectedTeam.captainId) : null;
                
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
                        if (this.isCurrentSeasonEvent(event.date)) {
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
                                    ${captain ? `<div class="team-captain">👑 Captain: ${captain.name}</div>` : ''}
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
                                        if (this.isCurrentSeasonEvent(event.date)) {
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
                                                    <div class="member-name">${member.name}${member.id === selectedTeam.captainId ? ' 👑' : ''}</div>
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
    
    renderEvents() {
        console.log('🔍 renderEvents called - teams loaded:', this.teams.length, 'events loaded:', this.events.length);
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let eventsToShow = this.events.filter(event => {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);
            
            if (showPastEvents) {
                return eventDate < today; // Show only past events
            } else {
                return eventDate >= today; // Show only future events
            }
        });
        
        // Sort chronologically (future events ascending, past events descending)
        eventsToShow.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return showPastEvents ? dateB - dateA : dateA - dateB;
        });
        
        if (eventsToShow.length === 0) {
            const message = showPastEvents ? 'No past events' : 'No upcoming events';
            const subtext = showPastEvents ? 'Past events will appear here' : 'Upcoming events will appear here';
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${message}</h3>
                    <p>${subtext}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = eventsToShow.map(event => `
            <div class="event-card">
                <div class="event-header">
                    <div>
                        <div class="event-name">${event.name}</div>
                        <div class="event-date">${new Date(event.date).toLocaleDateString()}</div>
                    </div>
                </div>
                <div class="event-description">${event.description || ''}</div>
                <div class="matches-container">
                    ${event.matches
                        .sort((a, b) => {
                            // Sort by time first
                            if (a.time && b.time) {
                                if (a.time !== b.time) {
                                    return a.time.localeCompare(b.time);
                                }
                            } else if (a.time && !b.time) {
                                return -1;
                            } else if (!a.time && b.time) {
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
                                ${match.time ? `<div class="match-time">Time: ${match.time.substring(0, 5)}</div>` : ''}
                                ${mainReferee ? `<div class="match-referee">Referee: ${mainReferee.name}${assistantReferee ? `, ${assistantReferee.name}` : ''}</div>` : ''}
                                ${cardsDisplay ? `<div class="match-cards">Cards: ${cardsDisplay}</div>` : ''}
                                <div class="match-actions">
                                    <button class="btn btn-small" onclick="app.viewMatch('${event.id}', '${match.id}')" title="View Match">👁️</button>
                                    <button class="btn btn-small btn-secondary" onclick="(async () => await app.editMatchResult('${event.id}', '${match.id}'))()" title="Edit Result">🏆</button>
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
            if (currentSeasonOnly && !this.isCurrentSeasonEvent(event.date)) {
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
        
        // Sort by date (most recent first), then by team name
        filteredCards.sort((a, b) => {
            const dateA = new Date(a.eventDate);
            const dateB = new Date(b.eventDate);
            if (dateB - dateA !== 0) return dateB - dateA;
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
                                <div style="font-size: 0.8em; color: #888;">${new Date(card.eventDate).toLocaleDateString()}</div>
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
                            <div class="card-date">${new Date(card.eventDate).toLocaleDateString()}</div>
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
        console.log('🔍 collectCurrentSeasonCards called');
        console.log('📊 Available events:', this.events.length);
        console.log('👥 Available teams:', this.teams.length);
        console.log('👨‍⚖️ Available referees:', this.referees.length);
        
        const cardRecords = [];
        
        // Create lookup maps for efficiency
        const teamLookup = new Map();
        const refereeLookup = new Map();
        
        this.teams.forEach(team => teamLookup.set(team.id, team));
        this.referees.forEach(referee => refereeLookup.set(referee.id, referee));
        
        // Process all events and matches
        this.events.forEach((event, eventIndex) => {
            console.log(`📅 Processing event ${eventIndex + 1}/${this.events.length}: ${event.name} (${event.date})`);
            
            // Only include current season events
            if (!this.isCurrentSeasonEvent(event.date)) {
                console.log(`⏭️ Skipping event ${event.name} - not current season`);
                return;
            }
            
            console.log(`✅ Event ${event.name} is current season, processing ${event.matches?.length || 0} matches`);
            
            if (!event.matches || event.matches.length === 0) {
                console.log(`⚠️ Event ${event.name} has no matches`);
                return;
            }
            
            event.matches.forEach((match, matchIndex) => {
                console.log(`🏆 Processing match ${matchIndex + 1}/${event.matches.length}: ${match.homeTeamId} vs ${match.awayTeamId}`);
                
                if (!match.cards || match.cards.length === 0) {
                    console.log(`⚠️ Match has no cards`);
                    return;
                }
                
                console.log(`🟨🟥 Match has ${match.cards.length} cards`);
                
                const homeTeam = teamLookup.get(match.homeTeamId);
                const awayTeam = teamLookup.get(match.awayTeamId);
                const mainReferee = refereeLookup.get(match.mainRefereeId);
                
                console.log(`🏠 Home team: ${homeTeam?.name || 'Unknown'}`);
                console.log(`✈️ Away team: ${awayTeam?.name || 'Unknown'}`);
                console.log(`👨‍⚖️ Referee: ${mainReferee?.name || 'Not recorded'}`);
                
                // Process each card in the match
                match.cards.forEach((card, cardIndex) => {
                    console.log(`📇 Processing card ${cardIndex + 1}/${match.cards.length}:`, card);
                    
                    // Determine which team the player belongs to
                    let playerTeam = null;
                    let playerName = 'Unknown Player';
                    
                    // Check home team first
                    if (homeTeam) {
                        const homePlayer = homeTeam.members.find(m => m.id === card.memberId);
                        if (homePlayer) {
                            playerTeam = homeTeam;
                            playerName = homePlayer.name;
                        }
                    }
                    
                    // Check away team if not found in home team
                    if (!playerTeam && awayTeam) {
                        const awayPlayer = awayTeam.members.find(m => m.id === card.memberId);
                        if (awayPlayer) {
                            playerTeam = awayTeam;
                            playerName = awayPlayer.name;
                        }
                    }
                    
                    const cardRecord = {
                        eventDate: event.date,
                        eventName: event.name,
                        matchInfo: `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`,
                        teamName: playerTeam?.name || 'Unknown Team',
                        playerName: playerName,
                        cardType: card.cardType,
                        reason: card.reason,
                        notes: card.notes,
                        minute: card.minute,
                        refereeName: mainReferee?.name
                    };
                    
                    console.log(`✅ Card record created:`, cardRecord);
                    cardRecords.push(cardRecord);
                });
            });
        });
        
        console.log(`🎯 Final result: ${cardRecords.length} card records collected`);
        return cardRecords;
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
            const date = new Date(card.eventDate).toLocaleDateString();
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
            if (this.isCurrentSeasonEvent(event.date)) {
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
        
        // Cards display
        const cardsSection = match.cards && match.cards.length > 0 ? `
            <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px;">
                <h4 style="margin: 0 0 15px 0; color: #856404;">Cards & Disciplinary Actions</h4>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${match.cards.map(card => {
                        const member = [...homeTeam.members, ...awayTeam.members].find(m => m.id === card.memberId);
                        const teamName = homeTeam.members.some(m => m.id === card.memberId) ? homeTeam.name : awayTeam.name;
                        const cardIcon = card.cardType === 'yellow' ? '🟨' : '🟥';
                        const cardColor = card.cardType === 'yellow' ? '#ffc107' : '#dc3545';
                        
                        return `
                            <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid ${cardColor};">
                                <span style="font-size: 1.2em;">${cardIcon}</span>
                                <div style="flex: 1;">
                                    <strong>${member ? member.name : 'Unknown Player'}</strong> (${teamName})
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
        
        const modal = this.createModal(`${homeTeam.name} vs ${awayTeam.name}`, `
            <!-- Mobile-Optimized Check-In Interface -->
            <div class="mobile-checkin-interface">
                <!-- Compact Header with Essential Info -->
                <div class="checkin-header">
                    <div class="match-essential-info">
                        <div class="match-score-line">
                            ${hasScore ? `<span class="score-display">${match.homeScore} - ${match.awayScore}</span>` : ''}
                            <span class="match-status ${match.matchStatus}">${statusDisplay}</span>
                        </div>
                    </div>
                    
                    <!-- Expandable Details (optional) -->
                    <div class="details-toggle" onclick="app.toggleMatchDetails()">
                        <span id="details-toggle-icon">ⓘ</span>
                    </div>
                </div>
                
                <!-- Expandable Match Details (hidden by default) -->
                <div id="match-details-expanded" class="match-details-expanded" style="display: none;">
                    <div class="details-content">
                        <p><strong>Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
                        ${match.time ? `<p><strong>Time:</strong> ${match.time.substring(0, 5)}</p>` : ''}
                        ${match.field ? `<p><strong>Field:</strong> ${match.field}</p>` : ''}
                        ${mainReferee ? `<p><strong>Referee:</strong> ${mainReferee.name}${assistantReferee ? `, ${assistantReferee.name}` : ''}</p>` : ''}
                        ${match.notes ? `<p><strong>Notes:</strong> ${match.notes}</p>` : ''}
                        ${cardsSection}
                    </div>
                </div>
                
                <!-- Team Toggle - Compact Design -->
                <div class="team-toggle-compact">
                    <button class="team-toggle-btn active" id="home-toggle" onclick="app.toggleGridTeam('home')" style="border-left: 4px solid ${homeTeam.colorData};">
                        <span class="team-name">${homeTeam.name}</span>
                        <span class="attendance-count" id="home-attendance-count">0/0</span>
                    </button>
                    <button class="team-toggle-btn" id="away-toggle" onclick="app.toggleGridTeam('away')" style="border-left: 4px solid ${awayTeam.colorData};">
                        <span class="team-name">${awayTeam.name}</span>
                        <span class="attendance-count" id="away-attendance-count">0/0</span>
                    </button>
                </div>
                
                <!-- Single Scroll Player Grid (No Nested Scrolling) -->
                <div class="checkin-grid-area">
                    <div id="grid-home-team" class="team-grid-section active">
                        <div id="grid-container-home" class="player-grid-container-fullscreen"></div>
                    </div>
                    
                    <div id="grid-away-team" class="team-grid-section">
                        <div id="grid-container-away" class="player-grid-container-fullscreen"></div>
                    </div>
                </div>
                
                <!-- Quick Stats Footer -->
                <div class="checkin-footer">
                    <div id="grid-pagination-info" class="pagination-info-compact"></div>
                </div>
            </div>
        `, 'checkin-modal');
        
        // LOADING SPINNER: Close loading modal before showing the main modal
        this.closeLoadingModal();
        
        document.body.appendChild(modal);
        
        // Initialize the check-in interface
        this.initializeCheckInInterface(eventId, matchId, homeTeam, awayTeam, match);
        
        } catch (error) {
            console.error('Error in viewMatch:', error);
            this.closeLoadingModal();
            alert('Failed to load match details. Please try again.');
        }
    }
    
    // New helper functions for mobile check-in interface
    toggleMatchDetails() {
        const detailsSection = document.getElementById('match-details-expanded');
        const toggleIcon = document.getElementById('details-toggle-icon');
        
        if (detailsSection.style.display === 'none') {
            detailsSection.style.display = 'block';
            toggleIcon.textContent = '✕';
        } else {
            detailsSection.style.display = 'none';
            toggleIcon.textContent = 'ⓘ';
        }
    }
    
    initializeCheckInInterface(eventId, matchId, homeTeam, awayTeam, match) {
        // Store current match data
        this.currentEventId = eventId;
        this.currentMatchId = matchId;
        this.currentHomeTeam = homeTeam;
        this.currentAwayTeam = awayTeam;
        this.currentMatch = match;
        this.currentGridTeam = 'home'; // Default to home team
        
        // Update attendance counts
        this.updateAttendanceCounts(match);
        
        // Initialize with home team displayed by default
        this.renderGridTeamFullscreen('home', homeTeam, match.homeTeamAttendees || []);
        this.updatePaginationInfo();
    }
    
    updateAttendanceCounts(match) {
        const homeCount = match.homeTeamAttendees ? match.homeTeamAttendees.length : 0;
        const awayCount = match.awayTeamAttendees ? match.awayTeamAttendees.length : 0;
        const homeTotalPlayers = this.currentHomeTeam ? this.currentHomeTeam.members.length : 0;
        const awayTotalPlayers = this.currentAwayTeam ? this.currentAwayTeam.members.length : 0;
        
        const homeCountElement = document.getElementById('home-attendance-count');
        const awayCountElement = document.getElementById('away-attendance-count');
        
        if (homeCountElement) homeCountElement.textContent = `${homeCount}/${homeTotalPlayers}`;
        if (awayCountElement) awayCountElement.textContent = `${awayCount}/${awayTotalPlayers}`;
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
    toggleGridTeam(teamType) {
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
            
        this.renderGridTeamFullscreen(teamType, team, attendees);
        this.updatePaginationInfo();
    }
    
    // New function to render team grid in fullscreen mode
    renderGridTeamFullscreen(teamType, team, attendees) {
        const containerId = `grid-container-${teamType}`;
        const container = document.getElementById(containerId);
        
        if (!container || !team) return;
        
        // Render all players in fullscreen grid (no pagination, just scroll)
        container.innerHTML = team.members
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(member => {
                const isCheckedIn = attendees.some(a => a.memberId === member.id);
                
                return `
                    <div class="player-grid-item ${isCheckedIn ? 'checked-in' : ''}" 
                         onclick="app.toggleGridPlayerAttendance('${this.currentEventId}', '${this.currentMatchId}', '${member.id}', '${teamType}')">
                        ${member.photo ? 
                            `<img src="${this.getMemberPhotoUrl(member)}" alt="${member.name}" class="player-grid-photo">` :
                            `<div class="player-grid-photo" style="background: #ddd; display: flex; align-items: center; justify-content: center; color: #666; font-size: 20px;">👤</div>`
                        }
                        <div class="player-grid-content">
                            <div class="player-grid-name">${member.name}</div>
                            ${member.jerseyNumber ? `<div class="player-grid-jersey">#${member.jerseyNumber}</div>` : ''}
                        </div>
                        <div class="grid-check-icon">✓</div>
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
        
        infoElement.innerHTML = `${checkedIn}/${totalPlayers} players checked in • Tap to toggle`;
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
                                    eventDate: event.date,
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
        const event = this.events.find(e => e.id === eventId);
        const match = event?.matches.find(m => m.id === matchId);
        
        if (!event || !match) {
            console.error('Event or match not found');
            alert('Event or match not found. Please refresh and try again.');
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
                    checkedInAt: new Date().toISOString()
                });
                gridItem.classList.add('checked-in');
                console.log('Added attendance for member:', memberId);
            }
        }
        
        // Check for suspensions AFTER UI update (for check-ins only) - this runs in background
        if (!wasCheckedIn) {
            this.checkPlayerSuspensionStatus(memberId).then(suspensionStatus => {
                if (suspensionStatus.suspended) {
                    // Revert the check-in if player is suspended
                    const currentIndex = attendeesArray.findIndex(a => a.memberId === memberId);
                    if (currentIndex >= 0) {
                        attendeesArray.splice(currentIndex, 1);
                        if (gridItem) {
                            gridItem.classList.remove('checked-in');
                        }
                        
                        // Show suspension alert
                        const team = this.teams.find(t => t.id === (teamType === 'home' ? match.homeTeamId : match.awayTeamId));
                        const member = team?.members.find(m => m.id === memberId);
                        
                        // Create detailed suspension message
                        const suspensionDetails = suspensionStatus.records.map(record => {
                            const incidentDate = record.incidentDate || record.eventDate;
                            const displayDate = incidentDate ? new Date(incidentDate).toLocaleDateString() : 'Unknown date';
                            const reason = record.reason ? ` (${record.reason})` : '';
                            return `• ${record.suspensionMatches} match${record.suspensionMatches !== 1 ? 'es' : ''} - ${displayDate}${reason}`;
                        }).join('\n');
                        
                        alert(`🚫 PLAYER SUSPENDED\n\n${member?.name || 'Player'} cannot be checked in due to active suspension${suspensionStatus.records.length > 1 ? 's' : ''}:\n\n${suspensionDetails}\n\nTotal: ${suspensionStatus.totalMatches} match${suspensionStatus.totalMatches !== 1 ? 'es' : ''} remaining\n\nPlease mark suspension as "served" in player profile if completed.`);
                        
                        console.log('Reverted check-in due to suspension:', memberId);
                    }
                }
            }).catch(error => {
                console.error('Error checking suspension status:', error);
                // Don't revert on error - allow the check-in to stand
            });
        }
        
        // Update current match reference for interface updates
        this.currentMatch = match;
        
        // Update attendance counts in the interface
        this.updateAttendanceCounts(match);
        this.updatePaginationInfo();
        
        // Save to server in background (don't await for UI responsiveness)
        try {
            console.log('Updating attendance via API...');
            
            // Use the new attendance-only endpoint (no admin auth required)
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
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Attendance updated successfully:', result);
            
            // Update the events display in the background (no modal refresh)
            this.renderEvents();
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
                            <input type="number" class="score-input" id="home-score" value="${match.homeScore !== null ? match.homeScore : ''}" min="0" placeholder="0">
                        </div>
                        <div class="vs-divider">VS</div>
                        <div class="team-score-input">
                            <div class="team-name-label">${awayTeam.name}</div>
                            <input type="number" class="score-input" id="away-score" value="${match.awayScore !== null ? match.awayScore : ''}" min="0" placeholder="0">
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
                                                    .slice()
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(m => `<option value="${m.id}" ${card.memberId === m.id ? 'selected' : ''}>${m.name} (${homeTeam.name})</option>`).join('')}
                                                ${awayTeam.members
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
                                                <option value="Unsporting behavior" ${card.reason === 'Unsporting behavior' ? 'selected' : ''}>Unsporting behavior</option>
                                                <option value="Dissent by word or action" ${card.reason === 'Dissent by word or action' ? 'selected' : ''}>Dissent by word or action</option>
                                                <option value="Persistent infringement" ${card.reason === 'Persistent infringement' ? 'selected' : ''}>Persistent infringement</option>
                                                <option value="Delaying the restart of play" ${card.reason === 'Delaying the restart of play' ? 'selected' : ''}>Delaying the restart of play</option>
                                                <option value="Failure to respect distance" ${card.reason === 'Failure to respect distance' ? 'selected' : ''}>Failure to respect distance</option>
                                                <option value="Entering/leaving without permission" ${card.reason === 'Entering/leaving without permission' ? 'selected' : ''}>Entering/leaving without permission</option>
                                                <option value="Sliding" ${card.reason === 'Sliding' ? 'selected' : ''}>Sliding</option>
                                                <option value="Reckless/aggressive challenge" ${card.reason === 'Reckless/aggressive challenge' ? 'selected' : ''}>Reckless/aggressive challenge</option>
                                                <option value="Denial of a goal scoring opportunity" ${card.reason === 'Denial of a goal scoring opportunity' ? 'selected' : ''}>Denial of a goal scoring opportunity</option>
                                                <option value="Stopping a promising attack" ${card.reason === 'Stopping a promising attack' ? 'selected' : ''}>Stopping a promising attack</option>
                                                <option value="Serious foul play" ${card.reason === 'Serious foul play' ? 'selected' : ''}>Serious foul play</option>
                                                <option value="Violent conduct" ${card.reason === 'Violent conduct' ? 'selected' : ''}>Violent conduct</option>
                                                <option value="Spitting" ${card.reason === 'Spitting' ? 'selected' : ''}>Spitting</option>
                                                <option value="Offensive/insulting language" ${card.reason === 'Offensive/insulting language' ? 'selected' : ''}>Offensive/insulting language</option>
                                                <option value="Second yellow card" ${card.reason === 'Second yellow card' ? 'selected' : ''}>Second yellow card</option>
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
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(m => `<option value="${m.id}">${m.name} (${homeTeam.name})</option>`).join('') || ''}
                            ${awayTeam?.members
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
                            <option value="Unsporting behavior">Unsporting behavior</option>
                            <option value="Dissent by word or action">Dissent by word or action</option>
                            <option value="Persistent infringement">Persistent infringement</option>
                            <option value="Delaying the restart of play">Delaying the restart of play</option>
                            <option value="Failure to respect distance">Failure to respect distance</option>
                            <option value="Entering/leaving without permission">Entering/leaving without permission</option>
                            <option value="Sliding">Sliding</option>
                            <option value="Reckless/aggressive challenge">Reckless/aggressive challenge</option>
                            <option value="Denial of a goal scoring opportunity">Denial of a goal scoring opportunity</option>
                            <option value="Stopping a promising attack">Stopping a promising attack</option>
                            <option value="Serious foul play">Serious foul play</option>
                            <option value="Violent conduct">Violent conduct</option>
                            <option value="Spitting">Spitting</option>
                            <option value="Offensive/insulting language">Offensive/insulting language</option>
                            <option value="Second yellow card">Second yellow card</option>
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
        const matchStatus = document.getElementById('match-status').value;
        const homeScore = document.getElementById('home-score').value;
        const awayScore = document.getElementById('away-score').value;
        const matchNotes = document.getElementById('match-notes').value.trim();
        
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
            
            this.renderEvents();
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
            console.log('Updating attendance via API...');
            
            // Use the new attendance-only endpoint (no admin auth required)
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
    
    closeModal() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.remove();
        });
        
        this.currentModalType = null;
    }
}

// Global functions for onclick handlers
async function showSection(sectionName) {
    await app.showSection(sectionName);
}

// Initialize app
const app = new CheckInViewApp();