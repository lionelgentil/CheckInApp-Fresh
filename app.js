/**
 * CheckIn App v6.1.0 - JavaScript Frontend
 * Works with PHP/PostgreSQL backend
 * Enhanced with pure epoch timestamp support for reliable timezone handling
 */

// Version constant - update this single location to change version everywhere
const APP_VERSION = '6.2.0';

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

// Helper function to generate card reasons dropdown HTML
function generateCardReasonsOptions(selectedReason = '') {
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

// Utility function to get current epoch timestamp
function getCurrentEpochTimestamp() {
    return Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
}

class CheckInApp {
    constructor() {
        this.teams = []; // Full team data (loaded on demand)
        this.teamsBasic = []; // Lightweight team data (id, name, category, colorData, memberCount)
        this.hasCompleteTeamsData = false; // Track if we have full teams data vs partial
        this.events = [];
        this.referees = [];
        this.currentEditingTeam = null;
        this.currentEditingMember = null;
        this.currentEditingEvent = null;
        this.currentEditingReferee = null;
        this.currentModalType = null; // Track current modal type
        
        // Chart.js charts storage
        this.cardCharts = {};
        
        // Performance optimization: API Cache
        this.apiCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.apiVersion = null;
        
        // 🚀 PERFORMANCE OPTIMIZATION: Lazy loading for images
        this.imageObserver = null;
        this.initializeLazyLoading();
        
        this.init();
    }
    
    // 🚀 PERFORMANCE OPTIMIZATION: Photo system now uses direct URLs with HTTP caching
    initializeLazyLoading() {
        if ('IntersectionObserver' in window) {
            this.imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const src = img.dataset.lazySrc;
                        
                        if (src) {
                            // Create a new image to preload
                            const imageLoader = new Image();
                            imageLoader.onload = () => {
                                img.src = src;
                                img.classList.remove('lazy');
                                img.classList.add('lazy-loaded');
                            };
                            imageLoader.onerror = () => {
                                // Fallback to default photo
                                img.src = img.dataset.fallback || '/api/photos?filename=default&gender=male';
                                img.classList.remove('lazy');
                                img.classList.add('lazy-error');
                            };
                            imageLoader.src = src;
                        }
                        
                        observer.unobserve(img);
                    }
                });
            }, {
                root: null,
                rootMargin: '50px',
                threshold: 0.1
            });
            
            console.log('📈 Performance: Lazy loading initialized with IntersectionObserver (legacy system)');
        } else {
            console.log('⚠️ IntersectionObserver not supported, falling back to immediate loading');
        }
    }
    
    // Add image to lazy loading queue
    observeLazyImage(img) {
        if (this.imageObserver && img) {
            this.imageObserver.observe(img);
        }
    }
    
    // Initialize lazy loading for newly added images
    initializeLazyImages(container = document) {
        if (this.imageObserver) {
            const lazyImages = container.querySelectorAll('img.lazy');
            lazyImages.forEach(img => {
                this.imageObserver.observe(img);
            });
            
            if (lazyImages.length > 0) {
                console.log('📸 Performance: Added', lazyImages.length, 'images to lazy loading queue');
            }
        }
    }
    
    // Disconnect lazy loading observer
    disconnectLazyLoading() {
        if (this.imageObserver) {
            this.imageObserver.disconnect();
        }
    }
    
    // Performance: Smart caching system with 401 handling
    async cachedFetch(url, options = {}) {
        const cacheKey = url + JSON.stringify(options);
        const now = Date.now();
        
        // Check if we have cached data that's still valid
        if (this.apiCache.has(cacheKey)) {
            const cached = this.apiCache.get(cacheKey);
            if (now - cached.timestamp < this.cacheTimeout) {
                console.log(`📦 Cache hit for ${url}`);
                return cached.data;
            }
        }
        
        // Fetch fresh data with 401 handling
        console.log(`🌐 Cache miss, fetching ${url}`);
        return await this.apiRequest(url, options, cacheKey, now);
    }
    
    // Centralized API request handler with session management
    async apiRequest(url, options = {}, cacheKey = null, cacheTimestamp = null) {
        try {
            const response = await fetch(url, options);
            
            // Handle 401 Unauthorized - session expired
            if (response.status === 401) {
                console.warn('🔐 Session expired (401), redirecting to re-authenticate...');
                this.handleSessionExpired();
                return; // Don't continue processing
            }
            
            if (response.ok) {
                const data = await response.json();
                
                // Cache the response if caching was requested
                if (cacheKey && cacheTimestamp) {
                    this.apiCache.set(cacheKey, {
                        data: data,
                        timestamp: cacheTimestamp
                    });
                }
                
                return data;
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
    
    // Handle session expiration
    handleSessionExpired() {
        // Clear any cached data since session is invalid
        this.clearCache();
        
        // Close any open modals
        this.closeModal();
        this.closeLoadingModal();
        
        // Show user-friendly message
        const message = `
            🔐 Your session has expired for security reasons.
            
            You will be redirected to re-authenticate.
            
            Don't worry - your data is safe!
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
    
    // Non-cached API calls with 401 handling
    async fetch(url, options = {}) {
        return await this.apiRequest(url, options);
    }
    
    // Clear cache when data is modified
    clearCache(pattern = null) {
        if (pattern) {
            // Clear specific cache entries
            for (let key of this.apiCache.keys()) {
                if (key.includes(pattern)) {
                    this.apiCache.delete(key);
                }
            }
        } else {
            // Clear all cache
            this.apiCache.clear();
        }
    }
    
    async init() {
        // Load events and lightweight team data on initialization for fast startup
        await Promise.all([
            this.loadEvents(),
            this.loadTeamsBasic() // Use lightweight team data for initial load
        ]);
        this.renderEvents();
        
        // Ensure Events section is shown by default
        this.showSection('events');
    }
    
    // API Methods
    async loadTeams() {
        try {
            this.teams = await this.cachedFetch('/api/teams-no-photos');
            this.hasCompleteTeamsData = true; // Mark that we have complete data
        } catch (error) {
            console.error('Error loading teams:', error);
            this.teams = [];
            this.hasCompleteTeamsData = false;
        }
    }
    
    // Lightweight team loading (basic info only) - for performance
    async loadTeamsBasic() {
        try {
            const data = await this.fetch(`/api/teams-basic?_t=${Date.now()}`);
            this.teamsBasic = data;
            console.log('📊 Loaded lightweight teams data:', this.teamsBasic.length, 'teams (basic info only)');
        } catch (error) {
            console.warn('❌ teams-basic endpoint failed, falling back to full teams load:', error);
            // Fallback: load full teams and extract basic info
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
            const loadedTeams = await this.fetch(`/api/teams-specific?ids=${missingTeamIds.join(',')}&_t=${Date.now()}`);
            
            console.log(`✅ Loaded ${loadedTeams.length} specific teams with full player data`);
                
                // DEBUG: Log photo data for first few members to understand structure
                if (loadedTeams.length > 0 && loadedTeams[0].members && loadedTeams[0].members.length > 0) {
                    console.log('🔍 Sample member photo data:', loadedTeams[0].members.slice(0, 3).map(m => ({
                        name: m.name,
                        photo: m.photo,
                        photoType: typeof m.photo,
                        photoLength: m.photo ? m.photo.length : 0
                    })));
                }
                
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
            // Need full player data - load specific team
            const teams = await this.loadSpecificTeams([teamId]);
            return teams[0];
        } else {
            // Just need basic info
            if (!this.teamsBasic || this.teamsBasic.length === 0) {
                await this.loadTeamsBasic();
            }
            return this.teamsBasic.find(t => t.id === teamId);
        }
    }
    
    async saveTeams() {
        // Create a cleaned version of teams data without large member photos
        const cleanedTeams = this.teams.map(team => ({
            id: team.id,
            name: team.name,
            category: team.category,
            colorData: team.colorData,
            description: team.description,
            captainId: team.captainId,
            members: team.members.map(member => ({
                id: member.id,
                name: member.name,
                jerseyNumber: member.jerseyNumber,
                gender: member.gender,
                // Only include small photo references, not base64 data
                photo: member.photo && member.photo.startsWith('data:image/') ? 'has_photo' : member.photo
            }))
        }));
        
        const dataSize = JSON.stringify(cleanedTeams).length;
        console.log('🚨 saveTeams called with cleaned data size:', dataSize, 'bytes');
        
        // ⚠️ WARNING: If data size is still > 1MB after cleaning, there's a real issue
        if (dataSize > 1000000) {
            console.error('🚫 CRITICAL: Teams data is still suspiciously large after cleaning!', dataSize, 'bytes');
            console.error('🔍 This suggests genuine data corruption or excessive team/member count');
            console.log('Cleaned teams data sample:', JSON.stringify(cleanedTeams).substring(0, 1000) + '...');
            
            // Try to identify the issue
            cleanedTeams.forEach((team, teamIndex) => {
                const teamSize = JSON.stringify(team).length;
                if (teamSize > 100000) {
                    console.error(`🚫 Team ${teamIndex} (${team.name}) is huge even after cleaning:`, teamSize, 'bytes');
                    console.error(`Team has ${team.members.length} members`);
                }
            });
            
            throw new Error('Teams data is too large even after cleaning - possible data corruption');
        }
        
        console.trace('saveTeams call stack:');
        
        try {
            const data = await this.fetch('/api/teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(cleanedTeams)
            });
            
            // Clear cache after successful save to ensure fresh data on next load
            this.clearCache();
            console.log('🧹 Cache cleared after teams save');
            
            return data;
        } catch (error) {
            console.error('Error saving teams:', error);
            throw error;
        }
    }
    
    async loadEvents() {
        try {
            this.events = await this.cachedFetch('/api/events');
        } catch (error) {
            console.error('Error loading events:', error);
            this.events = [];
        }
    }
    
    async saveEvents() {
        try {
            const result = await this.fetch('/api/events', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.events)
            });
            
            // Clear cache after successful save to ensure fresh data on next load
            this.clearCache();
            console.log('🧹 Cache cleared after events save');
            
            return result;
        } catch (error) {
            console.error('Error saving events:', error);
            throw error;
        }
    }

    // =====================================
    // EFFICIENT INDIVIDUAL EVENT OPERATIONS (New)
    // =====================================
    
    async createSingleEvent(eventData) {
        try {
            const result = await this.fetch('/api/event', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventData)
            });
            
            // Clear cache after successful creation to ensure fresh data on next load
            this.clearCache();
            console.log('🧹 Cache cleared after event creation');
            
            return result;
        } catch (error) {
            console.error('Error creating event:', error);
            throw error;
        }
    }
    
    async updateSingleEvent(eventId, eventData) {
        try {
            const result = await this.fetch(`/api/event?id=${encodeURIComponent(eventId)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventData)
            });
            
            // Clear cache after successful update to ensure fresh data on next load
            this.clearCache();
            console.log('🧹 Cache cleared after event update');
            
            return result;
        } catch (error) {
            console.error('Error updating event:', error);
            throw error;
        }
    }
    
    async deleteSingleEvent(eventId) {
        try {
            const result = await this.fetch(`/api/event?id=${encodeURIComponent(eventId)}`, {
                method: 'DELETE'
            });
            
            // Clear cache after successful deletion to ensure fresh data on next load
            this.clearCache();
            console.log('🧹 Cache cleared after event deletion');
            
            return result;
        } catch (error) {
            console.error('Error deleting event:', error);
            throw error;
        }
    }
    
    async loadReferees() {
        try {
            this.referees = await this.cachedFetch('/api/referees');
        } catch (error) {
            console.error('Error loading referees:', error);
            this.referees = [];
        }
    }

    // =====================================
    // LAZY PHOTO LOADING (On-demand photo loading)
    // =====================================

    /**
     * DEPRECATED: No longer needed after photo migration to filenames
     * Photos are now loaded directly via getMemberPhotoUrl() with direct URLs
     */
    async loadMemberPhotosLazily(members, containerId = null) {
        // DEPRECATED: This function is no longer needed
        // Photos now use direct URLs from getMemberPhotoUrl() with HTTP caching
        console.log('📸 Photo loading: Using direct URLs (lazy loading deprecated)');
    }

    /**
     * DEPRECATED: This function is completely removed
     * Photos now use direct /api/photos?filename= URLs with HTTP caching
     */
    async loadSingleMemberPhoto(memberId) {
        // DEPRECATED: This endpoint is deprecated
        console.warn('loadSingleMemberPhoto is deprecated - use getMemberPhotoUrl() instead');
        return { success: false, deprecated: true };
    }

    /**
     * DEPRECATED: No longer needed after photo migration
     * Photos now use direct URLs with no need for UI updates
     */
    updateMemberPhotoInUI(memberId, photoUrl, containerId = null) {
        // DEPRECATED: This function is no longer needed
        console.warn('updateMemberPhotoInUI is deprecated - photos now use direct URLs');
    }
    
    async saveReferees() {
        try {
            const result = await this.fetch('/api/referees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.referees)
            });
            
            // Clear cache after successful save to ensure fresh data on next load
            this.clearCache();
            console.log('🧹 Cache cleared after referees save');
            
            return result;
        } catch (error) {
            console.error('Error saving referees:', error);
            throw error;
        }
    }
    
    // Utility Methods
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // Helper function to convert match epoch timestamp to time string for form display
    matchTimeEpochToString(epochTimestamp) {
        if (!epochTimestamp) return '';
        
        const date = new Date(epochTimestamp * 1000);
        // Extract just the time portion in HH:MM format
        return date.toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Helper function to convert date string and time string to epoch timestamp
    matchTimeStringToEpoch(dateString, timeString) {
        if (!dateString || !timeString) return null;
        
        // Combine date and time strings, then convert to epoch
        const dateTimeString = `${dateString}T${timeString}:00`;
        const date = new Date(dateTimeString);
        
        // Convert to Pacific timezone epoch
        const pacificDate = new Date(date.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'}));
        return Math.floor(pacificDate.getTime() / 1000);
    }
    
    // Helper function to convert date string to epoch timestamp (at midnight Pacific time)
    dateStringToEpoch(dateString) {
        if (!dateString) return null;
        
        // Convert date string (YYYY-MM-DD) to epoch timestamp at midnight Pacific time
        // Use the same approach as matchTimeStringToEpoch but for midnight
        const dateTimeString = `${dateString}T00:00:00`;
        const date = new Date(dateTimeString);
        
        // Convert to Pacific timezone epoch (midnight Pacific time)
        const pacificDate = new Date(date.toLocaleString('en-US', {timeZone: 'America/Los_Angeles'}));
        return Math.floor(pacificDate.getTime() / 1000);
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    // 🚀 PERFORMANCE: Generate image HTML (no longer lazy loading since we have direct filenames)
    getLazyImageHtml(member, className = 'member-photo', style = '') {
        // After photo migration, we can use direct photo URLs instead of lazy loading
        const photoUrl = this.getMemberPhotoUrl(member);
        
        return `<img src="${photoUrl}" 
                     alt="${member.name}" 
                     class="${className}" 
                     ${style ? `style="${style}"` : ''}
                     loading="lazy">`;
    }
    
    // Get member photo URL with gender defaults
    getMemberPhotoUrl(member) {
        // DEBUG: Log photo data to understand what we're receiving
        console.log('🖼️ getMemberPhotoUrl called for member:', member.name, 'photo data:', member.photo);
        
        // Check if member has a real custom photo
        if (member.photo) {
            // Skip gender defaults
            if (member.photo.includes('default-male.svg') || 
                member.photo.includes('default-female.svg') || 
                member.photo.includes('default.svg')) {
                console.log('👤 Using gender default for:', member.name);
                return this.getGenderDefaultPhoto(member);
            }
            
            // Handle base64 images (legacy format)
            if (member.photo.startsWith('data:image/')) {
                console.log('📸 Using base64 photo for:', member.name);
                return member.photo; // Return base64 image directly
            }
            
            // Handle direct photo URLs (new optimized format)
            if (member.photo.startsWith('/photos/')) {
                console.log('⚡ Using direct photo URL for:', member.name, 'URL:', member.photo);
                return member.photo; // Direct static file serving (fastest)
            }
            
            // Check if it's an API URL with filename parameter (legacy)
            if (member.photo.includes('/api/photos?filename=')) {
                const match = member.photo.match(/filename=([^&]+)/);
                if (match) {
                    const filename = match[1];
                    // Check if the filename has a valid image extension
                    if (filename.includes('.jpg') || filename.includes('.jpeg') || 
                        filename.includes('.png') || filename.includes('.webp')) {
                        console.log('🔗 Converting API URL to direct URL for:', member.name, 'filename:', filename);
                        // Convert to direct URL for better performance
                        return `/photos/${filename}`;
                    }
                }
            }
            
            // Check if it's a direct filename with valid extension
            if ((member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                member.photo.includes('.png') || member.photo.includes('.webp')) &&
                !member.photo.startsWith('/photos/') && !member.photo.startsWith('/api/photos') && !member.photo.startsWith('http')) {
                console.log('📁 Converting filename to direct URL for:', member.name, 'filename:', member.photo);
                // Convert filename to direct URL (bypass PHP)
                return `/photos/${member.photo}`;
            }
            
            // Check if it's already a full HTTP URL with valid extension
            if (member.photo.startsWith('http') && 
                (member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                 member.photo.includes('.png') || member.photo.includes('.webp'))) {
                console.log('🌐 Using external URL photo for:', member.name);
                return member.photo;
            }
            
            console.log('❓ Photo data not recognized, using default for:', member.name, 'photo:', member.photo);
        } else {
            console.log('🚫 No photo data for:', member.name);
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
        // Between seasons - use most recent completed season for "current"
        else if (month === 1 || (month === 2 && day < 15)) {
            // Jan 1 - Feb 14: Use previous Fall season as "current"
            return {
                type: 'Fall',
                year: year - 1,
                startDate: new Date(year - 1, 7, 1),
                endDate: new Date(year - 1, 11, 31)
            };
        } else {
            // July 1 - July 31: Use previous Spring season as "current"
            return {
                type: 'Spring',
                year: year,
                startDate: new Date(year, 1, 15),
                endDate: new Date(year, 5, 30)
            };
        }
    }
    
    isCurrentSeasonEvent(eventEpoch) {
        const currentSeason = this.getCurrentSeason();
        const eventEpochTime = eventEpoch * 1000; // Convert to milliseconds
        return eventEpochTime >= currentSeason.startDate.getTime() && eventEpochTime <= currentSeason.endDate.getTime();
    }
    
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
        
        // 🚀 PHOTO REFRESH FIX: Force refresh all images of this member immediately
        this.forceRefreshMemberPhoto(memberId, photoUrl);
        
        return photoUrl;
    }
    
    // 🚀 NEW: Force refresh member photo in all UI elements
    forceRefreshMemberPhoto(memberId, newPhotoUrl) {
        console.log('🖼️ Force refreshing photo for member:', memberId, 'with URL:', newPhotoUrl);
        
        // Find all image elements for this member and update them immediately
        const memberImages = document.querySelectorAll(`img[alt*="${memberId}"], img[data-member-id="${memberId}"]`);
        
        memberImages.forEach(img => {
            const oldSrc = img.src;
            img.src = newPhotoUrl;
            console.log('Updated image src from', oldSrc, 'to', newPhotoUrl);
        });
        
        // Also find images by member name pattern (fallback)
        const memberNameImages = document.querySelectorAll('.member-photo, .member-photo-small');
        memberNameImages.forEach(img => {
            // Check if this image's src matches the old member pattern
            if (img.src.includes(`member_id=${memberId}`) || img.src.includes(`filename=${memberId}`)) {
                const oldSrc = img.src;
                img.src = newPhotoUrl;
                console.log('Updated member image by pattern from', oldSrc, 'to', newPhotoUrl);
            }
        });
        
        // Clear any image cache to ensure fresh loads
        this.clearImageCache();
        
        console.log('✅ Photo refresh completed for member:', memberId);
    }
    
    // 🚀 NEW: Clear image cache to force fresh loads
    clearImageCache() {
        // Force browser to reload images by adding cache-busting parameters
        const allImages = document.querySelectorAll('img');
        allImages.forEach(img => {
            if (img.src.includes('/api/photos') && !img.src.includes('_refresh=')) {
                const separator = img.src.includes('?') ? '&' : '?';
                img.src = img.src + separator + '_refresh=' + Date.now();
            }
        });
    }
    
    // Debug helper function - can be called from browser console
    debugPhotos() {
        console.log('=== PHOTO DEBUG INFO ===');
        this.teams.forEach(team => {
            console.log(`Team: ${team.name}`);
            team.members.forEach(member => {
                console.log(`  Member: ${member.name}`);
                console.log(`    ID: ${member.id}`);
                console.log(`    Photo: ${member.photo || 'NO PHOTO'}`);
                console.log(`    Photo exists: ${!!member.photo}`);
            });
        });
        console.log('=========================');
    }
    
    // Test if a photo URL works
    async testPhotoUrl(url) {
        console.log('Testing photo URL:', url);
        try {
            const response = await fetch(url);
            console.log('Photo URL response:', response.status, response.ok);
            if (response.ok) {
                console.log('✅ Photo URL is accessible');
            } else {
                console.log('❌ Photo URL returned error:', response.status);
            }
        } catch (error) {
            console.log('❌ Photo URL test failed:', error.message);
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
                await this.renderTeams();
            } else if (sectionName === 'events') {
                // Performance optimization: Use lightweight team data for events display
                if (this.teamsBasic.length === 0) {
                    await this.loadTeamsBasic(); // Only load basic team info for events display
                }
                if (this.referees.length === 0) {
                    await this.loadReferees();
                }
                this.renderEvents();
            } else if (sectionName === 'referees') {
                if (this.referees.length === 0) {
                    await this.loadReferees();
                }
                this.renderReferees();
            } else if (sectionName === 'standings') {
                // Ensure we have both teams and events loaded for standings calculation
                if (this.teams.length === 0 && this.teamsBasic.length === 0) {
                    await this.loadTeams();
                } else if (this.teams.length === 0 && this.teamsBasic.length > 0) {
                    // We have basic data but need full data for standings
                    await this.loadTeams();
                }
                if (this.events.length === 0) {
                    await this.loadEvents();
                }
                this.renderStandings();
            } else if (sectionName === 'cards') {
                // Ensure we have all data loaded for card tracking
                if (this.teams.length === 0 && this.teamsBasic.length === 0) {
                    await this.loadTeams();
                } else if (this.teams.length === 0 && this.teamsBasic.length > 0) {
                    // We have basic data but need full data for cards
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
                // Game tracker needs teams, events and referees for display
                if (this.teams.length === 0 && this.teamsBasic.length === 0) {
                    await this.loadTeams();
                } else if (this.teams.length === 0 && this.teamsBasic.length > 0) {
                    // We have basic data but need full data for game tracker
                    await this.loadTeams();
                }
                if (this.events.length === 0) {
                    await this.loadEvents();
                }
                if (this.referees.length === 0) {
                    await this.loadReferees();
                }
                this.renderGameTracker();
            } else if (sectionName === 'red-card-mgmt') {
                // Red card management needs teams and events for display
                if (this.teamsBasic.length === 0) {
                    await this.loadTeamsBasic();
                }
                if (this.events.length === 0) {
                    await this.loadEvents();
                }
                this.renderRedCardManagement();
            } else if (sectionName === 'season') {
                // Ensure we have all data loaded for season management
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
                const container = document.getElementById(`${sectionName}-container`);
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
            'teams': 'Loading teams and player rosters...',
            'events': 'Loading events and match schedules...',
            'referees': 'Loading referee information...',
            'standings': 'Calculating league standings...',
            'cards': 'Loading card tracker and analyzing all matches...',
            'game-tracker': 'Loading game tracker and match data...',
            'season': 'Loading season management data...'
        };
        return messages[sectionName] || 'Loading section...';
    }
    
    async renderTeams() {
        const container = document.getElementById('teams-container');
        // TEAMS BUG FIX: Use a unique ID for teams section to avoid cross-section state pollution
        const selectedTeamId = document.getElementById('teams-team-selector')?.value;
        
        // Get all teams and sort alphabetically
        let teamsToShow = this.teams.slice(); // Create a copy
        teamsToShow.sort((a, b) => a.name.localeCompare(b.name));
        
        if (teamsToShow.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No teams yet</h3>
                    <p>Create your first team to get started</p>
                </div>
            `;
            return;
        }
        
        // Create team selector dropdown with categories
        let selectorHtml = `
            <div class="team-selector-container">
                <label class="form-label">Select a team to view roster:</label>
                <select id="teams-team-selector" class="form-select" onchange="app.renderTeams()">
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
                                <div class="team-actions">
                                    <button class="btn btn-small" onclick="app.showAddMemberModal('${selectedTeam.id}')" title="Add Member">+</button>
                                    ${selectedTeam.members.length > 0 ? `<button class="btn btn-small btn-captain" onclick="app.showCaptainsModal('${selectedTeam.id}')" title="Manage Captains">👑</button>` : ''}
                                    <button class="btn btn-small btn-secondary" onclick="app.editTeam('${selectedTeam.id}')" title="Edit Team">✏️</button>
                                    <button class="btn btn-small btn-danger" onclick="app.handleActionClick(event, app.deleteTeamWithLoading.bind(app), '${selectedTeam.id}')" title="Delete Team">🗑️</button>
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
                                        <span id="team-lifetime-stats-${selectedTeam.id}"> • Loading disciplinary records...</span>
                                    </div>
                                </div>
                            ` : ''}
                            <div class="members-list-full">
                                ${selectedTeam.members
                                    .slice() // Create a copy to avoid mutating original array
                                    .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by name
                                    .map(member => {
                                    // Count current season cards for this member across all matches (using new season logic)
                                    let currentYellowCards = 0;
                                    let currentRedCards = 0;
                                    
                                    this.events.forEach(event => {
                                        // Only count cards from current season events
                                        if (this.isCurrentSeasonEvent(event.date_epoch)) {
                                            event.matches.forEach(match => {
                                                if (match.cards) {
                                                    const memberCards = match.cards.filter(card => card.memberId === member.id);
                                                    currentYellowCards += memberCards.filter(card => card.cardType === 'yellow').length;
                                                    currentRedCards += memberCards.filter(card => card.cardType === 'red').length;
                                                }
                                            });
                                        }
                                    });
                                    
                                    // Note: Lifetime cards will be fetched asynchronously and updated via DOM manipulation
                                    // This is a placeholder that will be updated once the disciplinary records are loaded
                                    const currentCardsDisplay = [];
                                    if (currentYellowCards > 0) currentCardsDisplay.push(`🟨${currentYellowCards}`);
                                    if (currentRedCards > 0) currentCardsDisplay.push(`🟥${currentRedCards}`);
                                    const currentCardsText = currentCardsDisplay.length > 0 ? ` • ${currentCardsDisplay.join(' ')} (current season)` : '';
                                    
                                    return `
                                        <div class="member-item">
                                            <div class="member-info">
                                                ${this.getLazyImageHtml(member, 'member-photo')}
                                                <div class="member-details">
                                                    <div class="member-name">${member.name}${allCaptains.some(c => c.memberId === member.id) ? ' 👑' : ''}</div>
                                                    <div class="member-meta" id="member-meta-${member.id}">
                                                        ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                                        ${member.gender ? ` • ${member.gender}` : ''}
                                                        ${currentCardsText}
                                                        <span class="lifetime-cards" id="lifetime-cards-${member.id}"> • Loading disciplinary records...</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="member-actions">
                                                <button class="btn btn-small" onclick="event.preventDefault(); app.viewPlayerProfileWithLoading('${selectedTeam.id}', '${member.id}')" title="View Profile">👤</button>
                                                <button class="btn btn-small btn-secondary" onclick="event.preventDefault(); app.editMemberWithLoading('${selectedTeam.id}', '${member.id}')" title="Edit Member">✏️</button>
                                                <button class="btn btn-small btn-danger" onclick="app.handleActionClick(event, app.deleteMemberWithLoading.bind(app), '${selectedTeam.id}', '${member.id}')" title="Delete Member">🗑️</button>
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
                
                // 🖼️ Photos now use direct URLs (no lazy loading needed)
                console.log('🖼️ Team photos use direct URLs with HTTP caching');
            }
        }
        
        // 🚀 PERFORMANCE: Initialize lazy loading for newly rendered images
        this.initializeLazyImages(container);
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
                
                // 🚀 PERFORMANCE OPTIMIZATION: Batch DOM updates to avoid reflows
                console.log('📈 Performance: Batching DOM updates for', team.members.length, 'team members');
                
                // Collect all DOM updates in a batch
                const domUpdates = [];
                
                // Prepare team-wide lifetime statistics update
                const teamLifetimeElement = document.getElementById(`team-lifetime-stats-${team.id}`);
                if (teamLifetimeElement) {
                    const teamText = (totalLifetimeYellow > 0 || totalLifetimeRed > 0) 
                        ? ` • 🟨${totalLifetimeYellow} 🟥${totalLifetimeRed} (lifetime)`
                        : ' • No lifetime cards';
                    domUpdates.push({ element: teamLifetimeElement, text: teamText });
                }
                
                // Prepare individual member updates
                team.members.forEach(member => {
                    const memberRecords = recordsByMember[member.id] || [];
                    
                    // Count lifetime cards
                    let lifetimeYellow = 0;
                    let lifetimeRed = 0;
                    
                    memberRecords.forEach(record => {
                        if (record.cardType === 'yellow') lifetimeYellow++;
                        else if (record.cardType === 'red') lifetimeRed++;
                    });
                    
                    // Prepare DOM update for this member
                    const lifetimeElement = document.getElementById(`lifetime-cards-${member.id}`);
                    if (lifetimeElement) {
                        let memberText = '';
                        if (lifetimeYellow > 0 || lifetimeRed > 0) {
                            const lifetimeDisplay = [];
                            if (lifetimeYellow > 0) lifetimeDisplay.push(`🟨${lifetimeYellow}`);
                            if (lifetimeRed > 0) lifetimeDisplay.push(`🟥${lifetimeRed}`);
                            memberText = ` • ${lifetimeDisplay.join(' ')} (lifetime)`;
                        }
                        domUpdates.push({ element: lifetimeElement, text: memberText });
                    }
                });
                
                // 🚀 Apply all DOM updates in a single batch using requestAnimationFrame
                // This ensures updates happen during the next repaint cycle, minimizing reflows
                requestAnimationFrame(() => {
                    domUpdates.forEach(update => {
                        update.element.textContent = update.text;
                    });
                    console.log('⚡ Batched', domUpdates.length, 'DOM updates for team', team.name);
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
    
    renderEvents() {
        console.log('🔍 renderEvents called - teamsBasic loaded:', this.teamsBasic.length, 'events loaded:', this.events.length);
        const container = document.getElementById('events-container');
        const showPastEvents = document.getElementById('show-past-events')?.checked || false;
        
        if (this.events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No events yet</h3>
                    <p>Create your first event to get started</p>
                </div>
            `;
            return;
        }
        
        // 🚀 PERFORMANCE OPTIMIZATION: Create lookup maps using lightweight team data
        const teamLookup = new Map();
        this.teamsBasic.forEach(team => teamLookup.set(team.id, team));
        
        const refereeLookup = new Map();
        this.referees.forEach(referee => refereeLookup.set(referee.id, referee));
        
        console.log('📈 Performance: Created lookup maps for', this.teamsBasic.length, 'teams (basic) and', this.referees.length, 'referees');
        
        // Filter events based on date and toggle
        const todayEpoch = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000); // Convert to epoch seconds
        
        let eventsToShow = this.events.filter(event => {
            // Use epoch timestamp for comparison (much simpler!)
            const eventEpoch = event.date_epoch;
            
            if (showPastEvents) {
                return eventEpoch < todayEpoch; // Show only past events
            } else {
                return eventEpoch >= todayEpoch; // Show only future events
            }
        });
        
        // Sort chronologically (future events ascending, past events descending)
        eventsToShow.sort((a, b) => {
            // Simple epoch comparison - no Date object creation needed!
            return showPastEvents ? b.date_epoch - a.date_epoch : a.date_epoch - b.date_epoch;
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
                        <div class="event-date">${epochToPacificDate(event.date_epoch)}</div>
                    </div>
                    <div class="team-actions">
                        <button class="btn btn-small" onclick="app.showAddMatchModal('${event.id}')" title="Add Match">+</button>
                        <button class="btn btn-small btn-secondary" onclick="app.editEvent('${event.id}')" title="Edit Event">✏️</button>
                        <button class="btn btn-small btn-danger" onclick="app.deleteEvent('${event.id}')" title="Delete Event">🗑️</button>
                    </div>
                </div>
                <div class="event-description">${event.description || ''}</div>
                <div class="matches-container">
                    ${event.matches
                        .sort((a, b) => {
                            // Sort by epoch time first (much simpler!)
                            if (a.time_epoch && b.time_epoch) {
                                if (a.time_epoch !== b.time_epoch) {
                                    return a.time_epoch - b.time_epoch; // Simple numeric comparison
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
                        // 🚀 PERFORMANCE: Use O(1) lookup instead of O(n) find
                        const homeTeam = teamLookup.get(match.homeTeamId);
                        const awayTeam = teamLookup.get(match.awayTeamId);
                        
                        // Debug team lookups
                        if (!homeTeam) {
                            console.log('❌ Home team not found for ID:', match.homeTeamId, 'Available team IDs:', Array.from(teamLookup.keys()));
                        }
                        if (!awayTeam) {
                            console.log('❌ Away team not found for ID:', match.awayTeamId, 'Available team IDs:', Array.from(teamLookup.keys()));
                        }
                        
                        // 🚀 PERFORMANCE: Use O(1) lookup instead of O(n) find
                        const mainReferee = match.mainRefereeId ? refereeLookup.get(match.mainRefereeId) : null;
                        const assistantReferee = match.assistantRefereeId ? refereeLookup.get(match.assistantRefereeId) : null;
                        
                        // Calculate gender-based attendance counts
                        let homeAttendanceText = '';
                        if (homeTeam && homeTeam.members) {
                            const homeAttendees = match.homeTeamAttendees || [];
                            const homeMaleTotal = homeTeam.members.filter(m => m.gender === 'male').length;
                            const homeFemaleTotal = homeTeam.members.filter(m => m.gender === 'female').length;
                            
                            let homeMalePresent = 0, homeFemalePresent = 0;
                            homeAttendees.forEach(attendeeId => {
                                const member = homeTeam.members.find(m => m.id === attendeeId);
                                if (member) {
                                    if (member.gender === 'male') homeMalePresent++;
                                    else if (member.gender === 'female') homeFemalePresent++;
                                }
                            });
                            
                            const parts = [];
                            if (homeFemaleTotal > 0) parts.push(`${homeFemalePresent}/${homeFemaleTotal} Female`);
                            if (homeMaleTotal > 0) parts.push(`${homeMalePresent}/${homeMaleTotal} Male`);
                            homeAttendanceText = parts.join(', ') || '0/0';
                        }
                        
                        let awayAttendanceText = '';
                        if (awayTeam && awayTeam.members) {
                            const awayAttendees = match.awayTeamAttendees || [];
                            const awayMaleTotal = awayTeam.members.filter(m => m.gender === 'male').length;
                            const awayFemaleTotal = awayTeam.members.filter(m => m.gender === 'female').length;
                            
                            let awayMalePresent = 0, awayFemalePresent = 0;
                            awayAttendees.forEach(attendeeId => {
                                const member = awayTeam.members.find(m => m.id === attendeeId);
                                if (member) {
                                    if (member.gender === 'male') awayMalePresent++;
                                    else if (member.gender === 'female') awayFemalePresent++;
                                }
                            });
                            
                            const parts = [];
                            if (awayFemaleTotal > 0) parts.push(`${awayFemalePresent}/${awayFemaleTotal} Female`);
                            if (awayMaleTotal > 0) parts.push(`${awayMalePresent}/${awayMaleTotal} Male`);
                            awayAttendanceText = parts.join(', ') || '0/0';
                        }
                        
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
                                        <div class="attendance-count">👥 ${homeAttendanceText}</div>
                                    </div>
                                    <div class="vs-text">
                                        ${hasScore ? scoreDisplay : 'VS'}
                                        ${statusDisplay ? `<div style="font-size: 0.8em;">${statusDisplay}</div>` : ''}
                                    </div>
                                    <div class="team-info-match">
                                        <span class="team-name-match">${awayTeam ? awayTeam.name : 'Unknown Team'}</span>
                                        ${awayTeam && awayTeam.category ? `<div class="team-category-small">${awayTeam.category}</div>` : ''}
                                        <div class="attendance-count">👥 ${awayAttendanceText}</div>
                                    </div>
                                </div>
                                ${match.field ? `<div class="match-field">Field: ${match.field}</div>` : ''}
                                ${match.time_epoch ? `<div class="match-time">Time: ${epochToPacificTime(match.time_epoch)}</div>` : ''}
                                ${mainReferee ? `<div class="match-referee">Referee: ${mainReferee.name}${assistantReferee ? `, ${assistantReferee.name}` : ''}</div>` : ''}
                                ${cardsDisplay ? `<div class="match-cards">Cards: ${cardsDisplay}</div>` : ''}
                                <div class="match-actions">
                                    <button class="btn btn-small" onclick="event.preventDefault(); app.viewMatchWithLoading('${event.id}', '${match.id}')" title="View Match">👁️</button>
                                    <button class="btn btn-small" onclick="app.editMatch('${event.id}', '${match.id}')" title="Edit Match">✏️</button>
                                    <button class="btn btn-small btn-secondary" onclick="event.preventDefault(); app.editMatchResultWithLoading('${event.id}', '${match.id}')" title="Edit Result">🏆</button>
                                    <button class="btn btn-small btn-danger" onclick="app.deleteMatch('${event.id}', '${match.id}')" title="Delete Match">🗑️</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    ${event.matches.length === 0 ? '<div class="empty-state"><p>No matches yet</p></div>' : ''}
                </div>
            </div>
        `).join('');
    }
    
    // Team Management
    showAddTeamModal() {
        console.log('showAddTeamModal called');
        this.currentEditingTeam = null;
        this.showTeamModal();
    }
    
    editTeam(teamId) {
        this.currentEditingTeam = this.teams.find(t => t.id === teamId);
        this.showTeamModal(this.currentEditingTeam);
    }
    
    showTeamModal(team = null) {
        const isEdit = team !== null;
        const modal = this.createModal(isEdit ? 'Edit Team' : 'Add Team', `
            <div class="form-group">
                <label class="form-label">Team Name *</label>
                <input type="text" class="form-input" id="team-name" value="${team ? team.name : ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Age Category *</label>
                <select class="form-select" id="team-category" required>
                    <option value="">Select age category</option>
                    <option value="Over 30" ${team && team.category === 'Over 30' ? 'selected' : ''}>Over 30</option>
                    <option value="Over 40" ${team && team.category === 'Over 40' ? 'selected' : ''}>Over 40</option>
                </select>
            </div>
            ${team && team.members && team.members.length > 0 ? `
            <div class="form-group">
                <label class="form-label">Team Captain</label>
                <select class="form-select" id="team-captain">
                    <option value="">Select team captain (optional)</option>
                    ${team.members
                        .slice() // Create a copy to avoid mutating original array
                        .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by name
                        .map(member => 
                        `<option value="${member.id}" ${team.captainId === member.id ? 'selected' : ''}>${member.name}</option>`
                    ).join('')}
                </select>
            </div>
            ` : ''}
            <div class="form-group">
                <label class="form-label">Team Color</label>
                <input type="color" class="form-input" id="team-color" value="${team ? team.colorData : '#2196F3'}">
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea class="form-input" id="team-description" rows="3">${team ? team.description || '' : ''}</textarea>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.handleActionClick(event, app.saveTeamWithLoading.bind(app))">${isEdit ? 'Update' : 'Create'} Team</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveTeam() {
        console.log('saveTeam called');
        const name = document.getElementById('team-name').value.trim();
        const category = document.getElementById('team-category').value;
        const color = document.getElementById('team-color').value;
        const description = document.getElementById('team-description').value.trim();
        const captainId = document.getElementById('team-captain')?.value || null;
        
        console.log('Form values:', { name, category, color, description, captainId });
        
        if (!name) {
            alert('Please enter a team name');
            return;
        }
        
        if (!category) {
            alert('Please select an age category');
            return;
        }
        
        if (this.currentEditingTeam) {
            // Edit existing team
            this.currentEditingTeam.name = name;
            this.currentEditingTeam.category = category;
            this.currentEditingTeam.colorData = color;
            this.currentEditingTeam.description = description;
            this.currentEditingTeam.captainId = captainId;
        } else {
            // Add new team
            const newTeam = {
                id: this.generateUUID(),
                name: name,
                category: category,
                colorData: color,
                description: description,
                captainId: null, // New teams don't have captains until members are added
                members: []
            };
            this.teams.push(newTeam);
        }
        
        console.log('About to call saveTeams, current teams:', this.teams);
        try {
            await this.saveTeams();
            this.renderTeams();
            this.closeModal();
        } catch (error) {
            console.error('Save team error:', error);
            alert(`Failed to save team: ${error.message}

Please check the browser console (F12) for more details.`);
        }
    }
    
    async deleteTeam(teamId) {
        if (!confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
            return;
        }
        
        this.teams = this.teams.filter(t => t.id !== teamId);
        
        try {
            await this.saveTeams();
            this.renderTeams();
        } catch (error) {
            alert('Failed to delete team. Please try again.');
        }
    }
    
    // Captain Management
    showCaptainModal(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team || team.members.length === 0) {
            alert('This team has no members yet. Add members first to select a captain.');
            return;
        }
        
        const modal = this.createModal('Select Team Captain', `
            <div class="form-group">
                <label class="form-label">Choose Captain for ${team.name} *</label>
                <select class="form-select" id="captain-select" required>
                    <option value="">Select team captain</option>
                    ${team.members
                        .slice() // Create a copy to avoid mutating original array  
                        .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically by name
                        .map(member => 
                        `<option value="${member.id}" ${team.captainId === member.id ? 'selected' : ''}>${member.name}${member.jerseyNumber ? ` (#${member.jerseyNumber})` : ''}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <button class="btn btn-secondary" onclick="app.removeCaptain('${teamId}')" ${!team.captainId ? 'disabled' : ''}>Remove Captain</button>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveCaptain('${teamId}')">Set Captain</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveCaptain(teamId) {
        const captainId = document.getElementById('captain-select').value;
        
        if (!captainId) {
            alert('Please select a captain');
            return;
        }
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        team.captainId = captainId;
        
        try {
            await this.saveTeams();
            this.renderTeams();
            this.closeModal();
        } catch (error) {
            alert('Failed to set captain. Please try again.');
        }
    }
    
    async removeCaptain(teamId) {
        if (!confirm('Remove the current team captain?')) {
            return;
        }
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        team.captainId = null;
        
        try {
            await this.saveTeams();
            this.renderTeams();
            this.closeModal();
        } catch (error) {
            alert('Failed to remove captain. Please try again.');
        }
    }
    
    // Multiple Captains Management (New System)
    async showCaptainsModal(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team || team.members.length === 0) {
            alert('This team has no members yet. Add members first to manage captains.');
            return;
        }
        
        // Get current captains from the team data
        const currentCaptains = team.captains || [];
        const legacyCaptain = team.captainId ? team.members.find(m => m.id === team.captainId) : null;
        
        // Create checkboxes for each team member
        const memberCheckboxes = team.members
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(member => {
                const isCaptain = currentCaptains.some(c => c.memberId === member.id) || 
                                 (legacyCaptain && legacyCaptain.id === member.id);
                
                return `
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" 
                                   style="margin-right: 8px;" 
                                   data-member-id="${member.id}" 
                                   ${isCaptain ? 'checked' : ''}>
                            <span>${member.name}${member.jerseyNumber ? ` (#${member.jerseyNumber})` : ''}</span>
                        </label>
                    </div>
                `;
            }).join('');
        
        const modal = this.createModal('Manage Team Captains', `
            <div style="margin-bottom: 15px;">
                <p style="color: #666; font-size: 0.9em; margin: 0;">
                    Select multiple captains/co-captains for <strong>${team.name}</strong>. 
                    This allows for delegation when primary captains are not present.
                </p>
            </div>
            
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                ${memberCheckboxes}
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveCaptains('${teamId}')">Save Captains</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveCaptains(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        // Get all checked members
        const checkboxes = document.querySelectorAll('[data-member-id]');
        const selectedCaptainIds = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.getAttribute('data-member-id'));
        
        try {
            // Get current captains to determine what needs to be added/removed
            const currentCaptains = team.captains || [];
            const currentCaptainIds = currentCaptains.map(c => c.memberId);
            
            // Find captains to add and remove
            const toAdd = selectedCaptainIds.filter(id => !currentCaptainIds.includes(id));
            const toRemove = currentCaptainIds.filter(id => !selectedCaptainIds.includes(id));
            
            // Add new captains
            for (const memberId of toAdd) {
                await this.fetch('/api/captains', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        team_id: teamId,
                        member_id: memberId
                    })
                });
            }
            
            // Remove old captains
            for (const memberId of toRemove) {
                await this.fetch(`/api/captains?team_id=${teamId}&member_id=${memberId}`, {
                    method: 'DELETE'
                });
            }
            
            // Update local team data
            team.captains = selectedCaptainIds.map(memberId => {
                const member = team.members.find(m => m.id === memberId);
                return {
                    memberId: memberId,
                    memberName: member ? member.name : 'Unknown'
                };
            });
            
            // Clear legacy captain if all captains are now managed through new system
            if (selectedCaptainIds.length > 0) {
                team.captainId = null;
            }
            
            this.renderTeams();
            this.closeModal();
            
        } catch (error) {
            console.error('Error saving captains:', error);
            alert('Failed to save captains. Please try again.');
        }
    }
    
    // Member Management
    showAddMemberModal(teamId) {
        this.currentEditingMember = null;
        this.showMemberModal(teamId);
    }
    
    async editMember(teamId, memberId) {
        return this.executeWithLoading(async () => {
            const team = this.teams.find(t => t.id === teamId);
            this.currentEditingMember = team.members.find(m => m.id === memberId);
            this.showDetailedMemberModal(teamId, this.currentEditingMember);
        }, {
            message: 'Loading player details...',
            showModal: true
        });
    }
    
    showMemberModal(teamId, member = null) {
        const isEdit = member !== null;
        const isMobile = this.isMobileDevice();
        const photoLabel = isMobile ? 'Take Photo' : 'Photo';
        
        const modal = this.createModal(isEdit ? 'Edit Member' : 'Add Member', `
            <div class="form-group">
                <label class="form-label">Member Name *</label>
                <input type="text" class="form-input" id="member-name" value="${member ? member.name : ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Jersey Number</label>
                <input type="number" class="form-input" id="member-jersey" value="${member ? member.jerseyNumber || '' : ''}" min="1" max="99">
            </div>
            <div class="form-group">
                <label class="form-label">Gender</label>
                <select class="form-select" id="member-gender">
                    <option value="">Select gender</option>
                    <option value="male" ${member && member.gender === 'male' ? 'selected' : ''}>Male</option>
                    <option value="female" ${member && member.gender === 'female' ? 'selected' : ''}>Female</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">${photoLabel}</label>
                <input type="file" class="form-input file-input" id="member-photo" accept="image/*" ${isMobile ? 'capture="environment"' : ''}>
                ${member && member.photo ? `<img src="${member.photo}" alt="Current photo" class="preview-image">` : ''}
                ${isMobile ? '<small style="color: #666; font-size: 0.85em; display: block; margin-top: 5px;">📸 This will open your camera</small>' : ''}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.handleActionClick(event, app.saveMemberWithLoading.bind(app), '${teamId}')">${isEdit ? 'Update' : 'Add'} Member</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveMember(teamId) {
        const name = document.getElementById('member-name').value.trim();
        const jerseyNumber = document.getElementById('member-jersey').value;
        const gender = document.getElementById('member-gender').value;
        const photoFile = document.getElementById('member-photo').files[0];
        
        if (!name) {
            alert('Please enter a member name');
            return;
        }
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        try {
            if (this.currentEditingMember) {
                // ✅ OPTIMIZED: Edit existing member using granular API
                const originalName = this.currentEditingMember.name;
                const originalJerseyNumber = this.currentEditingMember.jerseyNumber;
                const originalGender = this.currentEditingMember.gender;
                
                // Update local data first (database update happens later with disciplinary records)
                this.currentEditingMember.name = name;
                this.currentEditingMember.jerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
                this.currentEditingMember.gender = gender || null;
                
                // Handle photo upload first if provided
                if (photoFile) {
                    console.log('Uploading photo for existing member:', this.currentEditingMember.id);
                    const photoUrl = await this.uploadPhoto(photoFile, this.currentEditingMember.id);
                    this.currentEditingMember.photo = photoUrl;
                    
                    // Also update in teams array
                    const memberInArray = team.members.find(m => m.id === this.currentEditingMember.id);
                    if (memberInArray) {
                        memberInArray.photo = photoUrl;
                    }
                    
                    console.log('Photo uploaded successfully');
                }
                
                // Member profile will be updated later in the function with disciplinary records
                
            } else {
                // 🔍 NEW: Check for inactive players with the same name before creating new member
                console.log('🔍 Checking for inactive players with name:', name);
                
                try {
                    const searchResult = await this.searchInactiveMembers(name);
                    if (searchResult.success && searchResult.inactive_members && searchResult.inactive_members.length > 0) {
                        // Found inactive player(s) with the same name
                        console.log('📋 Found inactive players:', searchResult.inactive_members);
                        
                        // Show reactivation modal
                        this.showReactivationModal(searchResult.inactive_members, teamId, {
                            name: name,
                            jerseyNumber: jerseyNumber,
                            gender: gender,
                            photoFile: photoFile
                        });
                        return; // Exit early - reactivation modal will handle the rest
                    }
                } catch (error) {
                    console.warn('Error checking for inactive members:', error);
                    // Continue with normal member creation if search fails
                }
                
                // ✅ OPTIMIZED: Add new member using granular API
                const newMember = {
                    id: this.generateUUID(),
                    name: name,
                    jerseyNumber: jerseyNumber ? parseInt(jerseyNumber) : null,
                    gender: gender || null,
                    photo: null
                };
                
                // Add to local array first
                team.members.push(newMember);
                
                console.log('🚀 Using granular API for new member creation');
                
                try {
                    await this.createMemberProfile(teamId, newMember);
                    console.log('✅ Member created in database:', newMember.id);
                } catch (error) {
                    console.error('❌ Failed to create member in database:', error);
                    throw new Error('Failed to create member: ' + error.message);
                }
                
                // Upload photo if provided
                if (photoFile) {
                    console.log('Uploading photo for new member:', newMember.id);
                    try {
                        const photoUrl = await this.uploadPhoto(photoFile, newMember.id);
                        newMember.photo = photoUrl;
                        console.log('✅ Photo uploaded successfully:', photoUrl);
                    } catch (error) {
                        console.error('❌ Photo upload failed:', error);
                        // Don't fail the entire member creation if photo upload fails
                        console.warn('⚠️ Continuing without photo due to upload error');
                    }
                }
            }
            
            // 🚀 PERFORMANCE: No more 102KB saveTeams calls!
            console.log('✅ Member saved using optimized granular APIs');
            
            // 🚀 PHOTO FIX: Don't refresh from server immediately after photo upload
            // The local data already has the correct photo URL, server refresh can cause timing issues
            if (!photoFile) {
                // Only refresh from server if no photo was uploaded
                await this.loadTeams(); // Refresh from server
            } else {
                console.log('📸 Skipping server refresh to preserve uploaded photo data');
            }
            this.renderTeams();
            
            // 🖼️ PHOTO FIX: Trigger lazy loading for newly added member's photo
            if (photoFile && !this.currentEditingMember) {
                // For new members with photos, ensure the photo loads if this team is currently selected
                const selectedTeamId = document.getElementById('teams-team-selector')?.value;
                if (selectedTeamId === teamId) {
                    console.log('📸 Triggering photo loading for newly added member with photo');
                    // 🖼️ Photos now use direct URLs (no lazy loading needed)
                    console.log('🖼️ New member photo uses direct URL');
                }
            }
            
            // Handle modal state
            if (!this.currentEditingMember) {
                // Keep modal open for adding more members
                document.getElementById('member-name').value = '';
                document.getElementById('member-jersey').value = '';
                document.getElementById('member-gender').value = '';
                document.getElementById('member-photo').value = '';
            } else {
                this.closeModal();
            }
            
        } catch (error) {
            console.error('Error saving member:', error);
            alert('Failed to save member: ' + error.message);
            
            // Revert local changes on error
            if (!this.currentEditingMember) {
                // Remove the member we just added
                const index = team.members.findIndex(m => m.name === name);
                if (index !== -1) {
                    team.members.splice(index, 1);
                }
            }
        }
    }
    
    async deleteMember(teamId, memberId) {
        console.log('🗑️ deleteMember called with:', { teamId, memberId });
        console.log('📍 This will now DEACTIVATE the member instead of permanent deletion');
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) {
            console.error('Team not found:', teamId);
            return;
        }
        
        const memberToDeactivate = team.members.find(m => m.id === memberId);
        console.log('🎯 Found member to deactivate:', memberToDeactivate);
        
        if (!confirm(`Are you sure you want to remove "${memberToDeactivate?.name || 'this player'}" from the team?\n\nNote: This will hide them from the roster but preserve their history. They can be reactivated later if they return.`)) {
            return;
        }
        
        try {
            // ✅ OPTIMIZED: Use granular API for deactivation (soft delete)
            console.log('🚀 Using granular API for member deactivation');
            await this.deactivateMemberProfile(teamId, memberId);
            
            // Update local data - remove from current team display
            const originalLength = team.members.length;
            team.members = team.members.filter(m => m.id !== memberId);
            console.log(`✅ Member removed from local display: ${originalLength} → ${team.members.length}`);
            
            // Refresh UI
            this.renderTeams();
            console.log('✅ UI refreshed after deactivation');
            
        } catch (error) {
            console.error('❌ Error deactivating member:', error);
            alert('Failed to remove member: ' + error.message);
        }
    }
    
    // 🚀 NEW: Granular API methods for better performance
    async updateMemberProfile(teamId, memberId, memberData) {
        const data = await this.fetch('/api/teams/member-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teamId: teamId,
                memberId: memberId,
                name: memberData.name,
                jerseyNumber: memberData.jerseyNumber,
                gender: memberData.gender
            })
        });
        
        return data;
    }
    
    async createMemberProfile(teamId, memberData) {
        const data = await this.fetch('/api/teams/member-create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teamId: teamId,
                member: memberData
            })
        });
        
        return data;
    }
    
    async deleteMemberProfile(teamId, memberId) {
        const data = await this.fetch('/api/teams/member-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teamId: teamId,
                memberId: memberId
            })
        });
        
        return data;
    }
    
    async deactivateMemberProfile(teamId, memberId) {
        const data = await this.fetch('/api/teams/member-deactivate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                teamId: teamId,
                memberId: memberId
            })
        });
        
        return data;
    }
    
    async searchInactiveMembers(name) {
        const data = await this.fetch(`/api/teams/member-search-inactive?name=${encodeURIComponent(name)}`);
        return data;
    }
    
    async reactivateMemberProfile(memberId, newTeamId, newJerseyNumber) {
        const data = await this.fetch('/api/teams/member-reactivate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                memberId: memberId,
                newTeamId: newTeamId,
                newJerseyNumber: newJerseyNumber
            })
        });
        
        return data;
    }
    
    // 🔄 NEW: Show reactivation modal when inactive player with same name is found
    showReactivationModal(inactiveMembers, targetTeamId, newMemberData) {
        // Find the target team for display
        const targetTeam = this.teams.find(t => t.id === targetTeamId);
        
        // For now, just handle the first match (most common case)
        const inactiveMember = inactiveMembers[0];
        
        // Format disciplinary records for display
        let disciplinaryHtml = '';
        if (inactiveMember.disciplinary_records && inactiveMember.disciplinary_records.length > 0) {
            disciplinaryHtml = `
                <div style="margin-top: 15px; padding: 15px; background: #fff8e1; border-radius: 8px; border-left: 4px solid #ff9800;">
                    <h4 style="margin: 0 0 10px 0; color: #e65100;">⚠️ Disciplinary History</h4>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${inactiveMember.disciplinary_records.map(record => `
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ffcc80;">
                                <div>
                                    <span style="background: ${record.card_type === 'red' ? '#ffcdd2' : '#fff3e0'}; color: ${record.card_type === 'red' ? '#c62828' : '#ef6c00'}; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">
                                        ${record.card_type.toUpperCase()} CARD
                                    </span>
                                    ${record.reason ? `<span style="margin-left: 10px; color: #666;">${record.reason}</span>` : ''}
                                    ${record.suspension_matches ? `<span style="margin-left: 10px; color: #d32f2f; font-weight: bold;">${record.suspension_matches} match suspension</span>` : ''}
                                </div>
                                <div style="color: #666; font-size: 0.85em;">
                                    ${record.incident_date || epochToPacificDate(record.created_at_epoch || record.created_at)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            disciplinaryHtml = `
                <div style="margin-top: 15px; padding: 15px; background: #e8f5e8; border-radius: 8px; border-left: 4px solid #4caf50;">
                    <span style="color: #2e7d32;">✅ No disciplinary records found</span>
                </div>
            `;
        }
        
        // Get the photo URL for the inactive player
        const photoUrl = this.getMemberPhotoUrl(inactiveMember);
        
        const modal = this.createModal('Player Found', `
            <div style="margin-bottom: 20px;">
                <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 15px;">
                    <h3 style="margin: 0 0 15px 0; color: #1565c0;">🔍 Inactive Player Found</h3>
                    
                    <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 15px;">
                        <div style="flex-shrink: 0;">
                            <img src="${photoUrl}" alt="${inactiveMember.name}" 
                                 style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #2196f3;">
                        </div>
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 5px 0; color: #1565c0;">${inactiveMember.name}</h4>
                            <p style="margin: 0 0 5px 0; color: #666; font-size: 0.9em;">
                                Last played for: <strong>${inactiveMember.team_name}</strong>
                            </p>
                            <p style="margin: 0; color: #666; font-size: 0.9em;">
                                Category: <strong>${inactiveMember.team_category}</strong>
                            </p>
                            ${inactiveMember.jersey_number ? `<p style="margin: 5px 0 0 0; color: #666; font-size: 0.9em;">Previous Jersey: <strong>#${inactiveMember.jersey_number}</strong></p>` : ''}
                        </div>
                    </div>
                    
                    <p style="margin: 0; color: #1976d2; font-weight: 500;">
                        Is this the same person you want to add to <strong>${targetTeam?.name || 'this team'}</strong>?
                    </p>
                </div>
                
                ${disciplinaryHtml}
                
                <div style="margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0;">Jersey Number for ${targetTeam?.name || 'this team'}:</h4>
                    <input type="number" id="reactivation-jersey" class="form-input" 
                           value="${newMemberData.jerseyNumber || ''}" 
                           placeholder="Jersey number (optional)" min="1" max="99" style="width: 150px;">
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeReactivationModal('${targetTeamId}', ${JSON.stringify(newMemberData).replace(/"/g, '&quot;')})">
                    No, Create New Player
                </button>
                <button class="btn" onclick="app.reactivatePlayer('${inactiveMember.id}', '${targetTeamId}')">
                    Yes, Reactivate This Player
                </button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    // Handle reactivation modal close - proceed with new member creation
    closeReactivationModal(targetTeamId, newMemberData) {
        this.closeModal();
        
        // Proceed with creating a new member using the original data
        const team = this.teams.find(t => t.id === targetTeamId);
        if (!team) return;
        
        // Create the new member as originally intended
        this.createNewMemberDirectly(targetTeamId, newMemberData);
    }
    
    // Handle player reactivation
    async reactivatePlayer(memberId, targetTeamId) {
        const jerseyNumber = document.getElementById('reactivation-jersey').value;
        
        try {
            // Reactivate the player and move to new team
            await this.reactivateMemberProfile(memberId, targetTeamId, jerseyNumber ? parseInt(jerseyNumber) : null);
            
            // Refresh teams to show the reactivated player
            await this.loadTeams();
            this.renderTeams();
            
            this.closeModal();
            
            // Show success message
            alert('Player reactivated successfully! They are now active on the selected team.');
            
        } catch (error) {
            console.error('Error reactivating player:', error);
            alert('Failed to reactivate player: ' + error.message);
        }
    }
    
    // Create new member directly (used when user chooses not to reactivate)
    async createNewMemberDirectly(teamId, memberData) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        try {
            const newMember = {
                id: this.generateUUID(),
                name: memberData.name,
                jerseyNumber: memberData.jerseyNumber ? parseInt(memberData.jerseyNumber) : null,
                gender: memberData.gender || null,
                photo: null
            };
            
            // Add to local array first
            team.members.push(newMember);
            
            console.log('🚀 Creating new member directly (user chose not to reactivate)');
            await this.createMemberProfile(teamId, newMember);
            
            // Upload photo if provided
            if (memberData.photoFile) {
                console.log('Uploading photo for new member:', newMember.id);
                const photoUrl = await this.uploadPhoto(memberData.photoFile, newMember.id);
                newMember.photo = photoUrl;
            }
            
            this.renderTeams();
            
            // Show success message
            alert('New player created successfully!');
            
        } catch (error) {
            console.error('Error creating new member:', error);
            alert('Failed to create new player: ' + error.message);
            
            // Remove from local array on error
            const index = team.members.findIndex(m => m.name === memberData.name);
            if (index !== -1) {
                team.members.splice(index, 1);
            }
        }
    }
    
    async showDetailedMemberModal(teamId, member) {
        const isMobile = this.isMobileDevice();
        const photoLabel = isMobile ? 'Take Photo' : 'Photo';
        
        // Load disciplinary records for this member
        let disciplinaryRecords = [];
        try {
            const rawRecords = await this.fetch(`/api/disciplinary-records?member_id=${member.id}`);
            
            // Process the records to ensure proper date formatting
            disciplinaryRecords = rawRecords.map(record => {
                // Use same logic as fetchDisciplinaryRecords to get the date
                let eventDate = record.incidentDate_epoch || 
                              record.incidentDate || 
                              record.created_at_epoch || 
                              record.createdAt;
                
                // Convert epoch timestamps to YYYY-MM-DD format for date input
                let formattedDate = '';
                if (eventDate) {
                    if (typeof eventDate === 'number') {
                        // Convert epoch to YYYY-MM-DD format
                        formattedDate = new Date(eventDate * 1000).toISOString().split('T')[0];
                    } else if (typeof eventDate === 'string' && eventDate.includes('-')) {
                        // Already in date format, use as-is
                        formattedDate = eventDate.split('T')[0]; // Remove time part if present
                    }
                }
                
                return {
                    ...record,
                    incidentDate: formattedDate // Override with formatted date for the input field
                };
            });
        } catch (error) {
            console.error('Error loading disciplinary records:', error);
            disciplinaryRecords = [];
        }
        
        const modal = this.createModal(`Edit Player: ${member.name}`, `
            <div class="form-group">
                <label class="form-label">Player Name *</label>
                <input type="text" class="form-input" id="detailed-member-name" value="${member.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Jersey Number</label>
                <input type="number" class="form-input" id="detailed-member-jersey" value="${member.jerseyNumber || ''}" min="1" max="99">
            </div>
            <div class="form-group">
                <label class="form-label">Gender</label>
                <select class="form-select" id="detailed-member-gender">
                    <option value="">Select gender</option>
                    <option value="male" ${member.gender === 'male' ? 'selected' : ''}>Male</option>
                    <option value="female" ${member.gender === 'female' ? 'selected' : ''}>Female</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">${photoLabel}</label>
                <input type="file" class="form-input file-input" id="detailed-member-photo" accept="image/*" ${isMobile ? 'capture="environment"' : ''}>
                ${member.photo ? `<img src="${this.getMemberPhotoUrl(member)}" data-member-id="${member.id}" alt="Current photo" class="preview-image">` : ''}
                ${isMobile ? '<small style="color: #666; font-size: 0.85em; display: block; margin-top: 5px;">📸 This will open your camera</small>' : ''}
            </div>
            
            <div class="form-group">
                <label class="form-label">Lifetime Cards</label>
                <small style="color: #666; display: block; margin-bottom: 10px;">Add cards received outside of this system (previous seasons, other competitions, etc.)</small>
                <div id="disciplinary-records-container">
                    ${disciplinaryRecords.map((record, index) => `
                        <div class="disciplinary-record-item" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${record.cardType === 'yellow' ? '#ffc107' : '#dc3545'};">
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <select class="form-select" style="width: 120px;" data-record-index="${index}" data-field="cardType">
                                    <option value="yellow" ${record.cardType === 'yellow' ? 'selected' : ''}>🟨 Yellow</option>
                                    <option value="red" ${record.cardType === 'red' ? 'selected' : ''}>🟥 Red</option>
                                </select>
                                <input type="date" class="form-input" style="flex: 1;" placeholder="Date" data-record-index="${index}" data-field="incidentDate" value="${record.incidentDate || ''}">
                                <button class="btn btn-small btn-danger" onclick="app.removeDisciplinaryRecord(${index})">🗑️</button>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <select class="form-select" style="flex: 1;" data-record-index="${index}" data-field="reason">
                                    <option value="">Select Reason</option>
                                    ${generateCardReasonsOptions(record.reason)}
                                </select>
                            </div>
                            <textarea class="form-input" placeholder="Additional Notes (optional)" data-record-index="${index}" data-field="notes" rows="2">${record.notes || ''}</textarea>
                        </div>
                    `).join('')}
                    ${disciplinaryRecords.length === 0 ? '<p style="text-align: center; color: #666; font-style: italic; margin: 20px 0;">No lifetime cards</p>' : ''}
                </div>
                <button class="btn btn-secondary" onclick="app.addDisciplinaryRecord()" style="margin-top: 10px;">+ Add Lifetime Card</button>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveDetailedMember('${teamId}', '${member.id}')">Update Player</button>
            </div>
        `);
        
        document.body.appendChild(modal);
        
        // 🖼️ Photos now use direct URLs (no lazy loading needed)
        console.log('🖼️ Edit modal photo uses direct URL');
    }
    
    addDisciplinaryRecord() {
        const container = document.getElementById('disciplinary-records-container');
        const existingRecords = container.querySelectorAll('.disciplinary-record-item');
        const newIndex = existingRecords.length;
        
        // Remove "no records" message if it exists
        const noRecordsMsg = container.querySelector('p');
        if (noRecordsMsg) noRecordsMsg.remove();
        
        const recordHtml = `
            <div class="disciplinary-record-item" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #ffc107;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select class="form-select" style="width: 120px;" data-record-index="${newIndex}" data-field="cardType">
                        <option value="yellow">🟨 Yellow</option>
                        <option value="red">🟥 Red</option>
                    </select>
                    <input type="date" class="form-input" style="flex: 1;" placeholder="Date" data-record-index="${newIndex}" data-field="incidentDate">
                    <button class="btn btn-small btn-danger" onclick="app.removeDisciplinaryRecord(${newIndex})">🗑️</button>
                </div>
                <div style="display: flex; gap: 10px;">
                    <select class="form-select" style="flex: 1;" data-record-index="${newIndex}" data-field="reason">
                        <option value="">Select Reason</option>
                        ${generateCardReasonsOptions()}
                    </select>
                </div>
                <textarea class="form-input" placeholder="Additional Notes (optional)" data-record-index="${newIndex}" data-field="notes" rows="2"></textarea>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', recordHtml);
        
        // Update border color based on card type
        const newRecord = container.lastElementChild;
        const cardTypeSelect = newRecord.querySelector('[data-field="cardType"]');
        
        cardTypeSelect.addEventListener('change', function() {
            const borderColor = this.value === 'yellow' ? '#ffc107' : '#dc3545';
            newRecord.style.borderLeftColor = borderColor;
        });
    }
    
    removeDisciplinaryRecord(index) {
        const recordItems = document.querySelectorAll('.disciplinary-record-item');
        if (recordItems[index]) {
            recordItems[index].remove();
            
            // Re-index remaining records
            const remainingRecords = document.querySelectorAll('.disciplinary-record-item');
            remainingRecords.forEach((record, newIndex) => {
                record.querySelectorAll('[data-record-index]').forEach(element => {
                    element.setAttribute('data-record-index', newIndex);
                });
                const deleteBtn = record.querySelector('.btn-danger');
                if (deleteBtn) {
                    deleteBtn.setAttribute('onclick', `app.removeDisciplinaryRecord(${newIndex})`);
                }
            });
            
            // Add "no records" message if no records remain
            if (remainingRecords.length === 0) {
                document.getElementById('disciplinary-records-container').innerHTML = '<p style="text-align: center; color: #666; font-style: italic; margin: 20px 0;">No lifetime cards</p>';
            }
        }
    }
    
    async saveDetailedMember(teamId, memberId) {
        const name = document.getElementById('detailed-member-name').value.trim();
        const jerseyNumber = document.getElementById('detailed-member-jersey').value;
        const gender = document.getElementById('detailed-member-gender').value;
        const photoFile = document.getElementById('detailed-member-photo').files[0];
        
        if (!name) {
            alert('Please enter a player name');
            return;
        }
        
        const team = this.teams.find(t => t.id === teamId);
        const member = team.members.find(m => m.id === memberId);
        if (!team || !member) return;
        
        // Capture original values BEFORE updating member object
        const originalName = member.name;
        const originalJerseyNumber = member.jerseyNumber;
        const originalGender = member.gender;
        
        let photo = member.photo;
        if (photoFile) {
            try {
                console.log('saveDetailedMember: Uploading photo for member:', memberId);
                // Upload the new photo
                const photoUrl = await this.uploadPhoto(photoFile, memberId);
                photo = photoUrl;
                console.log('saveDetailedMember: Photo uploaded successfully:', photoUrl);
            } catch (error) {
                console.error('Error uploading photo:', error);
                alert('Photo upload failed: ' + error.message);
            }
        }
        
        // Photo update is handled immediately above (uploaded to server and member.photo updated)
        // Basic member info (name, jersey, gender) will be updated after database save
        if (photo) {
            member.photo = photo;
            console.log('saveDetailedMember: Updated member photo to:', photo);
            console.log('saveDetailedMember: Member object after update:', member);
            
            // Double-check: also update in teams array (member should already be the reference, but be safe)
            const teamRef = this.teams.find(t => t.id === teamId);
            const memberRef = teamRef.members.find(m => m.id === memberId);
            if (memberRef && memberRef !== member) {
                memberRef.photo = photo;
                console.log('saveDetailedMember: Also updated photo in teams array reference');
            }
            
            // Force immediate UI refresh to show new photo
            console.log('saveDetailedMember: Forcing UI refresh...');
            this.renderTeams();
            console.log('saveDetailedMember: UI refreshed');
        }
        
        // Collect disciplinary records
        const recordItems = document.querySelectorAll('.disciplinary-record-item');
        const disciplinaryRecords = [];
        recordItems.forEach((item) => {
            const cardType = item.querySelector('[data-field="cardType"]').value;
            const incidentDate = item.querySelector('[data-field="incidentDate"]').value;
            const reason = item.querySelector('[data-field="reason"]').value;
            const notes = item.querySelector('[data-field="notes"]').value;
            
            // No longer collecting suspension data - this will be managed by advisory board
            
            if (cardType) {
                disciplinaryRecords.push({
                    cardType: cardType,
                    incidentDate: incidentDate || null,
                    reason: reason || null,
                    notes: notes || null
                });
            }
        });
        
        console.log('Disciplinary records to save:', disciplinaryRecords);
        
        try {
            // Check if basic member info actually changed
            const basicInfoChanged = (
                originalName !== name ||
                (originalJerseyNumber || null) !== (jerseyNumber ? parseInt(jerseyNumber) : null) ||
                (originalGender || null) !== (gender || null)
            );
            
            // Save basic member info if changed (using granular API for better performance)
            if (basicInfoChanged) {
                console.log('💾 saveDetailedMember: Basic member info changed, using granular API');
                console.log('Changes:', {
                    name: originalName + ' → ' + name,
                    jersey: originalJerseyNumber + ' → ' + (jerseyNumber || 'null'),
                    gender: originalGender + ' → ' + (gender || 'null')
                });
                
                await this.updateMemberProfile(teamId, memberId, {
                    name: name,
                    jerseyNumber: jerseyNumber ? parseInt(jerseyNumber) : null,
                    gender: gender || null
                });
                
                // Update local member object after successful database update
                member.name = name;
                member.jerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
                member.gender = gender || null;
                
                console.log('✅ Member profile saved and local object updated');
            } else {
                console.log('✅ saveDetailedMember: No basic info changes, skipping member profile update');
            }
            
            // Save disciplinary records (this should be fast)
            console.log('💾 Saving disciplinary records...');
            const disciplinaryResponse = await fetch('/api/disciplinary-records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    member_id: memberId,
                    records: disciplinaryRecords
                })
            });
            
            if (!disciplinaryResponse.ok) {
                const errorText = await disciplinaryResponse.text();
                console.error('Failed to save disciplinary records:', disciplinaryResponse.status, errorText);
                
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(`Disciplinary records save failed: ${errorJson.error || 'Unknown error'}`);
                } catch {
                    throw new Error(`Disciplinary records save failed: HTTP ${disciplinaryResponse.status} - ${errorText}`);
                }
            }
            
            const disciplinaryResult = await disciplinaryResponse.json();
            console.log('✅ Disciplinary records saved successfully:', disciplinaryResult);
            
            // 🚀 PHOTO FIX: Don't refresh from server immediately after photo upload
            // The local data already has the correct photo URL, server refresh can cause timing issues
            if (photoFile) {
                console.log('📸 Skipping server refresh to preserve uploaded photo data in detailed member view');
            }
            
            this.renderTeams();
            
            // 🖼️ PHOTO FIX: Trigger lazy loading for edited member's photo
            if (photoFile) {
                // For edited members with new photos, ensure the photo loads if this team is currently selected
                const selectedTeamId = document.getElementById('teams-team-selector')?.value;
                // 🖼️ Photos now use direct URLs (no lazy loading needed)
                console.log('🖼️ Updated member photo uses direct URL');
            }
            
            this.closeModal();
        } catch (error) {
            console.error('Error in saveDetailedMember:', error);
            alert('Failed to save player information. Please try again.');
        }
    }
    
    // 🔄 LOADING-WRAPPED USER ACTIONS: Common user actions with loading feedback
    
    // Wrapper for view player profile with loading
    async viewPlayerProfileWithLoading(teamId, memberId, button = null) {
        return this.handleModalAction(
            () => this.viewPlayerProfile(teamId, memberId),
            'Loading player profile and match history...'
        );
    }
    
    // Wrapper for edit member with loading  
    async editMemberWithLoading(teamId, memberId, button = null) {
        return this.handleModalAction(
            () => this.editMember(teamId, memberId),
            'Loading player information...'
        );
    }
    
    // Wrapper for delete actions with loading
    async deleteTeamWithLoading(teamId, button = null) {
        if (!confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
            return;
        }
        
        return this.executeWithLoading(
            () => this.deleteTeam(teamId),
            {
                message: 'Deleting team...',
                button: button,
                showModal: !button // Show modal if no button provided
            }
        );
    }
    
    async deleteMemberWithLoading(teamId, memberId, button = null) {
        if (!confirm('Are you sure you want to delete this member? This action cannot be undone.')) {
            return;
        }
        
        return this.executeWithLoading(
            () => this.deleteMember(teamId, memberId),
            {
                message: 'Deleting member...',
                button: button,
                showModal: !button
            }
        );
    }
    
    async deleteEventWithLoading(eventId, button = null) {
        if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
            return;
        }
        
        return this.executeWithLoading(
            () => this.deleteEvent(eventId),
            {
                message: 'Deleting event...',
                button: button,
                showModal: !button
            }
        );
    }
    
    // Wrapper for form save actions with loading
    async saveTeamWithLoading(button = null) {
        return this.executeWithLoading(
            () => this.saveTeam(),
            {
                message: 'Saving team...',
                button: button,
                showModal: !button
            }
        );
    }
    
    async saveMemberWithLoading(teamId, button = null) {
        return this.executeWithLoading(
            () => this.saveMember(teamId),
            {
                message: 'Saving member...',
                button: button,
                showModal: !button
            }
        );
    }
    
    async saveEventWithLoading(button = null) {
        return this.executeWithLoading(
            () => this.saveEvent(),
            {
                message: 'Saving event...',
                button: button,  
                showModal: !button
            }
        );
    }
    
    // Wrapper for view match with loading
    async viewMatchWithLoading(eventId, matchId, button = null) {
        return this.handleModalAction(
            () => this.viewMatch(eventId, matchId),
            'Loading match details and player rosters...'
        );
    }
    
    // Wrapper for edit match result with loading
    async editMatchResultWithLoading(eventId, matchId, button = null) {
        return this.handleModalAction(
            () => this.editMatchResult(eventId, matchId),
            'Loading match information...'
        );
    }
    
    // Generic onclick handler that extracts button reference
    handleActionClick(event, action, ...args) {
        event.preventDefault();
        const button = event.target.closest('button');
        return action(...args, button);
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
                        eventDate: new Date(event.date_epoch * 1000).toLocaleDateString('en-US', { 
                            timeZone: 'America/Los_Angeles', 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit' 
                        }),
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
        
        // Start building UI with match cards while waiting for disciplinary records
        const baseModalContent = this.buildPlayerProfileBase(team, member, matchCards);
        
        // Wait for disciplinary records
        const disciplinaryRecords = await disciplinaryPromise;
        
        // Combine and display final results
        this.displayPlayerProfile(team, member, matchCards, disciplinaryRecords);
    }
    
    // Optimized helper method for fetching disciplinary records
    async fetchDisciplinaryRecords(memberId) {
        try {
            const records = await this.fetch(`/api/disciplinary-records?member_id=${memberId}`);
            
            return records.map(record => {
                // Try multiple date fields in order of preference
                let eventDate = record.incidentDate_epoch || 
                              record.incidentDate || 
                              record.created_at_epoch || 
                              record.createdAt;
                
                return {
                    type: 'prior',
                    eventDate: eventDate,
                    matchInfo: 'External incident',
                    cardType: record.cardType,
                    reason: record.reason,
                    notes: record.notes,
                    minute: null,
                    suspensionMatches: record.suspensionMatches,
                    suspensionServed: record.suspensionServed,
                    suspensionServedDate: record.suspensionServedDate
                };
            });
        } catch (error) {
            console.error('Error loading disciplinary records for profile:', error);
            return [];
        }
    }
    
    // Optimized helper method for building profile base content
    buildPlayerProfileBase(team, member, matchCards) {
        return `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 12px; text-align: center;">
                <div style="margin-bottom: 12px;">
                    ${this.getLazyImageHtml(member, 'profile-photo', 'width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 3px solid #2196F3;')}
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
        
        // Handle different date formats properly
        let displayDate = 'No date';
        if (card.eventDate) {
            if (card.type === 'match') {
                // Match cards already have formatted date like "09/14/2025"
                displayDate = card.eventDate;
            } else {
                // Disciplinary records might have epoch timestamps or date strings
                if (typeof card.eventDate === 'number') {
                    // It's an epoch timestamp
                    displayDate = epochToPacificDate(card.eventDate);
                } else if (typeof card.eventDate === 'string' && card.eventDate.includes('-')) {
                    // It's likely an ISO date string, convert it
                    const date = new Date(card.eventDate);
                    if (!isNaN(date.getTime())) {
                        displayDate = date.toLocaleDateString('en-US', { 
                            timeZone: 'America/Los_Angeles', 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit' 
                        });
                    }
                } else {
                    // Use as-is if it's already a formatted string
                    displayDate = card.eventDate;
                }
            }
        }
        
        return `
            <div style="padding: 12px; border-bottom: 1px solid #f8f9fa; background: white;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="font-size: 1.1em;">${cardIcon}</span>
                    <div style="flex: 1;">
                        <strong style="color: ${cardColor}; text-transform: capitalize; font-size: 0.9em;">${card.cardType} Card</strong>
                        ${card.minute ? `<span style="color: #666; font-size: 0.8em;"> - ${card.minute}'</span>` : ''}
                        <span style="margin-left: 8px; background: ${card.type === 'match' ? '#e3f2fd' : '#fff3e0'}; color: #666; padding: 1px 4px; border-radius: 3px; font-size: 0.7em;">${typeIcon} ${typeLabel}</span>
                    </div>
                    <small style="color: #666; font-size: 0.75em;">${displayDate}</small>
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
        
        // Pre-render card items for better performance
        const cardItemsHtml = totalCards > 0 ? allCards.map(card => this.renderCardItem(card)).join('') : '';
        
        const modal = this.createModal(`Player Profile: ${member.name}`, `
            ${this.buildPlayerProfileBase(team, member, matchCards)}
            
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
        
        // 🖼️ Photos now use direct URLs (no lazy loading needed)
        console.log('🖼️ Player profile photo uses direct URL');
    }
    
    // Event Management
    showAddEventModal() {
        this.currentEditingEvent = null;
        this.showEventModal();
    }
    
    editEvent(eventId) {
        this.currentEditingEvent = this.events.find(e => e.id === eventId);
        this.showEventModal(this.currentEditingEvent);
    }
    
    showEventModal(event = null) {
        const isEdit = event !== null;
        const modal = this.createModal(isEdit ? 'Edit Event' : 'Add Event', `
            <div class="form-group">
                <label class="form-label">Event Name *</label>
                <input type="text" class="form-input" id="event-name" value="${event ? event.name : ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Date *</label>
                <input type="date" class="form-input" id="event-date" value="${event ? new Date(event.date_epoch * 1000).toISOString().split('T')[0] : ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea class="form-input" id="event-description" rows="3">${event ? event.description || '' : ''}</textarea>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveEvent()">${isEdit ? 'Update' : 'Create'} Event</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveEvent() {
        const name = document.getElementById('event-name').value.trim();
        const date = document.getElementById('event-date').value;
        const description = document.getElementById('event-description').value.trim();
        
        if (!name || !date) {
            alert('Please enter both event name and date');
            return;
        }
        
        if (this.currentEditingEvent) {
            // Update existing event
            this.currentEditingEvent.name = name;
            this.currentEditingEvent.date_epoch = this.dateStringToEpoch(date);
            this.currentEditingEvent.description = description;
            
            try {
                // Use efficient single-event update
                await this.updateSingleEvent(this.currentEditingEvent.id, {
                    name: name,
                    date_epoch: this.dateStringToEpoch(date),
                    description: description
                });
                await this.loadEvents(); // Reload events to get fresh data
                this.renderEvents();
                this.closeModal();
            } catch (error) {
                alert('Failed to update event. Please try again.');
            }
        } else {
            // Add new event
            const newEvent = {
                id: this.generateUUID(),
                name: name,
                date_epoch: this.dateStringToEpoch(date), // Use epoch timestamp
                description: description,
                matches: [],
                attendees: []
            };
            
            try {
                // Use efficient single-event creation
                await this.createSingleEvent(newEvent);
                await this.loadEvents(); // Reload events to get fresh data
                this.renderEvents();
                this.closeModal();
            } catch (error) {
                alert('Failed to create event. Please try again.');
            }
        }
    }
    
    async deleteEvent(eventId) {
        if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
            return;
        }
        
        try {
            // Use efficient single-event deletion
            await this.deleteSingleEvent(eventId);
            await this.loadEvents(); // Reload events to get fresh data
            this.renderEvents();
        } catch (error) {
            alert('Failed to delete event. Please try again.');
        }
    }
    
    renderReferees() {
        const container = document.getElementById('referees-container');
        
        if (this.referees.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No referees yet</h3>
                    <p>Add referees to assign to matches</p>
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
                    <div class="team-actions">
                        <button class="btn btn-small btn-secondary" onclick="app.editReferee('${referee.id}')" title="Edit Referee">✏️</button>
                        <button class="btn btn-small btn-danger" onclick="app.deleteReferee('${referee.id}')" title="Delete Referee">🗑️</button>
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
        
        // Use full teams if available, otherwise use basic teams
        const teamsToUse = this.teams.length > 0 ? this.teams : this.teamsBasic;
        
        // Initialize all teams with zero stats
        teamsToUse.forEach(team => {
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
            // Validate event has proper date_epoch
            if (!event.date_epoch || isNaN(event.date_epoch)) {
                console.warn(`⚠️ Event ${event.name} has invalid date_epoch for standings:`, event.date_epoch);
                return;
            }
            
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
        
        // Create lookup maps for efficiency - use both full teams and basic teams
        const teamLookup = new Map();
        const refereeLookup = new Map();
        
        // Prefer full teams data if available, otherwise use basic
        const teamsToUse = this.teams.length > 0 ? this.teams : this.teamsBasic;
        teamsToUse.forEach(team => teamLookup.set(team.id, team));
        this.referees.forEach(referee => refereeLookup.set(referee.id, referee));
        
        // Process all events and matches
        this.events.forEach(event => {
            // Only include current season events AND validate date_epoch
            if (!event.date_epoch || isNaN(event.date_epoch)) {
                console.warn(`⚠️ Event ${event.name} has invalid date_epoch:`, event.date_epoch);
                return;
            }
            
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
                    
                    // First check home team (match context)
                    if (homeTeam) {
                        const homePlayer = homeTeam.members.find(m => m.id === card.memberId);
                        if (homePlayer) {
                            playerTeam = homeTeam;
                            playerName = homePlayer.name; // Override with current team roster name if found
                        }
                    }
                    
                    // Then check away team (match context)
                    if (!playerTeam && awayTeam) {
                        const awayPlayer = awayTeam.members.find(m => m.id === card.memberId);
                        if (awayPlayer) {
                            playerTeam = awayTeam;
                            playerName = awayPlayer.name; // Override with current team roster name if found
                        }
                    }
                    
                    // If not found in match teams, search ALL teams (for moved players)
                    if (!playerTeam) {
                        for (const team of this.teams) {
                            const player = team.members.find(m => m.id === card.memberId);
                            if (player) {
                                playerTeam = team;
                                playerName = player.name;
                                break; // Found player, use their current team
                            }
                        }
                    }
                    
                    cardRecords.push({
                        eventDate: new Date(event.date_epoch * 1000).toLocaleDateString('en-US', { 
                            timeZone: 'America/Los_Angeles', 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit' 
                        }),
                        eventDate_epoch: event.date_epoch,  // Add the epoch timestamp for proper date handling
                        eventName: event.name,
                        matchInfo: `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`,
                        teamName: playerTeam?.name || 'Unknown Team',
                        playerName: playerName,
                        cardType: card.cardType,
                        reason: card.reason,
                        notes: card.notes,
                        minute: card.minute,
                        refereeName: mainReferee?.name
                    });
                });
            });
        });
        
        return cardRecords;
    }
    
    // Chart.js rendering methods (from view app)
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
        const maxAttempts = 25; // 2.5 seconds max wait
        
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
    
    // Season Management Methods
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
                
                <div class="season-actions">
                    <button class="btn-season-action btn-preview-migration" onclick="app.previewSeasonMigration()">
                        Preview Migration
                    </button>
                    <button class="btn-season-action btn-close-season" 
                            onclick="app.showCloseSeasonModal()" 
                            ${stats.pendingSuspensions.length > 0 ? 'disabled title="Cannot close season with pending suspensions"' : ''}>
                        Close Season
                    </button>
                </div>
            </div>
            
            <div id="migration-preview-container"></div>
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
                                        eventDate: new Date(event.date_epoch * 1000).toLocaleDateString('en-US', { 
                            timeZone: 'America/Los_Angeles', 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit' 
                        })
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
                    ⚠️ Season cannot be closed until all suspensions are resolved.
                </p>
            </div>
        `;
    }
    
    async previewSeasonMigration() {
        const container = document.getElementById('migration-preview-container');
        
        // Collect all cards from current season
        const cardsToMigrate = this.collectCurrentSeasonCards();
        
        if (cardsToMigrate.length === 0) {
            container.innerHTML = `
                <div class="migration-preview">
                    <h3 style="margin-bottom: 15px; color: #666;">Migration Preview</h3>
                    <div class="empty-state">
                        <h4>No Cards to Migrate</h4>
                        <p>There are no cards from the current season to migrate to disciplinary records.</p>
                    </div>
                </div>
            `;
            return;
        }
        
        // Group by card type for summary
        const yellowCards = cardsToMigrate.filter(card => card.cardType === 'yellow');
        const redCards = cardsToMigrate.filter(card => card.cardType === 'red');
        
        container.innerHTML = `
            <div class="migration-preview">
                <h3 style="margin-bottom: 15px; color: #333;">Migration Preview</h3>
                <p style="margin-bottom: 20px; color: #666;">
                    The following ${cardsToMigrate.length} card${cardsToMigrate.length !== 1 ? 's' : ''} will be moved from match records to the disciplinary records database:
                </p>
                
                <div class="migration-summary">
                    <div class="migration-stat">
                        <div class="migration-number">${yellowCards.length}</div>
                        <div class="stat-label">Yellow Cards</div>
                    </div>
                    <div class="migration-stat">
                        <div class="migration-number">${redCards.length}</div>
                        <div class="stat-label">Red Cards</div>
                    </div>
                    <div class="migration-stat">
                        <div class="migration-number">${cardsToMigrate.length}</div>
                        <div class="stat-label">Total Cards</div>
                    </div>
                </div>
                
                <div class="cards-to-migrate">
                    ${cardsToMigrate.map(card => `
                        <div class="card-migration-item">
                            <div>
                                <strong>${card.playerName}</strong> (${card.teamName})
                                <br>
                                <small style="color: #666;">
                                    ${card.cardType === 'yellow' ? '🟨' : '🟥'} ${card.cardType} card • ${card.eventName} • ${epochToPacificDate(card.eventDate_epoch || card.eventDate)}
                                </small>
                            </div>
                            <div style="font-size: 0.8em; color: #666;">
                                ${card.reason || 'No reason specified'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    showCloseSeasonModal() {
        const stats = this.calculateSeasonStats();
        const currentSeason = this.getCurrentSeason();
        
        if (stats.pendingSuspensions.length > 0) {
            alert('Cannot close season with pending suspensions. Please resolve all suspensions first.');
            return;
        }
        
        const modal = this.createModal(`Close ${currentSeason.type} ${currentSeason.year} Season`, `
            <div style="margin-bottom: 20px;">
                <p style="color: #856404; background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <strong>⚠️ Warning:</strong> This action will permanently close the current season and cannot be undone.
                </p>
                
                <h4 style="margin-bottom: 10px;">This will:</h4>
                <ul style="margin: 0 0 15px 20px; color: #666;">
                    <li>Move all ${stats.totalCards} match cards to disciplinary records</li>
                    <li>Archive all ${stats.totalEvents} events and ${stats.totalMatches} matches</li>
                    <li>Clear current season data to prepare for new season</li>
                    <li>Preserve all team rosters and referees</li>
                </ul>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="confirm-close-season" style="transform: scale(1.2);">
                        <span style="font-weight: 600;">I understand this action cannot be undone</span>
                    </label>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn btn-danger" onclick="app.closeSeason()" id="confirm-close-btn" disabled>
                    Close Season
                </button>
            </div>
            
            <script>
                document.getElementById('confirm-close-season').addEventListener('change', function() {
                    document.getElementById('confirm-close-btn').disabled = !this.checked;
                });
            </script>
        `);
        
        document.body.appendChild(modal);
    }
    
    async closeSeason() {
        const progressContainer = document.querySelector('.modal-content');
        const currentSeason = this.getCurrentSeason();
        
        // Show progress UI
        progressContainer.innerHTML = `
            <div class="modal-header">
                <h2 class="modal-title">Closing ${currentSeason.type} ${currentSeason.year} Season</h2>
            </div>
            
            <div class="progress-container">
                <div class="progress-text" id="progress-text">Preparing migration...</div>
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
                <div id="progress-details" style="font-size: 0.9em; color: #666; margin-top: 10px;"></div>
            </div>
        `;
        
        try {
            // Step 1: Collect all cards to migrate
            this.updateProgress(10, 'Collecting cards to migrate...');
            const cardsToMigrate = this.collectCurrentSeasonCards();
            
            // Step 2: Convert cards to disciplinary records format
            this.updateProgress(25, 'Converting cards to disciplinary records...');
            const disciplinaryRecords = cardsToMigrate.map(card => ({
                memberId: card.memberId,
                cardType: card.cardType,
                reason: card.reason,
                notes: card.notes,
                incidentDate: card.eventDate,
                suspensionMatches: 0, // Will be updated for red cards
                suspensionServed: true, // Mark as served for historical records
                seasonClosed: true,
                originalEventName: card.eventName,
                originalMatchInfo: card.matchInfo
            }));
            
            // Step 3: Send disciplinary records to server
            this.updateProgress(50, 'Saving disciplinary records...');
            await this.saveDisciplinaryRecords(disciplinaryRecords);
            
            // Step 4: Archive current season data
            this.updateProgress(75, 'Archiving season data...');
            await this.archiveSeasonData(currentSeason);
            
            // Step 5: Clear current events
            this.updateProgress(90, 'Clearing current season events...');
            this.events = [];
            await this.saveEvents(); // Save empty events array
            
            // Step 6: Complete
            this.updateProgress(100, 'Season closed successfully!');
            
            setTimeout(() => {
                this.closeModal();
                this.renderSeasonManagement();
                this.renderEvents(); // Refresh events display
                alert(`${currentSeason.type} ${currentSeason.year} season has been successfully closed. You can now start a new season.`);
            }, 1500);
            
        } catch (error) {
            console.error('Error closing season:', error);
            this.updateProgress(0, `Error: ${error.message}`);
            setTimeout(() => {
                this.closeModal();
                alert('Failed to close season. Please try again.');
            }, 2000);
        }
    }
    
    updateProgress(percentage, text) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressFill) progressFill.style.width = percentage + '%';
        if (progressText) progressText.textContent = text;
    }
    
    async saveDisciplinaryRecords(records) {
        if (records.length === 0) return;
        
        const response = await fetch('/api/disciplinary-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(records)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save disciplinary records');
        }
        
        return await response.json();
    }
    
    async archiveSeasonData(season) {
        const archiveData = {
            season: season,
            events: this.events,
            archivedAt: new Date().toISOString()
        };
        
        const response = await fetch('/api/archive-season', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(archiveData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to archive season data');
        }
        
        return await response.json();
    }
    
    showNewSeasonModal() {
        const modal = this.createModal('Start New Season', `
            <div style="margin-bottom: 20px;">
                <h4 style="margin-bottom: 15px;">Select New Season:</h4>
                
                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 2px solid #e9ecef; border-radius: 8px; cursor: pointer;">
                        <input type="radio" name="new-season" value="spring" id="spring-season">
                        <div>
                            <strong>Spring ${new Date().getFullYear()}</strong>
                            <div style="font-size: 0.9em; color: #666;">February 15 - June 30</div>
                        </div>
                    </label>
                    
                    <label style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 2px solid #e9ecef; border-radius: 8px; cursor: pointer;">
                        <input type="radio" name="new-season" value="fall" id="fall-season">
                        <div>
                            <strong>Fall ${new Date().getFullYear()}</strong>
                            <div style="font-size: 0.9em; color: #666;">August 1 - December 31</div>
                        </div>
                    </label>
                </div>
                
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                    <p style="margin: 0; color: #155724; font-size: 0.9em;">
                        <strong>✅ Note:</strong> Starting a new season will clear all current events but preserve team rosters, referees, and disciplinary records.
                    </p>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.startNewSeason()">Start New Season</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async startNewSeason() {
        const selectedSeason = document.querySelector('input[name="new-season"]:checked');
        
        if (!selectedSeason) {
            alert('Please select a season type.');
            return;
        }
        
        const seasonType = selectedSeason.value;
        const year = new Date().getFullYear();
        
        try {
            // Clear current events
            this.events = [];
            await this.saveEvents();
            
            // Update display
            this.closeModal();
            this.renderSeasonManagement();
            this.renderEvents();
            
            const seasonName = seasonType.charAt(0).toUpperCase() + seasonType.slice(1);
            alert(`${seasonName} ${year} season has been started! You can now create new events.`);
            
        } catch (error) {
            console.error('Error starting new season:', error);
            alert('Failed to start new season. Please try again.');
        }
    }
    
    // Game Tracker Methods
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
            filteredGames = gameRecords.filter(game => this.isCurrentSeasonEvent(game.eventEpoch));
        }
        
        // Filter by status
        if (statusFilter !== 'all') {
            if (statusFilter === 'incomplete') {
                // Show games that are not completed or cancelled AND are in the past
                const today = new Date();
                today.setHours(23, 59, 59, 999); // End of today
                
                filteredGames = filteredGames.filter(game => {
                    const gameDate = new Date(game.eventDate);
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
        
        // REQUESTED CHANGE: Sort by date ascending (oldest first), then by time
        filteredGames.sort((a, b) => {
            const dateA = new Date(a.eventDate);
            const dateB = new Date(b.eventDate);
            if (dateA - dateB !== 0) return dateA - dateB; // Changed to ascending order
            
            // Then sort by time if same date
            if (a.time && b.time) {
                return a.time.localeCompare(b.time);
            }
            return 0;
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
                                    <div class="game-date">${game.eventDate}</div>
                                    ${game.time ? `<div class="game-time">${game.time}</div>` : ''}
                                </td>
                                <td class="event-cell">
                                    <div class="event-name">${game.eventName}</div>
                                </td>
                                <td class="match-cell">
                                    <div class="match-teams">${game.homeTeam} vs ${game.awayTeam}</div>
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
                                        `<button class="btn btn-small" onclick="app.editMatchResult('${game.eventId}', '${game.matchId}')" title="Edit Result">🏆</button>` 
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
                                <div class="match-teams-large">${game.homeTeam} vs ${game.awayTeam}</div>
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
                                        <button class="btn btn-small" onclick="app.editMatchResult('${game.eventId}', '${game.matchId}')">Edit Result 🏆</button>
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
            // Validate event has proper date_epoch
            if (!event.date_epoch || isNaN(event.date_epoch)) {
                console.warn(`⚠️ Event ${event.name} has invalid date_epoch:`, event.date_epoch);
                return;
            }
            
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
                    eventDate: new Date(event.date_epoch * 1000).toLocaleDateString('en-US', { 
                        timeZone: 'America/Los_Angeles', 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit' 
                    }),
                    eventEpoch: event.date_epoch,
                    timeEpoch: match.time_epoch,
                    eventName: event.name,
                    homeTeam: homeTeam?.name || 'Unknown Team',
                    awayTeam: awayTeam?.name || 'Unknown Team',
                    field: match.field,
                    time: match.time_epoch ? epochToPacificTime(match.time_epoch) : null,
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
    
    // Referee Management
    showAddRefereeModal() {
        this.currentEditingReferee = null;
        this.showRefereeModal();
    }
    
    editReferee(refereeId) {
        this.currentEditingReferee = this.referees.find(r => r.id === refereeId);
        this.showRefereeModal(this.currentEditingReferee);
    }
    
    showRefereeModal(referee = null) {
        const isEdit = referee !== null;
        const modal = this.createModal(isEdit ? 'Edit Referee' : 'Add Referee', `
            <div class="form-group">
                <label class="form-label">Referee Name *</label>
                <input type="text" class="form-input" id="referee-name" value="${referee ? referee.name : ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" class="form-input" id="referee-phone" value="${referee ? referee.phone || '' : ''}">
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveReferee()">${isEdit ? 'Update' : 'Add'} Referee</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveReferee() {
        const name = document.getElementById('referee-name').value.trim();
        const phone = document.getElementById('referee-phone').value.trim();
        
        if (!name) {
            alert('Please enter a referee name');
            return;
        }
        
        if (this.currentEditingReferee) {
            // Edit existing referee
            this.currentEditingReferee.name = name;
            this.currentEditingReferee.phone = phone;
        } else {
            // Add new referee
            const newReferee = {
                id: this.generateUUID(),
                name: name,
                phone: phone
            };
            this.referees.push(newReferee);
        }
        
        try {
            await this.saveReferees();
            this.renderReferees();
            this.closeModal();
        } catch (error) {
            alert('Failed to save referee. Please try again.');
        }
    }
    
    async deleteReferee(refereeId) {
        if (!confirm('Are you sure you want to delete this referee?')) {
            return;
        }
        
        this.referees = this.referees.filter(r => r.id !== refereeId);
        
        try {
            await this.saveReferees();
            this.renderReferees();
        } catch (error) {
            alert('Failed to delete referee. Please try again.');
        }
    }
    
    // Match Management
    showAddMatchModal(eventId) {
        if (this.teamsBasic.length < 2) {
            alert('You need at least 2 teams to create a match');
            return;
        }
        
        const modal = this.createModal('Add Match', `
            <div class="form-group">
                <label class="form-label">Home Team *</label>
                <select class="form-select" id="home-team" required>
                    <option value="">Select home team</option>
                    ${this.teamsBasic.map(team => `<option value="${team.id}">${team.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Away Team *</label>
                <select class="form-select" id="away-team" required>
                    <option value="">Select away team</option>
                    ${this.teamsBasic.map(team => `<option value="${team.id}">${team.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Field</label>
                <select class="form-select" id="match-field">
                    <option value="">Select field</option>
                    <option value="8">Field 8</option>
                    <option value="9">Field 9</option>
                    <option value="10">Field 10</option>
                    <option value="11">Field 11</option>
                    <option value="12">Field 12</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Match Time</label>
                <select class="form-select" id="match-time">
                    <option value="">Select time</option>
                    <option value="09:00">9:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                    <option value="13:00">1:00 PM</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Main Referee</label>
                <select class="form-select" id="main-referee">
                    <option value="">Select main referee</option>
                    ${this.referees.map(referee => `<option value="${referee.id}">${referee.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Assistant Referee</label>
                <select class="form-select" id="assistant-referee">
                    <option value="">Select assistant referee (optional)</option>
                    ${this.referees.map(referee => `<option value="${referee.id}">${referee.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Notes</label>
                <textarea class="form-input" id="match-notes" rows="3"></textarea>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveMatch('${eventId}')">Create Match</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveMatch(eventId) {
        const homeTeamId = document.getElementById('home-team').value;
        const awayTeamId = document.getElementById('away-team').value;
        const field = document.getElementById('match-field').value;
        const time = document.getElementById('match-time').value;
        const mainRefereeId = document.getElementById('main-referee').value;
        const assistantRefereeId = document.getElementById('assistant-referee').value;
        const notes = document.getElementById('match-notes').value.trim();
        
        if (!homeTeamId || !awayTeamId) {
            alert('Please select both home and away teams');
            return;
        }
        
        if (homeTeamId === awayTeamId) {
            alert('Home and away teams must be different');
            return;
        }
        
        if (mainRefereeId && assistantRefereeId && mainRefereeId === assistantRefereeId) {
            alert('Main and assistant referees must be different');
            return;
        }
        
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;
        
        // Convert event date epoch to YYYY-MM-DD format for time conversion
        const eventDateString = new Date(event.date_epoch * 1000).toISOString().split('T')[0];
        
        // Create match object with only essential fields for creation
        const newMatch = {
            id: this.generateUUID(),
            homeTeamId: homeTeamId,
            awayTeamId: awayTeamId,
            field: field || null,
            time_epoch: time ? this.matchTimeStringToEpoch(eventDateString, time) : null,
            mainRefereeId: mainRefereeId || null,
            assistantRefereeId: assistantRefereeId || null,
            notes: notes
        };
        
        console.log('Creating match with time_epoch:', newMatch.time_epoch, 'from time:', time, 'date:', eventDateString);
        
        try {
            // Use efficient single-match API endpoint with minimal payload
            const response = await fetch(`/api/match?event_id=${eventId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newMatch)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create match: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to create match');
            }
            
            // Add match to local event data with full structure for UI
            const fullMatch = {
                ...newMatch,
                homeScore: null,
                awayScore: null,
                matchStatus: 'scheduled',
                homeTeamAttendees: [],
                awayTeamAttendees: [],
                cards: []
            };
            event.matches.push(fullMatch);
            
            this.renderEvents();
            this.closeModal();
        } catch (error) {
            console.error('Failed to save match:', error);
            alert('Failed to save match. Please try again.');
        }
    }
    
    async deleteMatch(eventId, matchId) {
        if (!confirm('Are you sure you want to delete this match?')) {
            return;
        }
        
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;
        
        // Store original matches in case we need to restore
        const originalMatches = [...event.matches];
        
        // Remove match from local event data
        event.matches = event.matches.filter(m => m.id !== matchId);
        
        try {
            // Use efficient single-match delete endpoint
            const response = await fetch(`/api/match?match_id=${matchId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to delete match: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete match');
            }
            
            this.renderEvents();
        } catch (error) {
            console.error('Failed to delete match:', error);
            // Restore original matches if API call failed
            event.matches = originalMatches;
            alert('Failed to delete match. Please try again.');
        }
    }
    
    editMatch(eventId, matchId) {
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!match) return;
        
        // For match editing, we only need basic team data (name, id)
        // Use faster teams-basic endpoint instead of full teams data
        const needsTeams = this.teamsBasic.length === 0;
        const needsReferees = this.referees.length === 0;
        
        if (needsTeams || needsReferees) {
            // Show loading spinner with descriptive message
            let loadingMessage = 'Loading ';
            const loadingItems = [];
            if (needsTeams) loadingItems.push('teams');
            if (needsReferees) loadingItems.push('referees');
            loadingMessage += loadingItems.join(' and ') + '...';
            
            this.showLoadingModal(loadingMessage);
            
            const promises = [];
            if (needsTeams) promises.push(this.loadTeamsBasic());
            if (needsReferees) promises.push(this.loadReferees());
            
            Promise.all(promises).then(() => {
                this.closeLoadingModal();
                this.showEditMatchModal(event, match);
            }).catch(error => {
                this.closeLoadingModal();
                console.error('Error loading match data:', error);
                alert('Failed to load team or referee data. Please try again.');
            });
        } else {
            this.showEditMatchModal(event, match);
        }
    }
    
    showEditMatchModal(event, match) {
        // Use basic teams data for match editing (faster, we only need name/id)
        const homeTeam = this.teamsBasic.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teamsBasic.find(t => t.id === match.awayTeamId);
        
        if (!homeTeam || !awayTeam) {
            alert('Error: Could not find teams for this match. Please refresh the page and try again.');
            return;
        }
        
        // Debug current match values to understand the data format
        console.log('Edit Match - Current values:', {
            field: match.field,
            time: match.time,
            timeType: typeof match.time,
            mainRefereeId: match.mainRefereeId,
            assistantRefereeId: match.assistantRefereeId
        });
        
        const modal = this.createModal(`Edit Match: ${homeTeam.name} vs ${awayTeam.name}`, `
            <div class="form-group">
                <label class="form-label">Home Team</label>
                <select class="form-select" id="edit-home-team" disabled>
                    <option value="${match.homeTeamId}">${homeTeam.name}</option>
                </select>
                <small style="color: #666; font-size: 0.85em;">Teams cannot be changed after match creation</small>
            </div>
            <div class="form-group">
                <label class="form-label">Away Team</label>
                <select class="form-select" id="edit-away-team" disabled>
                    <option value="${match.awayTeamId}">${awayTeam.name}</option>
                </select>
                <small style="color: #666; font-size: 0.85em;">Teams cannot be changed after match creation</small>
            </div>
            <div class="form-group">
                <label class="form-label">Field</label>
                <select class="form-select" id="edit-match-field">
                    <option value="">Select field</option>
                    <option value="8" ${match.field === '8' ? 'selected' : ''}>Field 8</option>
                    <option value="9" ${match.field === '9' ? 'selected' : ''}>Field 9</option>
                    <option value="10" ${match.field === '10' ? 'selected' : ''}>Field 10</option>
                    <option value="11" ${match.field === '11' ? 'selected' : ''}>Field 11</option>
                    <option value="12" ${match.field === '12' ? 'selected' : ''}>Field 12</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Match Time</label>
                <select class="form-select" id="edit-match-time">
                    <option value="">Select time</option>
                    <option value="09:00" ${this.matchTimeEpochToString(match.time_epoch) === '09:00' ? 'selected' : ''}>9:00 AM</option>
                    <option value="11:00" ${this.matchTimeEpochToString(match.time_epoch) === '11:00' ? 'selected' : ''}>11:00 AM</option>
                    <option value="13:00" ${this.matchTimeEpochToString(match.time_epoch) === '13:00' ? 'selected' : ''}>1:00 PM</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Main Referee</label>
                <select class="form-select" id="edit-main-referee">
                    <option value="">Select main referee</option>
                    ${this.referees.map(referee => `<option value="${referee.id}" ${match.mainRefereeId === referee.id ? 'selected' : ''}>${referee.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Assistant Referee</label>
                <select class="form-select" id="edit-assistant-referee">
                    <option value="">Select assistant referee (optional)</option>
                    ${this.referees.map(referee => `<option value="${referee.id}" ${match.assistantRefereeId === referee.id ? 'selected' : ''}>${referee.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Notes</label>
                <textarea class="form-input" id="edit-match-notes" rows="3">${match.notes || ''}</textarea>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveEditedMatch('${event.id}', '${match.id}')">Update Match</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    async saveEditedMatch(eventId, matchId) {
        const field = document.getElementById('edit-match-field').value;
        const time = document.getElementById('edit-match-time').value;
        const mainRefereeId = document.getElementById('edit-main-referee').value;
        const assistantRefereeId = document.getElementById('edit-assistant-referee').value;
        const notes = document.getElementById('edit-match-notes').value.trim();
        
        if (mainRefereeId && assistantRefereeId && mainRefereeId === assistantRefereeId) {
            alert('Main and assistant referees must be different');
            return;
        }
        
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!match) return;
        
        // Prepare update data with only changed fields
        const updateData = {};
        
        // Update field
        const newField = field || null;
        if (match.field !== newField) {
            updateData.field = newField;
        }
        
        // Update time_epoch
        let newTimeEpoch = null;
        if (time) {
            const eventDateString = new Date(event.date_epoch * 1000).toISOString().split('T')[0];
            newTimeEpoch = this.matchTimeStringToEpoch(eventDateString, time);
        }
        if (match.time_epoch !== newTimeEpoch) {
            updateData.time_epoch = newTimeEpoch;
        }
        
        // Update referees
        const newMainReferee = mainRefereeId || null;
        const newAssistantReferee = assistantRefereeId || null;
        if (match.mainRefereeId !== newMainReferee) {
            updateData.mainRefereeId = newMainReferee;
        }
        if (match.assistantRefereeId !== newAssistantReferee) {
            updateData.assistantRefereeId = newAssistantReferee;
        }
        
        // Update notes
        if (match.notes !== notes) {
            updateData.notes = notes;
        }
        
        if (Object.keys(updateData).length === 0) {
            // No changes to save
            this.closeModal();
            return;
        }
        
        try {
            // Use efficient single-match update endpoint
            const response = await fetch(`/api/match?match_id=${matchId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to update match: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to update match');
            }
            
            // Update local data after successful API call
            Object.assign(match, {
                field: newField,
                time_epoch: newTimeEpoch,
                mainRefereeId: newMainReferee,
                assistantRefereeId: newAssistantReferee,
                notes: notes
            });
            
            this.renderEvents();
            this.closeModal();
        } catch (error) {
            console.error('Failed to update match:', error);
            alert('Failed to update match. Please try again.');
        }
    }
    
    async editMatchResult(eventId, matchId) {
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!match) return;
        
        // Load only the specific teams needed for this match (performance optimization)
        const requiredTeamIds = [match.homeTeamId, match.awayTeamId];
        const matchTeams = await this.loadSpecificTeams(requiredTeamIds);
        const homeTeam = matchTeams.find(t => t.id === match.homeTeamId);
        const awayTeam = matchTeams.find(t => t.id === match.awayTeamId);
        
        // Load referees if needed
        if (this.referees.length === 0) {
            await this.loadReferees();
        }
        
        const mainReferee = match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null;
        const assistantReferee = match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null;
        
        // Store current match for addCard function
        this.currentMatch = match;
        this.currentMatchTeams = { homeTeam, awayTeam }; // Store loaded teams for addCard function
        
        const modal = this.createModal(`Match Result: ${homeTeam.name} vs ${awayTeam.name}`, `
            <div class="match-result-mobile">
                <!-- Match Status Section -->
                <div class="form-section">
                    <label class="form-label">Match Status</label>
                    <select class="form-select" id="match-status">
                        <option value="scheduled" ${match.matchStatus === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                        <option value="in_progress" ${match.matchStatus === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="completed" ${match.matchStatus === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="cancelled" ${match.matchStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
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
                <div class="form-section">
                    <label class="form-label">Match Officials</label>
                    <div class="officials-info">
                        <div class="official-name">Referee: ${mainReferee.name}</div>
                        ${assistantReferee ? `<div class="assistant-name">Assistant: ${assistantReferee.name}</div>` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Match Notes Section -->
                <div class="form-section">
                    <label class="form-label">Match Notes</label>
                    <textarea class="form-input" id="match-notes" rows="3" placeholder="Enter any notes about this match (optional)">${match.matchNotes || ''}</textarea>
                </div>

                <!-- Cards Section -->
                <div class="form-section">
                    <label class="form-label">Cards & Disciplinary Actions</label>
                    <div id="cards-container" class="cards-mobile-container">
                        ${match.cards && match.cards.length > 0 ? match.cards.map((card, index) => {
                            const cardTeam = homeTeam.members.some(m => m.id === card.memberId) ? homeTeam : awayTeam;
                            const cardPlayer = [...homeTeam.members, ...awayTeam.members].find(m => m.id === card.memberId);
                            
                            return `
                                <div class="card-item-mobile" data-card-index="${index}">
                                    <div class="card-header-mobile">
                                        <div class="card-type-display ${card.cardType}">
                                            ${card.cardType === 'yellow' ? '🟨' : '🟥'} ${card.cardType.toUpperCase()} CARD
                                        </div>
                                        <button class="btn-remove-card" onclick="app.removeCard(${index})">×</button>
                                    </div>
                                    
                                    <div class="card-details-mobile">
                                        <div class="form-row-mobile">
                                            <label class="mobile-label">Player</label>
                                            <select class="form-select-mobile" data-card-index="${index}" data-field="memberId">
                                                <option value="">Select Player</option>
                                                <optgroup label="${homeTeam.name}">
                                                    ${homeTeam.members
                                                        .slice()
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .map(m => `<option value="${m.id}" ${card.memberId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                                                </optgroup>
                                                <optgroup label="${awayTeam.name}">
                                                    ${awayTeam.members
                                                        .slice()
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .map(m => `<option value="${m.id}" ${card.memberId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                                                </optgroup>
                                            </select>
                                        </div>
                                        
                                        <div class="form-row-mobile-dual">
                                            <div class="form-col-mobile">
                                                <label class="mobile-label">Card Type</label>
                                                <select class="form-select-mobile" data-card-index="${index}" data-field="cardType" onchange="app.updateCardType(${index})">
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
                                                ${generateCardReasonsOptions(card.reason)}
                                            </select>
                                        </div>
                                        
                                        <div class="form-row-mobile">
                                            <label class="mobile-label">Additional Notes (Optional)</label>
                                            <input type="text" class="form-input-mobile" placeholder="Additional notes..." data-card-index="${index}" data-field="notes" value="${card.notes || ''}">
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('') : '<div class="no-cards-message">No cards issued</div>'}
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
        const existingCards = container.querySelectorAll('.card-item-mobile, .card-item');
        const newIndex = existingCards.length;
        
        // Remove "no cards" message if it exists
        const noCardsMsg = container.querySelector('.no-cards-message, p');
        if (noCardsMsg) noCardsMsg.remove();
        
        // Use the teams that were already loaded for the match result modal
        const homeTeam = this.currentMatchTeams?.homeTeam;
        const awayTeam = this.currentMatchTeams?.awayTeam;
        
        // 🚀 IMPROVEMENT: Only show players who were checked in for this match
        const homeAttendees = this.currentMatch?.homeTeamAttendees || [];
        const awayAttendees = this.currentMatch?.awayTeamAttendees || [];
        
        // Create lookup sets for faster checking
        const homeAttendeeIds = new Set(homeAttendees.map(a => a.memberId));
        const awayAttendeeIds = new Set(awayAttendees.map(a => a.memberId));
        
        // Filter team members to only checked-in players
        const checkedInHomePlayers = homeTeam?.members.filter(m => homeAttendeeIds.has(m.id)) || [];
        const checkedInAwayPlayers = awayTeam?.members.filter(m => awayAttendeeIds.has(m.id)) || [];
        
        // Show helpful message if no players checked in
        let playerOptions = '';
        if (checkedInHomePlayers.length === 0 && checkedInAwayPlayers.length === 0) {
            playerOptions = '<option value="" disabled>No players checked in for this match</option>';
        } else {
            if (checkedInHomePlayers.length > 0) {
                playerOptions += `<optgroup label="${homeTeam?.name || 'Home Team'} (${checkedInHomePlayers.length} checked in)">
                    ${checkedInHomePlayers
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(m => `<option value="${m.id}">${m.name}${m.jerseyNumber ? ` (#${m.jerseyNumber})` : ''}</option>`).join('')}
                </optgroup>`;
            }
            if (checkedInAwayPlayers.length > 0) {
                playerOptions += `<optgroup label="${awayTeam?.name || 'Away Team'} (${checkedInAwayPlayers.length} checked in)">
                    ${checkedInAwayPlayers
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(m => `<option value="${m.id}">${m.name}${m.jerseyNumber ? ` (#${m.jerseyNumber})` : ''}</option>`).join('')}
                </optgroup>`;
            }
        }
        
        const cardHtml = `
            <div class="card-item-mobile" data-card-index="${newIndex}">
                <div class="card-header-mobile">
                    <div class="card-type-display yellow">
                        🟨 YELLOW CARD
                    </div>
                    <button class="btn-remove-card" onclick="app.removeCard(${newIndex})">×</button>
                </div>
                
                <div class="card-details-mobile">
                    <div class="form-row-mobile">
                        <label class="mobile-label">Player (Only checked-in players shown)</label>
                        <select class="form-select-mobile" data-card-index="${newIndex}" data-field="memberId">
                            <option value="">Select Player</option>
                            ${playerOptions}
                        </select>
                    </div>
                    
                    <div class="form-row-mobile-dual">
                        <div class="form-col-mobile">
                            <label class="mobile-label">Card Type</label>
                            <select class="form-select-mobile" data-card-index="${newIndex}" data-field="cardType" onchange="app.updateCardType(${newIndex})">
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
                            ${generateCardReasonsOptions()}
                        </select>
                    </div>
                    
                    <div class="form-row-mobile">
                        <label class="mobile-label">Additional Notes (Optional)</label>
                        <input type="text" class="form-input-mobile" placeholder="Additional notes..." data-card-index="${newIndex}" data-field="notes">
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', cardHtml);
    }
    
    updateCardType(index) {
        const cardItem = document.querySelector(`[data-card-index="${index}"]`);
        const cardTypeSelect = cardItem?.querySelector('[data-field="cardType"]');
        const cardHeader = cardItem?.querySelector('.card-type-display');
        
        if (cardTypeSelect && cardHeader) {
            const cardType = cardTypeSelect.value;
            cardHeader.className = `card-type-display ${cardType}`;
            cardHeader.textContent = cardType === 'yellow' ? '🟨 YELLOW CARD' : '🟥 RED CARD';
        }
    }
    
    removeCard(index) {
        const cardItems = document.querySelectorAll('.card-item-mobile, .card-item');
        if (cardItems[index]) {
            cardItems[index].remove();
            
            // Re-index remaining cards
            const remainingCards = document.querySelectorAll('.card-item-mobile, .card-item');
            remainingCards.forEach((card, newIndex) => {
                card.querySelectorAll('[data-card-index]').forEach(element => {
                    element.setAttribute('data-card-index', newIndex);
                });
                const deleteBtn = card.querySelector('.btn-danger, .btn-remove-card');
                if (deleteBtn) {
                    deleteBtn.setAttribute('onclick', `app.removeCard(${newIndex})`);
                }
                // Update updateCardType reference if it exists
                const cardTypeSelect = card.querySelector('[data-field="cardType"][onchange]');
                if (cardTypeSelect) {
                    cardTypeSelect.setAttribute('onchange', `app.updateCardType(${newIndex})`);
                }
            });
            
            // Add "no cards" message if no cards remain
            if (remainingCards.length === 0) {
                document.getElementById('cards-container').innerHTML = '<div class="no-cards-message">No cards issued</div>';
            }
        }
    }
    
    async saveMatchResult(eventId, matchId) {
        console.log('🔧 saveMatchResult called for:', eventId, matchId);
        
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!match) {
            console.error('❌ Match not found:', matchId);
            return;
        }
        
        // Get form values with defensive checks
        const matchStatusElement = document.getElementById('match-status');
        const homeScoreElement = document.getElementById('home-score');
        const awayScoreElement = document.getElementById('away-score');
        const matchNotesElement = document.getElementById('match-notes');
        
        if (!matchStatusElement) {
            console.error('❌ match-status element not found');
            alert('Error: Form elements not found. Please try again.');
            return;
        }
        
        let matchStatus = matchStatusElement.value;
        const homeScore = homeScoreElement ? homeScoreElement.value : '';
        const awayScore = awayScoreElement ? awayScoreElement.value : '';
        const matchNotes = matchNotesElement ? matchNotesElement.value.trim() : '';
        
        console.log('📝 Form values:', { matchStatus, homeScore, awayScore, matchNotes });
        
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
                if (matchStatusElement) {
                    matchStatusElement.value = 'completed';
                }
            }
        }
        
        // Update match data
        match.matchStatus = matchStatus;
        match.homeScore = homeScore !== '' ? parseInt(homeScore) : null;
        match.awayScore = awayScore !== '' ? parseInt(awayScore) : null;
        match.matchNotes = matchNotes;
        
        // Collect cards data
        const cardItems = document.querySelectorAll('.card-item-mobile, .card-item');
        const cards = [];
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        
        console.log('🃏 Found card items:', cardItems.length);
        
        cardItems.forEach((cardItem, index) => {
            try {
                const memberIdField = cardItem.querySelector('[data-field="memberId"]');
                const cardTypeField = cardItem.querySelector('[data-field="cardType"]');
                const minuteField = cardItem.querySelector('[data-field="minute"]');
                const reasonField = cardItem.querySelector('[data-field="reason"]');
                const notesField = cardItem.querySelector('[data-field="notes"]');
                
                if (!memberIdField || !cardTypeField) {
                    console.warn(`⚠️ Missing required fields in card ${index + 1}`);
                    return;
                }
                
                const memberId = memberIdField.value;
                const cardType = cardTypeField.value;
                const minute = minuteField ? minuteField.value : '';
                const reason = reasonField ? reasonField.value : '';
                const notes = notesField ? notesField.value : '';
                
                // No longer collecting suspension data - this will be managed by advisory board
                
                if (memberId && cardType) {
                    // Determine team type
                    const isHomePlayer = homeTeam.members.some(m => m.id === memberId);
                    const teamType = isHomePlayer ? 'home' : 'away';
                    
                    const cardData = {
                        memberId: memberId,
                        teamType: teamType,
                        cardType: cardType,
                        minute: minute ? parseInt(minute) : null,
                        reason: reason || null,
                        notes: notes || null
                    };
                    
                    cards.push(cardData);
                    console.log(`✅ Added card ${index + 1}:`, cardData);
                } else {
                    console.warn(`⚠️ Skipping incomplete card ${index + 1}: memberId=${memberId}, cardType=${cardType}`);
                }
            } catch (error) {
                console.error(`❌ Error processing card ${index + 1}:`, error);
            }
        });
        
        console.log('🃏 Total cards collected:', cards.length);
        match.cards = cards;
        
        try {
            console.log('💾 Saving match result with data:', {
                matchId,
                matchStatus: match.matchStatus,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                notes: match.matchNotes,
                cardsCount: cards.length
            });
            
            // Use efficient single-match update endpoint for match results with authentication
            const updateData = {
                matchStatus: match.matchStatus,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                notes: match.matchNotes,
                cards: cards  // Include cards data in the API call
            };
            
            const response = await fetch(`/api/match?match_id=${matchId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ API response error:', response.status, errorText);
                throw new Error(`Failed to update match result: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('✅ API response:', result);
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to update match result');
            }
            
            console.log('🎉 Match result saved successfully');
            alert('Match result saved successfully!');
            this.renderEvents();
            this.closeModal();
        } catch (error) {
            console.error('❌ Failed to save match result:', error);
            alert(`Failed to save match result: ${error.message}`);
        }
    }
    
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
            
            // Ensure referees are loaded before viewing match
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
            <!-- Admin Check-In Interface (No Lock Restrictions) -->
            <div class="mobile-checkin-interface">
                <!-- Match Header with Key Details -->
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
                        ${match.field ? `<div class="match-field">Field ${match.field}</div>` : ''}
                        <div class="admin-badge">🔧 Admin Access</div>
                    </div>
                </div>
                
                <!-- Team Toggle with Live Attendance Counts -->
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
                        <span id="card-summary-arrow">▼</span>
                    </div>
                    <div id="card-summary-content" class="card-summary-content" style="display: none;"></div>
                </div>
                
                <!-- Admin Player Grid Area -->
                <div class="checkin-grid-area">
                    <div id="grid-home-team" class="team-grid-section active">
                        <div id="grid-container-home" class="player-grid-container"></div>
                    </div>
                    
                    <div id="grid-away-team" class="team-grid-section">
                        <div id="grid-container-away" class="player-grid-container"></div>
                    </div>
                </div>
                
                <!-- Quick Stats Footer - Remove hidden footer -->
            </div>
        `, 'checkin-wide');
        
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
    
    // Initialize the check-in interface (Admin version - no locks)
    async initializeCheckInInterface(eventId, matchId, homeTeam, awayTeam, match) {
        console.log('🚀 Initializing admin check-in interface');
        
        // Store current match data
        this.currentEventId = eventId;
        this.currentMatchId = matchId;
        this.currentHomeTeam = homeTeam;
        this.currentAwayTeam = awayTeam;
        this.currentMatch = match;
        this.currentGridTeam = 'home'; // Default to home team
        
        // Admin always has access - no lock checking
        this.currentCheckInLocked = false;
        
        console.log('✅ Admin access confirmed - no restrictions');
        
        // Update attendance counts
        this.updateAttendanceCounts(match);
        
        // Initialize with home team displayed by default
        this.renderGridTeamFullscreen('home', homeTeam, match.homeTeamAttendees || []);
        this.updatePaginationInfo();
        await this.updateCardSummary(); // Initialize card summary for home team
        
        // Load lifetime cards for all players in the match
        this.loadLifetimeCardsForMatch(homeTeam, awayTeam);
    }
    
    // Update attendance counts with gender breakdown
    updateAttendanceCounts(match) {
        console.log('🔢 updateAttendanceCounts called with:', {
            homeAttendees: match.homeTeamAttendees?.length || 0,
            awayAttendees: match.awayTeamAttendees?.length || 0
        });
        
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
            
            const homeAttendees = match.homeTeamAttendees || [];
            let homeMalePresent = 0, homeFemalePresent = 0;
            homeAttendees.forEach(attendee => {
                const member = homeMembers.find(m => m.id === attendee.memberId);
                if (member) {
                    if (member.gender === 'male') homeMalePresent++;
                    else if (member.gender === 'female') homeFemalePresent++;
                }
            });
            
            homeCountElement.innerHTML = `
                <div class="female-count">${homeFemalePresent}/${homeFemaleTotal} Female</div>
                <div class="male-count">${homeMalePresent}/${homeMaleTotal} Male</div>
            `;
        }
        
        if (awayCountElement && this.currentAwayTeam) {
            const awayMembers = this.currentAwayTeam.members;
            const awayMaleTotal = awayMembers.filter(m => m.gender === 'male').length;
            const awayFemaleTotal = awayMembers.filter(m => m.gender === 'female').length;
            
            const awayAttendees = match.awayTeamAttendees || [];
            let awayMalePresent = 0, awayFemalePresent = 0;
            awayAttendees.forEach(attendee => {
                const member = awayMembers.find(m => m.id === attendee.memberId);
                if (member) {
                    if (member.gender === 'male') awayMalePresent++;
                    else if (member.gender === 'female') awayFemalePresent++;
                }
            });
            
            awayCountElement.innerHTML = `
                <div class="female-count">${awayFemalePresent}/${awayFemaleTotal} Female</div>
                <div class="male-count">${awayMalePresent}/${awayMaleTotal} Male</div>
            `;
        }
    }
    
    // Render team grid in fullscreen mode (Admin version - no locks)
    async renderGridTeamFullscreen(teamType, team, attendees) {
        const containerId = `grid-container-${teamType}`;
        const container = document.getElementById(containerId);
        
        if (!container || !team) return;
        
        console.log(`🏀 Rendering ${teamType} team grid:`, team.members.length, 'players');
        
        // Get current event date for suspension checking
        const currentEvent = this.events.find(e => e.id === this.currentEventId);
        const eventDate = currentEvent ? new Date(currentEvent.date_epoch * 1000).toISOString().split('T')[0] : null;
        
        // Load suspension data for all teams involved in this match (bulk load)
        const homeTeam = this.currentHomeTeam;
        const awayTeam = this.currentAwayTeam;
        const matchTeamIds = [homeTeam?.id, awayTeam?.id].filter(Boolean);
        if (!this.cachedSuspensions) {
            this.cachedSuspensions = await this.loadTeamSuspensions(matchTeamIds);
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
                const isCaptain = this.isMemberCaptain ? this.isMemberCaptain(member, team) : (member.id === team.captainId);
                const isSuspended = member.suspensionStatus.isSuspended;
                
                return `
                    <div class="player-grid-item ${isCheckedIn ? 'checked-in' : ''} ${isSuspended ? 'suspended' : ''}" 
                         onclick="app.toggleGridPlayerAttendance('${this.currentEventId}', '${this.currentMatchId}', '${member.id}', '${teamType}')"
                         title="${isSuspended ? `SUSPENDED: ${member.suspensionStatus.reason}` : 'Click to toggle attendance'}">
                        ${isCaptain ? '<div class="grid-captain-icon">👑</div>' : ''}
                        ${isSuspended ? `<div class="grid-suspension-icon ${member.suspensionStatus.suspensionType === 'yellow_accumulation' ? 'yellow-accumulation' : ''}">🚫</div>` : ''}
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
        
        // infoElement.innerHTML = `${checkedIn}/${totalPlayers} players checked in • Tap to toggle`;
    }
    
    // Check if check-in is locked for a match
    isCheckInLocked(event, match) {
        if (!match.time_epoch) return false;
        
        // Use epoch-based lock function
        return this.isCheckInLockedForMatchEpoch(match.time_epoch);
    }
    
    // Get lock time information
    getLockTimeInfo(event, match) {
        if (!match.time_epoch) return null;
        
        const lockTimeEpoch = match.time_epoch + (2 * 60 * 60 + 40 * 60); // 2h 40m after game start
        const lockDate = epochToPacificDate(lockTimeEpoch);
        const lockTimeFormatted = epochToPacificTime(lockTimeEpoch);
        
        return { lockDate, lockTimeFormatted };
    }
    
    // Helper function to check if check-in is locked for a match (EPOCH-based)
    isCheckInLockedForMatchEpoch(gameStartEpoch) {
        if (!gameStartEpoch) {
            return false; // Don't lock if we don't have time info
        }
        
        try {
            // Simple epoch arithmetic!
            const lockTimeEpoch = gameStartEpoch + (2 * 60 * 60 + 40 * 60); // 2h 40m after game start
            
            const currentEpoch = Math.floor(Date.now() / 1000);
            const isLocked = currentEpoch > lockTimeEpoch;
            
            return isLocked;
        } catch (error) {
            return false; // Don't lock on error
        }
    }
    
    // Toggle card summary display
    toggleCardSummary() {
        const content = document.getElementById('card-summary-content');
        const arrow = document.getElementById('card-summary-arrow');
        
        if (content && arrow) {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            arrow.textContent = isVisible ? '▼' : '▲';
        }
    }
    
    // Update card summary for current team
    async updateCardSummary() {
        const team = this.currentGridTeam === 'home' ? this.currentHomeTeam : this.currentAwayTeam;
        if (!team) return;
        
        try {
            const response = await fetch(`/api/team-card-summary?team_id=${team.id}`);
            if (response.ok) {
                const cardData = await response.json();
                this.displayCardSummary(cardData);
            }
        } catch (error) {
            console.error('Error loading card summary:', error);
        }
    }
    
    // Display card summary
    displayCardSummary(cardData) {
        const summaryElement = document.getElementById('team-card-summary');
        const textElement = document.getElementById('card-summary-text');
        const contentElement = document.getElementById('card-summary-content');
        
        if (!summaryElement || !textElement || !contentElement) return;
        
        if (cardData.length === 0) {
            summaryElement.style.display = 'none';
            return;
        }
        
        summaryElement.style.display = 'block';
        textElement.textContent = `ℹ️ ${cardData.length} Player${cardData.length !== 1 ? 's' : ''} with cards`;
        
        contentElement.innerHTML = cardData.map(player => `
            <div class="card-summary-player">
                <div class="player-name">${player.memberName}</div>
                <div class="card-counts">
                    ${player.currentSeasonYellow > 0 ? `🟨${player.currentSeasonYellow}` : ''}
                    ${player.currentSeasonRed > 0 ? `🟥${player.currentSeasonRed}` : ''}
                    ${player.lifetimeYellow > 0 || player.lifetimeRed > 0 ? 
                        `<span class="lifetime-cards">(Lifetime: ${player.lifetimeYellow}🟨 ${player.lifetimeRed}🟥)</span>` : ''}
                </div>
            </div>
        `).join('');
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
    
    // Toggle between home and away team in grid view (Admin version)
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
    
    // Clear card summary to avoid showing previous team's data
    clearCardSummary() {
        const summary = document.getElementById('team-card-summary');
        const summaryText = document.getElementById('card-summary-text');
        const summaryContent = document.getElementById('card-summary-content');
        const summaryIcon = document.getElementById('card-summary-arrow');
        
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
        }
    }
    
    // Render grid for specific team with scrolling (no pagination)
    async renderGridTeam(teamType) {
        const team = teamType === 'home' ? this.currentHomeTeam : this.currentAwayTeam;
        const attendees = teamType === 'home' ? this.currentMatch.homeTeamAttendees : this.currentMatch.awayTeamAttendees;
        
        const container = document.getElementById(`grid-container-${teamType}`);
        const paginationInfo = document.getElementById(`grid-pagination-info-${teamType}`);
        const paginationContainer = document.getElementById(`grid-pagination-${teamType}`);
        
        if (!team || !team.members) return;
        
        const totalPlayers = team.members.length;
        
        // Update info to show total players
        paginationInfo.innerHTML = `${totalPlayers} player${totalPlayers !== 1 ? 's' : ''} • Scroll to find players`;
        
        // Get current event date for suspension checking
        const currentEvent = this.events.find(e => e.id === this.currentEventId);
        const eventDate = currentEvent ? new Date(currentEvent.date_epoch * 1000).toISOString().split('T')[0] : null;
        
        // Load suspension data for all teams involved in this match (bulk load)
        const homeTeam = this.currentHomeTeam;
        const awayTeam = this.currentAwayTeam;
        const matchTeamIds = [homeTeam?.id, awayTeam?.id].filter(Boolean);
        if (!this.cachedSuspensions) {
            this.cachedSuspensions = await this.loadTeamSuspensions(matchTeamIds);
        }
        
        // Add suspension status to members using cached data
        const membersWithSuspensions = team.members.map(member => {
            const suspensionStatus = this.cachedSuspensions[member.id] || { isSuspended: false, suspensionType: null };
            return { ...member, suspensionStatus };
        });
        
        // Render all grid items with new structure (no pagination) - sorted alphabetically
        container.innerHTML = membersWithSuspensions
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(member => {
            const isCheckedIn = attendees.some(a => a.memberId === member.id);
            const isSuspended = member.suspensionStatus.isSuspended;
            
            return `
                <div class="player-grid-item ${isCheckedIn ? 'checked-in' : ''} ${isSuspended ? 'suspended' : ''}" 
                     onclick="app.toggleGridPlayerAttendance('${this.currentEventId}', '${this.currentMatchId}', '${member.id}', '${teamType}')"
                     title="${isSuspended ? `SUSPENDED: ${member.suspensionStatus.reason}` : 'Click to toggle attendance'}">
                    <div class="grid-check-icon">✓</div>
                    ${member.id === team.captainId ? '<div class="grid-captain-icon">👑</div>' : ''}
                    ${isSuspended ? `<div class="grid-suspension-icon ${member.suspensionStatus.suspensionType === 'yellow_accumulation' ? 'yellow-accumulation' : ''}">🚫</div>` : ''}
                    ${this.getLazyImageHtml(member, 'player-grid-photo')}
                    <div class="player-grid-content">
                        <div class="player-grid-name">${member.name}</div>
                        ${member.jerseyNumber ? `<div class="player-grid-jersey">#${member.jerseyNumber}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Clear pagination controls (not needed for scrolling)
        paginationContainer.innerHTML = '';
        
        // 🚀 PERFORMANCE: Initialize lazy loading for newly rendered grid images
        this.initializeLazyImages(container);
        
        // 🖼️ Photos now use direct URLs with HTTP caching (no lazy loading needed)
        console.log('🖼️ Match grid photos use direct URLs');
    }
    
    // Bulk load suspensions for multiple teams (similar to captain loading pattern)
    async loadTeamSuspensions(teamIds) {
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
            
            // Convert to the format expected by the UI
            const memberSuspensionStatus = {};
            Object.keys(suspensionsByMember).forEach(memberId => {
                const memberSuspensions = suspensionsByMember[memberId];
                const totalEventsRemaining = memberSuspensions.reduce((total, suspension) => {
                    return total + suspension.eventsRemaining;
                }, 0);
                
                memberSuspensionStatus[memberId] = {
                    isSuspended: true,
                    suspensionType: memberSuspensions.length > 1 ? 'multiple' : memberSuspensions[0].cardType,
                    totalMatches: totalEventsRemaining,
                    suspensions: memberSuspensions,
                    reason: `${memberSuspensions.length} active suspension${memberSuspensions.length > 1 ? 's' : ''}`,
                    remainingEvents: totalEventsRemaining
                };
            });
            
            return memberSuspensionStatus;
            
        } catch (error) {
            console.error('Error loading team suspensions:', error);
            return {};
        }
    }

    // Check if player is currently suspended (now uses cached data)
    async checkPlayerSuspensionStatus(memberId) {
        try {
            // If we have cached suspension data, use it
            if (this.cachedSuspensions && this.cachedSuspensions[memberId]) {
                const suspensionStatus = this.cachedSuspensions[memberId];
                return {
                    suspended: true,
                    totalMatches: suspensionStatus.totalMatches,
                    suspensions: suspensionStatus.suspensions
                };
            }
            
            // Fallback to individual API call if no cached data
            const response = await fetch(`/api/suspensions?memberId=${memberId}&status=active`);
            
            if (!response.ok) {
                console.warn('Could not check suspension status:', response.status);
                return { suspended: false };
            }
            
            const activeSuspensions = await response.json();
            
            if (activeSuspensions.length > 0) {
                const totalMatches = activeSuspensions.reduce((sum, suspension) => {
                    return sum + suspension.eventsRemaining;
                }, 0);
                
                return {
                    suspended: true,
                    totalMatches: totalMatches,
                    suspensions: activeSuspensions
                };
            }
            
            return { suspended: false };
        } catch (error) {
            console.error('Error checking suspension status:', error);
            return { suspended: false };
        }
    }

    // Toggle player attendance in grid view (Admin version - with suspension checks)
    async toggleGridPlayerAttendance(eventId, matchId, memberId, teamType) {
        const event = this.events.find(e => e.id === eventId);
        const match = event?.matches.find(m => m.id === matchId);
        
        if (!event || !match) {
            console.error('Event or match not found');
            alert('Event or match not found. Please refresh and try again.');
            return;
        }
        
        // Find player name for suspension warning
        let playerName = 'Unknown Player';
        const homeTeam = this.teamsBasic.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teamsBasic.find(t => t.id === match.awayTeamId);
        const team = teamType === 'home' ? homeTeam : awayTeam;
        const player = team?.members?.find(m => m.id === memberId);
        if (player) playerName = player.name;
        
        const attendeesArray = teamType === 'home' ? match.homeTeamAttendees : match.awayTeamAttendees;
        const existingIndex = attendeesArray.findIndex(a => a.memberId === memberId);
        const isCurrentlyCheckedIn = existingIndex >= 0;
        
        // If trying to check in (not check out), check for suspension
        if (!isCurrentlyCheckedIn) {
            console.log('🔍 Checking suspension status for player:', playerName);
            
            try {
                const suspensionStatus = await this.getPlayerSuspensionStatus(memberId, event.date);
                
                if (suspensionStatus.isSuspended) {
                    console.log('🚫 Player is suspended:', suspensionStatus);
                    await this.showSuspensionWarning(playerName, suspensionStatus);
                    return; // Don't allow check-in
                }
            } catch (error) {
                console.warn('Failed to check suspension status, allowing check-in:', error);
            }
        }
        
        console.log('🔧 Admin toggle attendance for:', { eventId, matchId, memberId, teamType });
        
        // Find the grid item for immediate UI update
        const gridItem = document.querySelector(`[onclick*="'${memberId}'"][onclick*="'${teamType}'"]`);
        const checkIcon = gridItem?.querySelector('.grid-check-icon');
        
        // Store original state for potential rollback
        const originalAttendees = [...attendeesArray];
        const wasCheckedIn = existingIndex >= 0;
        
        // UPDATE UI IMMEDIATELY for instant feedback
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
        
        // Update attendance counts immediately
        this.updateAttendanceCounts(match);
        
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
                        
                        // Update attendance counts after revert
                        this.updateAttendanceCounts(match);
                        
                        // Show suspension alert
                        const team = this.teams.find(t => t.id === (teamType === 'home' ? match.homeTeamId : match.awayTeamId));
                        const member = team?.members.find(m => m.id === memberId);
                        
                        alert(`❌ ${member?.name || 'Player'} is currently suspended and cannot be checked in.\n\n🚫 Active suspension: ${suspensionStatus.totalMatches} match${suspensionStatus.totalMatches > 1 ? 'es' : ''} remaining\n\n⚖️ This suspension must be served before the player can participate in matches.`);
                        
                        console.log('Reverted check-in due to suspension:', memberId);
                    }
                }
            }).catch(error => {
                console.error('Error checking suspension status:', error);
                // Don't revert on error - allow the check-in to stand
            });
        }
        
        // Save to server in background (don't await for UI responsiveness)
        fetch('/api/attendance', {
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
                bypass_lock: true // Main app has admin privileges to bypass lock
            })
        }).then(async response => {
            if (!response.ok) {
                // Handle specific error cases
                if (response.status === 423) {
                    // 423 Locked - attendance is locked for this match
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || 'Check-in is locked for this match');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        }).then(result => {
            console.log('Attendance updated successfully:', result);
            // Update the events display in the background (no modal refresh)
            this.renderEvents();
        }).catch(error => {
            console.error('Failed to save events:', error);
            
            // Revert the data and UI changes on error
            if (teamType === 'home') {
                match.homeTeamAttendees = originalAttendees;
            } else {
                match.awayTeamAttendees = originalAttendees;
            }
            
            // Revert UI changes
            if (gridItem) {
                if (wasCheckedIn) {
                    gridItem.classList.add('checked-in');
                } else {
                    gridItem.classList.remove('checked-in');
                }
            }
            
            alert(`Failed to update attendance: ${error.message}\n\nChanges have been reverted.`);
        });
        
        // Update current match reference
        this.currentMatch = match;
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
            
            // Use efficient attendance-only endpoint
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
                    throw new Error(errorData.message || 'Check-in is locked for this match');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Attendance updated successfully:', result);
            
            // Update the events display in the background (no modal refresh)
            this.renderEvents();
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
            
            alert(`Failed to update attendance: ${error.message}\
\
Changes have been reverted.`);
        }
    }
    
    // Modal Management
    createModal(title, content, cssClass = '') {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content ${cssClass}">
                <div class="modal-header">
                    <h2 class="modal-title">${title}</h2>
                    <button class="close-btn" onclick="app.closeModal()">&times;</button>
                </div>
                ${content}
            </div>
        `;
        
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
    
    // 🔄 GENERALIZED LOADING SYSTEM: Execute any action with loading feedback
    async executeWithLoading(action, options = {}) {
        const {
            message = 'Processing...',
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
                        Processing...
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
    
    // 🎯 Quick wrapper for button actions (most common use case)
    async handleButtonAction(button, action, message = 'Processing...') {
        return this.executeWithLoading(action, {
            button: button,
            message: message,
            showModal: false // Don't show modal for button actions, just button feedback
        });
    }
    
    // 🎯 Quick wrapper for modal actions (actions that open modals)
    async handleModalAction(action, message = 'Loading...') {
        return this.executeWithLoading(action, {
            message: message,
            showModal: true
        });
    }
    
    closeModal() {
        const wasMatchModal = this.currentModalType === 'match';
        
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.remove();
        });
        
        // Reset modal type
        this.currentModalType = null;
        
        // Refresh events display if we just closed a match modal
        if (wasMatchModal) {
            this.renderEvents();
        }
    }

    // Red Card Management Methods
    async renderRedCardManagement() {
        const container = document.getElementById('red-card-management-container');
        const filter = document.getElementById('suspension-filter')?.value || 'pending';
        
        try {
            container.innerHTML = '<div class="loading">Loading red card records...</div>';
            
            // Get all match cards, events, teams, and existing suspensions for the current season
            const [eventsResponse, currentSeasonResponse, teamsResponse, suspensionsResponse] = await Promise.all([
                fetch('/api/events'),
                fetch('/api/current-season'),
                fetch('/api/teams-no-photos'),
                fetch('/api/suspensions?status=all')
            ]);
            
            if (!eventsResponse.ok || !currentSeasonResponse.ok || !teamsResponse.ok || !suspensionsResponse.ok) {
                throw new Error('Failed to load data');
            }
            
            const events = await eventsResponse.json();
            const currentSeason = await currentSeasonResponse.json();
            const teams = await teamsResponse.json();
            const existingSuspensions = await suspensionsResponse.json();
            
            // Store teams for team name lookup
            this.teamsBasic = teams;
            
            // Get all red cards from current season
            const redCards = [];
            const yellowCardCounts = new Map(); // Track yellow cards per player
            
            events.forEach(event => {
                // Use helper function to determine event season
                const eventSeason = getEventSeason(event.date_epoch);
                if (eventSeason === currentSeason.season) {
                    event.matches?.forEach(match => {
                        match.cards?.forEach(card => {
                            if (card.cardType === 'red') {
                                // Find which team this player belongs to
                                let playerTeam = null;
                                for (const team of teams) {
                                    const member = team.members?.find(m => m.id === card.memberId);
                                    if (member) {
                                        playerTeam = team;
                                        break;
                                    }
                                }
                                
                                // Find team names for match display
                                const homeTeamData = teams.find(t => t.id === match.homeTeamId);
                                const awayTeamData = teams.find(t => t.id === match.awayTeamId);
                                
                                redCards.push({
                                    ...card,
                                    eventDate: epochToPacificDate(event.date_epoch),
                                    eventDate_epoch: event.date_epoch,
                                    eventName: event.name,
                                    matchId: match.id,
                                    matchInfo: {
                                        homeTeam: homeTeamData?.name || 'Unknown Team',
                                        awayTeam: awayTeamData?.name || 'Unknown Team',
                                        homeTeamId: match.homeTeamId,
                                        awayTeamId: match.awayTeamId
                                    },
                                    teamName: playerTeam?.name || 'Unknown Team',
                                    memberName: playerTeam?.members?.find(m => m.id === card.memberId)?.name || 'Unknown Player'
                                });
                            } else if (card.cardType === 'yellow') {
                                const playerId = card.memberId;
                                yellowCardCounts.set(playerId, (yellowCardCounts.get(playerId) || 0) + 1);
                            }
                        });
                    });
                }
            });
            
            // Find players with 3+ yellow cards (equivalent to red card)
            const yellowCardRedEquivalents = [];
            for (const [playerId, count] of yellowCardCounts.entries()) {
                if (count >= 3) {
                    // Find player details
                    let playerInfo = null;
                    for (const team of teams) {
                        const member = team.members?.find(m => m.id === playerId);
                        if (member) {
                            playerInfo = { ...member, teamName: team.name };
                            break;
                        }
                    }
                    
                    if (playerInfo) {
                        yellowCardRedEquivalents.push({
                            memberId: playerId,
                            memberName: playerInfo.name,
                            teamName: playerInfo.teamName,
                            yellowCardCount: count,
                            cardType: 'yellow-equivalent',
                            suspensionMatches: null,
                            eventDate: epochToPacificDate(Math.floor(Date.now() / 1000)), // Current date properly formatted
                            eventDate_epoch: Math.floor(Date.now() / 1000) // Current epoch timestamp
                        });
                    }
                }
            }
            
            // Combine red cards and yellow card equivalents
            const allSuspendableCards = [...redCards, ...yellowCardRedEquivalents];
            
            // Merge with existing suspension data
            allSuspendableCards.forEach(card => {
                // Find existing suspension for this member and card type
                const existingSuspension = existingSuspensions.find(suspension => 
                    suspension.memberId === card.memberId && 
                    ((card.cardType === 'red' && suspension.cardType === 'red') ||
                     (card.cardType === 'yellow-equivalent' && suspension.cardType === 'yellow_accumulation'))
                );
                
                if (existingSuspension) {
                    card.suspensionMatches = existingSuspension.suspensionEvents;
                    card.suspensionServed = existingSuspension.status === 'served';
                    card.suspensionId = existingSuspension.id;
                    card.eventsRemaining = existingSuspension.eventsRemaining;
                }
            });
            
            // Filter based on suspension status
            let filteredCards = [];
            const today = new Date().toISOString().split('T')[0];
            
            switch (filter) {
                case 'pending':
                    filteredCards = allSuspendableCards.filter(card => 
                        !card.suspensionMatches || card.suspensionMatches === null
                    );
                    break;
                case 'active':
                    filteredCards = allSuspendableCards.filter(card => 
                        card.suspensionMatches > 0 && !card.suspensionServed
                    );
                    break;
                case 'served':
                    filteredCards = allSuspendableCards.filter(card => 
                        card.suspensionMatches > 0 && card.suspensionServed
                    );
                    break;
                case 'all':
                default:
                    filteredCards = allSuspendableCards;
                    break;
            }
            
            // Sort by event date (newest first)
            filteredCards.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
            
            if (filteredCards.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <h3>No ${filter} red cards found</h3>
                        <p>There are currently no red cards that match the selected filter.</p>
                    </div>
                `;
                return;
            }
            
            // Store filtered cards for use in other functions
            this.currentRedCards = filteredCards;
            
            // Render red cards
            container.innerHTML = `
                <div class="red-card-summary">
                    <div class="summary-stat">
                        <div class="stat-number">${filteredCards.filter(c => c.cardType === 'red').length}</div>
                        <div class="stat-label">Direct Red Cards</div>
                    </div>
                    <div class="summary-stat">
                        <div class="stat-number">${filteredCards.filter(c => c.cardType === 'yellow-equivalent').length}</div>
                        <div class="stat-label">Yellow Card Accumulations</div>
                    </div>
                    <div class="summary-stat">
                        <div class="stat-number">${filteredCards.filter(c => !c.suspensionMatches).length}</div>
                        <div class="stat-label">Pending Suspensions</div>
                    </div>
                </div>
                
                <div class="red-cards-list">
                    ${filteredCards.map((card, index) => this.renderRedCardItem(card, index)).join('')}
                </div>
            `;
            
        } catch (error) {
            console.error('Error loading red card management:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Error Loading Data</h3>
                    <p>Failed to load red card records. Please try refreshing the page.</p>
                </div>
            `;
        }
    }
    
    renderRedCardItem(card, index) {
        const isYellowEquivalent = card.cardType === 'yellow-equivalent';
        const hasSuspension = card.suspensionMatches !== null && card.suspensionMatches !== undefined;
        const suspensionStatus = card.suspensionServed ? 'Served' : 'Active';
        
        return `
            <div class="red-card-item" data-card-index="${index}">
                <div class="red-card-header">
                    <div class="card-type-display ${isYellowEquivalent ? 'yellow-accumulation' : 'red'}">
                        ${isYellowEquivalent ? `🟨×${card.yellowCardCount} YELLOW ACCUMULATION` : '🟥 RED CARD'}
                    </div>
                    <div class="card-date">${new Date(card.eventDate).toLocaleDateString()}</div>
                </div>
                
                <div class="red-card-details">
                    <div class="player-info">
                        <div class="player-name">${card.memberName || 'Unknown Player'}</div>
                        <div class="team-name">${card.teamName || 'Unknown Team'}</div>
                    </div>
                    
                    ${card.eventName ? `<div class="event-info">Event: ${card.eventName}</div>` : ''}
                    ${card.matchInfo ? `<div class="match-info">Match: ${card.matchInfo.homeTeam} vs ${card.matchInfo.awayTeam}</div>` : ''}
                    ${card.reason ? `<div class="card-reason">Reason: ${card.reason}</div>` : ''}
                    ${card.notes ? `<div class="card-notes">Notes: ${card.notes}</div>` : ''}
                </div>
                
                <div class="suspension-controls">
                    ${!hasSuspension ? `
                        <div class="suspension-input-group">
                            <label class="suspension-label">Suspension Length:</label>
                            <div class="suspension-input-row">
                                <input type="number" class="suspension-input" 
                                       placeholder="Events" min="0" max="10" 
                                       data-card-index="${index}" data-field="suspensionMatches">
                                <span class="suspension-unit">events</span>
                                <button class="btn btn-apply-suspension" 
                                        onclick="app.applySuspension(${index})">Apply Suspension</button>
                            </div>
                        </div>
                    ` : `
                        <div class="suspension-status">
                            <div class="suspension-info">
                                <span class="suspension-length">${card.suspensionMatches} events suspension</span>
                                <span class="suspension-status-badge ${card.suspensionServed ? 'served' : 'active'}">
                                    ${suspensionStatus}
                                </span>
                            </div>
                            ${!card.suspensionServed ? `
                                <button class="btn btn-small btn-mark-served" 
                                        onclick="app.markSuspensionServed(${index})">Mark as Served</button>
                            ` : ''}
                        </div>
                    `}
                </div>
            </div>
        `;
    }
    
    async applySuspension(cardIndex) {
        const cardItem = document.querySelector(`[data-card-index="${cardIndex}"]`);
        const suspensionInput = cardItem.querySelector('[data-field="suspensionMatches"]');
        const suspensionMatches = parseInt(suspensionInput.value);
        
        if (!suspensionMatches || suspensionMatches < 1) {
            alert('Please enter a valid suspension length (1-10 events)');
            return;
        }
        
        if (suspensionMatches > 10) {
            alert('Maximum suspension length is 10 events');
            return;
        }
        
        // Get the card data from our stored array
        const cardData = this.currentRedCards[cardIndex];
        if (!cardData) {
            alert('Card data not found. Please refresh the page and try again.');
            return;
        }
        
        try {
            // Show loading state
            const applyButton = cardItem.querySelector('.btn-apply-suspension');
            const originalText = applyButton.textContent;
            applyButton.textContent = 'Applying...';
            applyButton.disabled = true;
            
            // Call the API to save the suspension
            const response = await fetch('/api/suspensions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    memberId: cardData.memberId,
                    cardType: cardData.cardType === 'yellow-equivalent' ? 'yellow_accumulation' : 'red',
                    cardSourceId: cardData.matchId || 'accumulation',
                    suspensionEvents: suspensionMatches,
                    notes: `Applied via Red Card Management for ${cardData.memberName} (${cardData.teamName})`
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save suspension');
            }
            
            const result = await response.json();
            alert(`Applied ${suspensionMatches} event suspension successfully`);
            
            // Clear cached suspension data so it gets refreshed
            this.cachedSuspensions = null;
            
            // Refresh the display to show updated status
            this.renderRedCardManagement();
            
        } catch (error) {
            console.error('Failed to apply suspension:', error);
            alert('Failed to apply suspension: ' + error.message);
            
            // Restore button state
            const applyButton = cardItem.querySelector('.btn-apply-suspension');
            if (applyButton) {
                applyButton.textContent = 'Apply Suspension';
                applyButton.disabled = false;
            }
        }
    }
    
    async markSuspensionServed(cardIndex) {
        const confirmed = await this.showConfirmDialog(
            'Mark Suspension as Served',
            'Are you sure you want to mark this suspension as served?',
            'Yes, Mark Served',
            'Cancel'
        );
        
        if (!confirmed) return;
        
        // Get the card data from our stored array
        const cardData = this.currentRedCards[cardIndex];
        if (!cardData || !cardData.suspensionId) {
            alert('Suspension data not found. Please refresh the page and try again.');
            return;
        }
        
        try {
            // Call the API to mark suspension as served
            const response = await fetch('/api/suspensions', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    suspensionId: cardData.suspensionId,
                    action: 'mark_served'
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update suspension');
            }
            
            const result = await response.json();
            alert('Suspension marked as served successfully');
            
            // Clear cached suspension data so it gets refreshed
            this.cachedSuspensions = null;
            
            // Refresh the display to show updated status
            this.renderRedCardManagement();
            
        } catch (error) {
            console.error('Failed to mark suspension as served:', error);
            alert('Failed to update suspension status: ' + error.message);
        }
    }

    // Suspension Status Checking Methods
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
            
            // Sum up all active suspension events remaining
            const totalEventsRemaining = activeSuspensions.reduce((total, suspension) => {
                return total + suspension.eventsRemaining;
            }, 0);
            
            return {
                isSuspended: true,
                suspensionType: activeSuspensions.length > 1 ? 'multiple' : activeSuspensions[0].cardType,
                totalMatches: totalEventsRemaining,
                suspensions: activeSuspensions,
                reason: `${activeSuspensions.length} active suspension${activeSuspensions.length > 1 ? 's' : ''}`,
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
            : `${playerName} is suspended due to a red card.\n\nSuspended until: ${suspensionInfo.suspendedUntilEventName || suspensionInfo.suspendedUntil}\nRemaining events: ${suspensionInfo.remainingEvents || 'Unknown'}\n\nThis player cannot be checked in during their suspension period.`;
        
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content suspension-warning-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">🚫 Player Suspended</h2>
                        <button class="close-btn" onclick="this.closest('.modal').remove(); resolve(false);">&times;</button>
                    </div>
                    <div class="suspension-warning-content">
                        <div class="warning-icon">⚠️</div>
                        <div class="warning-message">${warningMessage.replace(/\n/g, '<br>')}</div>
                    </div>
                    <div class="suspension-warning-actions">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); resolve(false);">
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
                    resolve(false);
                }
            }, 10000);
        });
    }
}

// Global functions for onclick handlers
async function showSection(sectionName) {
    await app.showSection(sectionName);
}

// Initialize app
const app = new CheckInApp();