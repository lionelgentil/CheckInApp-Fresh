/**
 * CheckIn App v4.7.5 - JavaScript Frontend
 * Works with PHP/PostgreSQL backend
 */

// Version constant - update this single location to change version everywhere
const APP_VERSION = '4.9.2';

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
    
    // 🚀 PERFORMANCE OPTIMIZATION: Initialize lazy loading system
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
            
            console.log('📈 Performance: Lazy loading initialized with IntersectionObserver');
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
            this.teams = await this.cachedFetch('/api/teams');
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
    
    async loadReferees() {
        try {
            this.referees = await this.cachedFetch('/api/referees');
        } catch (error) {
            console.error('Error loading referees:', error);
            this.referees = [];
        }
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
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    // 🚀 PERFORMANCE: Generate lazy-loading image HTML
    getLazyImageHtml(member, className = 'member-photo', style = '') {
        const photoUrl = this.getMemberPhotoUrl(member);
        const fallbackUrl = this.getGenderDefaultPhoto(member);
        
        // BASE64 FIX: Skip lazy loading for base64 images as they're already embedded data
        if (photoUrl.startsWith('data:image/')) {
            console.log('📸 Bypassing lazy loading for base64 image:', member.name);
            return `<img src="${photoUrl}" 
                         alt="${member.name}" 
                         class="${className}" 
                         ${style ? `style="${style}"` : ''}
                         loading="eager">`;
        }
        
        if (this.imageObserver) {
            // Use lazy loading with placeholder for non-base64 images
            const placeholder = '/api/photos?filename=default&gender=' + (member.gender || 'male');
            return `<img src="${placeholder}" 
                         data-lazy-src="${photoUrl}" 
                         data-fallback="${fallbackUrl}"
                         alt="${member.name}" 
                         class="${className} lazy" 
                         ${style ? `style="${style}"` : ''}
                         loading="lazy">`;
        } else {
            // Fallback to immediate loading
            return `<img src="${photoUrl}" 
                         alt="${member.name}" 
                         class="${className}" 
                         ${style ? `style="${style}"` : ''}
                         loading="lazy">`;
        }
    }
    
    // Get member photo URL with gender defaults
    getMemberPhotoUrl(member) {
        // DEBUG: Log photo data to understand what we're receiving
        console.log('🖼️ getMemberPhotoUrl called for member:', member.name, 'photo data:', member.photo);
        
        // Check if member has a real custom photo
        if (member.photo) {
            // Skip gender defaults
            if (member.photo.includes('male.svg') || 
                member.photo.includes('female.svg') || 
                member.photo.includes('default.svg')) {
                console.log('👤 Using gender default for:', member.name);
                return this.getGenderDefaultPhoto(member);
            }
            
            // Handle base64 images (for Railway deployment where filesystem is ephemeral)
            if (member.photo.startsWith('data:image/')) {
                console.log('📸 Using base64 photo for:', member.name);
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
                        console.log('🔗 Using API URL photo for:', member.name, 'URL:', member.photo);
                        // Return the full API URL without additional cache-busting to avoid corrupting the URL
                        return member.photo;
                    }
                }
            }
            
            // Check if it's a direct filename with valid extension
            if ((member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                member.photo.includes('.png') || member.photo.includes('.webp')) &&
                !member.photo.startsWith('/api/photos') && !member.photo.startsWith('http')) {
                console.log('📁 Converting filename to API URL for:', member.name, 'filename:', member.photo);
                // Convert filename to API URL without cache-busting to avoid corrupting URLs
                return `/api/photos?filename=${encodeURIComponent(member.photo)}`;
            }
            
            // Check if it's already a full HTTP URL with valid extension
            if (member.photo.startsWith('http') && 
                (member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                 member.photo.includes('.png') || member.photo.includes('.webp'))) {
                console.log('🌐 Using external URL photo for:', member.name);
                // Return external URLs without cache-busting to avoid corrupting them
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
            return 'photos/defaults/male.svg';
        } else if (member.gender === 'female') {
            return 'photos/defaults/female.svg';
        } else {
            // No gender specified, use male as default
            return 'photos/defaults/male.svg';
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
    
    isCurrentSeasonEvent(eventDate) {
        const currentSeason = this.getCurrentSeason();
        const event = new Date(eventDate);
        return event >= currentSeason.startDate && event <= currentSeason.endDate;
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
                // Ensure we have all data loaded for card tracking
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
    }
    
    renderTeams() {
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
                                <div class="team-actions">
                                    <button class="btn btn-small" onclick="app.showAddMemberModal('${selectedTeam.id}')" title="Add Member">+</button>
                                    ${selectedTeam.members.length > 0 ? `<button class="btn btn-small btn-captain" onclick="app.showCaptainModal('${selectedTeam.id}')" title="Set Captain">👑</button>` : ''}
                                    <button class="btn btn-small btn-secondary" onclick="app.editTeam('${selectedTeam.id}')" title="Edit Team">✏️</button>
                                    <button class="btn btn-small btn-danger" onclick="app.deleteTeam('${selectedTeam.id}')" title="Delete Team">🗑️</button>
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
                                        if (this.isCurrentSeasonEvent(event.date)) {
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
                                                <button class="btn btn-small btn-secondary" onclick="app.editMember('${selectedTeam.id}', '${member.id}')" title="Edit Member">✏️</button>
                                                <button class="btn btn-small btn-danger" onclick="app.deleteMember('${selectedTeam.id}', '${member.id}')" title="Delete Member">🗑️</button>
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
                                    <button class="btn btn-small" onclick="app.editMatch('${event.id}', '${match.id}')" title="Edit Match">✏️</button>
                                    <button class="btn btn-small btn-secondary" onclick="app.editMatchResult('${event.id}', '${match.id}')" title="Edit Result">🏆</button>
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
                <button class="btn" onclick="app.saveTeam()">${isEdit ? 'Update' : 'Create'} Team</button>
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
    
    // Member Management
    showAddMemberModal(teamId) {
        this.currentEditingMember = null;
        this.showMemberModal(teamId);
    }
    
    editMember(teamId, memberId) {
        const team = this.teams.find(t => t.id === teamId);
        this.currentEditingMember = team.members.find(m => m.id === memberId);
        this.showDetailedMemberModal(teamId, this.currentEditingMember);
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
                <button class="btn" onclick="app.saveMember('${teamId}')">${isEdit ? 'Update' : 'Add'} Member</button>
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
                
                const basicInfoChanged = (
                    originalName !== name ||
                    (originalJerseyNumber || null) !== (jerseyNumber ? parseInt(jerseyNumber) : null) ||
                    (originalGender || null) !== (gender || null)
                );
                
                // Update local data first
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
                
                // Use granular endpoint for basic info updates (much faster!)
                if (basicInfoChanged) {
                    console.log('🚀 Using granular API for member profile update');
                    await this.updateMemberProfile(teamId, this.currentEditingMember.id, {
                        name: name,
                        jerseyNumber: jerseyNumber ? parseInt(jerseyNumber) : null,
                        gender: gender || null
                    });
                }
                
            } else {
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
                await this.createMemberProfile(teamId, newMember);
                
                // Upload photo if provided
                if (photoFile) {
                    console.log('Uploading photo for new member:', newMember.id);
                    const photoUrl = await this.uploadPhoto(photoFile, newMember.id);
                    newMember.photo = photoUrl;
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
        console.log('📍 This should use granular API - if you see saveTeams() call, something is wrong!');
        
        if (!confirm('Are you sure you want to delete this member?')) {
            return;
        }
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) {
            console.error('Team not found:', teamId);
            return;
        }
        
        const memberToDelete = team.members.find(m => m.id === memberId);
        console.log('🎯 Found member to delete:', memberToDelete);
        
        try {
            // ✅ OPTIMIZED: Use granular API for deletion
            console.log('🚀 Using granular API for member deletion');
            await this.deleteMemberProfile(teamId, memberId);
            
            // Update local data
            const originalLength = team.members.length;
            team.members = team.members.filter(m => m.id !== memberId);
            console.log(`✅ Member removed from local array: ${originalLength} → ${team.members.length}`);
            
            // Refresh UI
            this.renderTeams();
            console.log('✅ UI refreshed after deletion');
            
        } catch (error) {
            console.error('❌ Error deleting member:', error);
            alert('Failed to delete member: ' + error.message);
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
    
    async showDetailedMemberModal(teamId, member) {
        const isMobile = this.isMobileDevice();
        const photoLabel = isMobile ? 'Take Photo' : 'Photo';
        
        // Load disciplinary records for this member
        let disciplinaryRecords = [];
        try {
            disciplinaryRecords = await this.fetch(`/api/disciplinary-records?member_id=${member.id}`);
            console.log('Loaded disciplinary records for member:', member.name, disciplinaryRecords);
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
                ${member.photo ? `<img src="${member.photo}" alt="Current photo" class="preview-image">` : ''}
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
                                    <option value="Unsporting behavior" ${record.reason === 'Unsporting behavior' ? 'selected' : ''}>Unsporting behavior</option>
                                    <option value="Dissent by word or action" ${record.reason === 'Dissent by word or action' ? 'selected' : ''}>Dissent by word or action</option>
                                    <option value="Persistent infringement" ${record.reason === 'Persistent infringement' ? 'selected' : ''}>Persistent infringement</option>
                                    <option value="Delaying the restart of play" ${record.reason === 'Delaying the restart of play' ? 'selected' : ''}>Delaying the restart of play</option>
                                    <option value="Failure to respect distance" ${record.reason === 'Failure to respect distance' ? 'selected' : ''}>Failure to respect distance</option>
                                    <option value="Entering/leaving without permission" ${record.reason === 'Entering/leaving without permission' ? 'selected' : ''}>Entering/leaving without permission</option>
                                    <option value="Sliding" ${record.reason === 'Sliding' ? 'selected' : ''}>Sliding</option>
                                    <option value="Reckless/aggressive challenge" ${record.reason === 'Reckless/aggressive challenge' ? 'selected' : ''}>Reckless/aggressive challenge</option>
                                    <option value="Denial of a goal scoring opportunity" ${record.reason === 'Denial of a goal scoring opportunity' ? 'selected' : ''}>Denial of a goal scoring opportunity</option>
                                    <option value="Stopping a promising attack" ${record.reason === 'Stopping a promising attack' ? 'selected' : ''}>Stopping a promising attack</option>
                                    <option value="Serious foul play" ${record.reason === 'Serious foul play' ? 'selected' : ''}>Serious foul play</option>
                                    <option value="Violent conduct" ${record.reason === 'Violent conduct' ? 'selected' : ''}>Violent conduct</option>
                                    <option value="Spitting" ${record.reason === 'Spitting' ? 'selected' : ''}>Spitting</option>
                                    <option value="Offensive/insulting language" ${record.reason === 'Offensive/insulting language' ? 'selected' : ''}>Offensive/insulting language</option>
                                    <option value="Second yellow card" ${record.reason === 'Second yellow card' ? 'selected' : ''}>Second yellow card</option>
                                </select>
                            </div>
                            <textarea class="form-input" placeholder="Additional Notes (optional)" data-record-index="${index}" data-field="notes" rows="2">${record.notes || ''}</textarea>
                            ${record.cardType === 'red' || (record.suspensionMatches !== null && record.suspensionMatches !== undefined) ? `
                                <div style="display: flex; gap: 10px; align-items: center; margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px; flex-wrap: wrap;">
                                    <label style="font-size: 0.85em; color: #856404; margin: 0;">Suspension:</label>
                                    <input type="number" class="form-input" style="width: 80px;" placeholder="Matches" data-record-index="${index}" data-field="suspensionMatches" value="${record.suspensionMatches || ''}" min="0" max="99">
                                    <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; color: #856404; margin: 0;">
                                        <input type="checkbox" data-record-index="${index}" data-field="suspensionServed" ${record.suspensionServed ? 'checked' : ''} onchange="app.toggleSuspensionServedDate(${index})">
                                        Served
                                    </label>
                                    <div id="served-date-section-${index}" style="display: ${record.suspensionServed ? 'flex' : 'none'}; align-items: center; gap: 4px;">
                                        <label style="font-size: 0.85em; color: #856404; margin: 0;">on:</label>
                                        <input type="date" class="form-input" style="width: 140px; padding: 4px 6px; font-size: 0.8em;" data-record-index="${index}" data-field="suspensionServedDate" value="${record.suspensionServedDate || ''}">
                                    </div>
                                </div>
                            ` : ''}
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
                <textarea class="form-input" placeholder="Additional Notes (optional)" data-record-index="${newIndex}" data-field="notes" rows="2"></textarea>
                <div id="suspension-section-${newIndex}" style="display: none; margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px;">
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <label style="font-size: 0.85em; color: #856404; margin: 0;">Suspension:</label>
                        <input type="number" class="form-input" style="width: 80px;" placeholder="Matches" data-record-index="${newIndex}" data-field="suspensionMatches" min="0" max="99">
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; color: #856404; margin: 0;">
                            <input type="checkbox" data-record-index="${newIndex}" data-field="suspensionServed" onchange="app.toggleSuspensionServedDate(${newIndex})">
                            Served
                        </label>
                        <div id="served-date-section-${newIndex}" style="display: none; align-items: center; gap: 4px;">
                            <label style="font-size: 0.85em; color: #856404; margin: 0;">on:</label>
                            <input type="date" class="form-input" style="width: 140px; padding: 4px 6px; font-size: 0.8em;" data-record-index="${newIndex}" data-field="suspensionServedDate">
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', recordHtml);
        
        // Update border color based on card type and show/hide suspension section
        const newRecord = container.lastElementChild;
        const cardTypeSelect = newRecord.querySelector('[data-field="cardType"]');
        const suspensionSection = newRecord.querySelector(`#suspension-section-${newIndex}`);
        
        cardTypeSelect.addEventListener('change', function() {
            const borderColor = this.value === 'yellow' ? '#ffc107' : '#dc3545';
            newRecord.style.borderLeftColor = borderColor;
            
            // Show suspension section for red cards
            if (this.value === 'red') {
                suspensionSection.style.display = 'block';
            } else {
                suspensionSection.style.display = 'none';
                // Clear suspension fields when hiding
                suspensionSection.querySelector('[data-field="suspensionMatches"]').value = '';
                suspensionSection.querySelector('[data-field="suspensionServed"]').checked = false;
                suspensionSection.querySelector('[data-field="suspensionServedDate"]').value = '';
                // Hide served date section
                const servedDateSection = suspensionSection.querySelector(`[id^="served-date-section-"]`);
                if (servedDateSection) servedDateSection.style.display = 'none';
            }
        });
    }
    
    toggleSuspensionServedDate(index) {
        const checkbox = document.querySelector(`[data-record-index="${index}"][data-field="suspensionServed"]`);
        const servedDateSection = document.getElementById(`served-date-section-${index}`);
        const dateField = document.querySelector(`[data-record-index="${index}"][data-field="suspensionServedDate"]`);
        
        if (checkbox && servedDateSection) {
            if (checkbox.checked) {
                servedDateSection.style.display = 'flex';
                // Set today's date as default if no date is set
                if (!dateField.value) {
                    dateField.value = new Date().toISOString().split('T')[0];
                }
            } else {
                servedDateSection.style.display = 'none';
                dateField.value = '';
            }
        }
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
        
        // Update member data
        member.name = name;
        member.jerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
        member.gender = gender || null;
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
            
            let suspensionMatches = null;
            let suspensionServed = false;
            let suspensionServedDate = null;
            
            // Only collect suspension data for red cards
            if (cardType === 'red') {
                const suspensionMatchesField = item.querySelector('[data-field="suspensionMatches"]');
                const suspensionServedField = item.querySelector('[data-field="suspensionServed"]');
                const suspensionServedDateField = item.querySelector('[data-field="suspensionServedDate"]');
                
                if (suspensionMatchesField && suspensionMatchesField.value) {
                    suspensionMatches = parseInt(suspensionMatchesField.value);
                }
                
                if (suspensionServedField) {
                    suspensionServed = suspensionServedField.checked;
                }
                
                // Only collect served date if suspension is marked as served
                if (suspensionServed && suspensionServedDateField && suspensionServedDateField.value) {
                    suspensionServedDate = suspensionServedDateField.value;
                }
            }
            
            if (cardType) {
                disciplinaryRecords.push({
                    cardType: cardType,
                    incidentDate: incidentDate || null,
                    reason: reason || null,
                    notes: notes || null,
                    suspensionMatches: suspensionMatches,
                    suspensionServed: suspensionServed,
                    suspensionServedDate: suspensionServedDate
                });
            }
        });
        
        console.log('Disciplinary records to save:', disciplinaryRecords);
        
        try {
            // Check if basic member info actually changed
            const originalName = this.currentEditingMember?.name;
            const originalJerseyNumber = this.currentEditingMember?.jerseyNumber;
            const originalGender = this.currentEditingMember?.gender;
            
            const basicInfoChanged = !photoFile && ( // Only check if no photo was uploaded
                originalName !== name ||
                (originalJerseyNumber || null) !== (jerseyNumber ? parseInt(jerseyNumber) : null) ||
                (originalGender || null) !== (gender || null)
            );
            
            // Only save teams if basic member info actually changed AND no photo was uploaded
            if (basicInfoChanged) {
                console.log('💾 saveDetailedMember: Basic member info changed, calling saveTeams()');
                await this.saveTeams();
            } else {
                console.log('✅ saveDetailedMember: No basic info changes or photo uploaded, skipping expensive saveTeams() call');
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
            this.closeModal();
        } catch (error) {
            console.error('Error in saveDetailedMember:', error);
            alert('Failed to save player information. Please try again.');
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
                <input type="date" class="form-input" id="event-date" value="${event ? event.date.split('T')[0] : ''}" required>
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
            // Edit existing event
            this.currentEditingEvent.name = name;
            this.currentEditingEvent.date = date;
            this.currentEditingEvent.description = description;
        } else {
            // Add new event
            const newEvent = {
                id: this.generateUUID(),
                name: name,
                date: date,
                description: description,
                matches: [],
                attendees: []
            };
            this.events.push(newEvent);
        }
        
        try {
            await this.saveEvents();
            this.renderEvents();
            this.closeModal();
        } catch (error) {
            alert('Failed to save event. Please try again.');
        }
    }
    
    async deleteEvent(eventId) {
        if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
            return;
        }
        
        this.events = this.events.filter(e => e.id !== eventId);
        
        try {
            await this.saveEvents();
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
        const cardRecords = [];
        
        // Create lookup maps for efficiency
        const teamLookup = new Map();
        const refereeLookup = new Map();
        
        this.teams.forEach(team => teamLookup.set(team.id, team));
        this.referees.forEach(referee => refereeLookup.set(referee.id, referee));
        
        // Process all events and matches
        this.events.forEach(event => {
            // Only include current season events
            if (!this.isCurrentSeasonEvent(event.date)) {
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
                    
                    cardRecords.push({
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
                                    ${card.cardType === 'yellow' ? '🟨' : '🟥'} ${card.cardType} card • ${card.eventName} • ${new Date(card.eventDate).toLocaleDateString()}
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
        if (this.teams.length < 2) {
            alert('You need at least 2 teams to create a match');
            return;
        }
        
        const modal = this.createModal('Add Match', `
            <div class="form-group">
                <label class="form-label">Home Team *</label>
                <select class="form-select" id="home-team" required>
                    <option value="">Select home team</option>
                    ${this.teams.map(team => `<option value="${team.id}">${team.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Away Team *</label>
                <select class="form-select" id="away-team" required>
                    <option value="">Select away team</option>
                    ${this.teams.map(team => `<option value="${team.id}">${team.name}</option>`).join('')}
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
        
        const newMatch = {
            id: this.generateUUID(),
            homeTeamId: homeTeamId,
            awayTeamId: awayTeamId,
            field: field || null,
            time: time || null,
            mainRefereeId: mainRefereeId || null,
            assistantRefereeId: assistantRefereeId || null,
            notes: notes,
            homeScore: null,
            awayScore: null,
            matchStatus: 'scheduled',
            homeTeamAttendees: [],
            awayTeamAttendees: [],
            cards: []
        };
        
        event.matches.push(newMatch);
        
        try {
            await this.saveEvents();
            this.renderEvents();
            this.closeModal();
        } catch (error) {
            alert('Failed to save match. Please try again.');
        }
    }
    
    async deleteMatch(eventId, matchId) {
        if (!confirm('Are you sure you want to delete this match?')) {
            return;
        }
        
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;
        
        event.matches = event.matches.filter(m => m.id !== matchId);
        
        try {
            await this.saveEvents();
            this.renderEvents();
        } catch (error) {
            alert('Failed to delete match. Please try again.');
        }
    }
    
    editMatch(eventId, matchId) {
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!match) return;
        
        // Load both teams and referees if not already loaded
        const needsTeams = this.teams.length === 0;
        const needsReferees = this.referees.length === 0;
        
        if (needsTeams || needsReferees) {
            const promises = [];
            if (needsTeams) promises.push(this.loadTeams());
            if (needsReferees) promises.push(this.loadReferees());
            
            Promise.all(promises).then(() => {
                this.showEditMatchModal(event, match);
            });
        } else {
            this.showEditMatchModal(event, match);
        }
    }
    
    showEditMatchModal(event, match) {
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        
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
                    <option value="09:00" ${(match.time === '09:00:00' || match.time === '09:00' || match.time === '9:00') ? 'selected' : ''}>9:00 AM</option>
                    <option value="11:00" ${(match.time === '11:00:00' || match.time === '11:00') ? 'selected' : ''}>11:00 AM</option>
                    <option value="13:00" ${(match.time === '13:00:00' || match.time === '13:00' || match.time === '1:00') ? 'selected' : ''}>1:00 PM</option>
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
        
        // Update match data
        match.field = field || null;
        match.time = time || null;
        match.mainRefereeId = mainRefereeId || null;
        match.assistantRefereeId = assistantRefereeId || null;
        match.notes = notes;
        
        try {
            await this.saveEvents();
            this.renderEvents();
            this.closeModal();
        } catch (error) {
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
                                            <label class="mobile-label">Additional Notes (Optional)</label>
                                            <input type="text" class="form-input-mobile" placeholder="Additional notes..." data-card-index="${index}" data-field="notes" value="${card.notes || ''}">
                                        </div>
                                        
                                        ${card.cardType === 'red' || (card.suspensionMatches !== null && card.suspensionMatches !== undefined) ? `
                                            <div class="suspension-section-mobile" id="suspension-section-${index}" style="margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                                                <div class="form-row-mobile-dual">
                                                    <div class="form-col-mobile">
                                                        <label class="mobile-label">Suspension Matches</label>
                                                        <input type="number" class="form-input-mobile" placeholder="0" data-card-index="${index}" data-field="suspensionMatches" value="${card.suspensionMatches || ''}" min="0" max="99">
                                                    </div>
                                                    <div class="form-col-mobile">
                                                        <label class="mobile-label">Served?</label>
                                                        <label style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
                                                            <input type="checkbox" data-card-index="${index}" data-field="suspensionServed" ${card.suspensionServed ? 'checked' : ''} onchange="app.toggleMatchSuspensionServedDate(${index})">
                                                            <span style="font-size: 0.9em;">Suspension served</span>
                                                        </label>
                                                    </div>
                                                </div>
                                                <div id="served-date-section-${index}" style="display: ${card.suspensionServed ? 'block' : 'none'}; margin-top: 12px;">
                                                    <label class="mobile-label">Date Served</label>
                                                    <input type="date" class="form-input-mobile" data-card-index="${index}" data-field="suspensionServedDate" value="${card.suspensionServedDate || ''}">
                                                </div>
                                            </div>
                                        ` : ''}
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
                        <label class="mobile-label">Additional Notes (Optional)</label>
                        <input type="text" class="form-input-mobile" placeholder="Additional notes..." data-card-index="${newIndex}" data-field="notes">
                    </div>
                    
                    <div class="suspension-section-mobile" id="suspension-section-${newIndex}" style="display: none; margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                        <div class="form-row-mobile-dual">
                            <div class="form-col-mobile">
                                <label class="mobile-label">Suspension Matches</label>
                                <input type="number" class="form-input-mobile" placeholder="0" data-card-index="${newIndex}" data-field="suspensionMatches" min="0" max="99">
                            </div>
                            <div class="form-col-mobile">
                                <label class="mobile-label">Served?</label>
                                <label style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
                                    <input type="checkbox" data-card-index="${newIndex}" data-field="suspensionServed" onchange="app.toggleMatchSuspensionServedDate(${newIndex})">
                                    <span style="font-size: 0.9em;">Suspension served</span>
                                </label>
                            </div>
                        </div>
                        <div id="served-date-section-${newIndex}" style="display: none; margin-top: 12px;">
                            <label class="mobile-label">Date Served</label>
                            <input type="date" class="form-input-mobile" data-card-index="${newIndex}" data-field="suspensionServedDate">
                        </div>
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
        const suspensionSection = document.getElementById(`suspension-section-${index}`);
        
        if (cardTypeSelect && cardHeader) {
            const cardType = cardTypeSelect.value;
            cardHeader.className = `card-type-display ${cardType}`;
            cardHeader.textContent = cardType === 'yellow' ? '🟨 YELLOW CARD' : '🟥 RED CARD';
            
            // Show/hide suspension section based on card type
            if (suspensionSection) {
                if (cardType === 'red') {
                    suspensionSection.style.display = 'block';
                } else {
                    suspensionSection.style.display = 'none';
                    // Clear suspension fields when hiding
                    const suspensionMatchesField = suspensionSection.querySelector('[data-field="suspensionMatches"]');
                    const suspensionServedField = suspensionSection.querySelector('[data-field="suspensionServed"]');
                    const suspensionServedDateField = suspensionSection.querySelector('[data-field="suspensionServedDate"]');
                    
                    if (suspensionMatchesField) suspensionMatchesField.value = '';
                    if (suspensionServedField) suspensionServedField.checked = false;
                    if (suspensionServedDateField) suspensionServedDateField.value = '';
                    
                    // Hide served date section
                    const servedDateSection = document.getElementById(`served-date-section-${index}`);
                    if (servedDateSection) servedDateSection.style.display = 'none';
                }
            }
        }
    }
    
    toggleMatchSuspensionServedDate(index) {
        const checkbox = document.querySelector(`[data-card-index="${index}"][data-field="suspensionServed"]`);
        const servedDateSection = document.getElementById(`served-date-section-${index}`);
        const dateField = document.querySelector(`[data-card-index="${index}"][data-field="suspensionServedDate"]`);
        
        if (checkbox && servedDateSection) {
            if (checkbox.checked) {
                servedDateSection.style.display = 'block';
                // Set today's date as default if no date is set
                if (!dateField.value) {
                    dateField.value = new Date().toISOString().split('T')[0];
                }
            } else {
                servedDateSection.style.display = 'none';
                dateField.value = '';
            }
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
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        
        if (!match) return;
        
        // Get form values
        const matchStatus = document.getElementById('match-status').value;
        const homeScore = document.getElementById('home-score').value;
        const awayScore = document.getElementById('away-score').value;
        const matchNotes = document.getElementById('match-notes').value.trim();
        
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
        
        cardItems.forEach((cardItem, index) => {
            const memberId = cardItem.querySelector('[data-field="memberId"]').value;
            const cardType = cardItem.querySelector('[data-field="cardType"]').value;
            const minute = cardItem.querySelector('[data-field="minute"]').value;
            const reason = cardItem.querySelector('[data-field="reason"]').value;
            const notes = cardItem.querySelector('[data-field="notes"]').value;
            
            // Collect suspension data for red cards
            let suspensionMatches = null;
            let suspensionServed = false;
            let suspensionServedDate = null;
            
            if (cardType === 'red') {
                const suspensionMatchesField = cardItem.querySelector('[data-field="suspensionMatches"]');
                const suspensionServedField = cardItem.querySelector('[data-field="suspensionServed"]');
                const suspensionServedDateField = cardItem.querySelector('[data-field="suspensionServedDate"]');
                
                if (suspensionMatchesField && suspensionMatchesField.value) {
                    suspensionMatches = parseInt(suspensionMatchesField.value);
                }
                
                if (suspensionServedField) {
                    suspensionServed = suspensionServedField.checked;
                }
                
                if (suspensionServed && suspensionServedDateField && suspensionServedDateField.value) {
                    suspensionServedDate = suspensionServedDateField.value;
                }
            }
            
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
                    notes: notes || null,
                    suspensionMatches: suspensionMatches,
                    suspensionServed: suspensionServed,
                    suspensionServedDate: suspensionServedDate
                });
            }
        });
        
        match.cards = cards;
        
        try {
            await this.saveEvents();
            this.renderEvents();
            this.closeModal();
        } catch (error) {
            alert('Failed to save match result. Please try again.');
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
        
        const modal = this.createModal(`Match: ${homeTeam.name} vs ${awayTeam.name}`, `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <p><strong>Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
                <p><strong>Status:</strong> ${statusDisplay}</p>
                ${match.field ? `<p><strong>Field:</strong> ${match.field}</p>` : ''}
                ${match.time ? `<p><strong>Time:</strong> ${match.time.substring(0, 5)}</p>` : ''}
                ${mainReferee ? `<p><strong>Referee:</strong> ${mainReferee.name}${assistantReferee ? `, ${assistantReferee.name}` : ''}</p>` : ''}
                ${match.notes ? `<p><strong>Notes:</strong> ${match.notes}</p>` : ''}
            </div>
            
            ${scoreSection}
            ${cardsSection}
            
            <!-- Team Selector for Grid View - Horizontal Layout -->
            <div style="margin-bottom: 15px;">
                <div id="grid-view-controls" style="display: flex; justify-content: center; gap: 30px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600;">
                        <input type="radio" name="grid-team-toggle" value="home" checked onchange="app.toggleGridTeam('home')">
                        <span>${homeTeam.name}</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600;">
                        <input type="radio" name="grid-team-toggle" value="away" onchange="app.toggleGridTeam('away')">
                        <span>${awayTeam.name}</span>
                    </label>
                </div>
            </div>
            
            <!-- ECNL-Style Grid Check-In View -->
            <div id="grid-checkin-view" style="display: block;">
                <div id="grid-home-team" style="display: block;">
                    <div style="background: ${homeTeam.colorData}; color: white; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; text-align: center;">
                        <h4 style="margin: 0; font-size: 1em; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${homeTeam.name} Check-In</h4>
                        <div style="font-size: 0.8em; opacity: 0.9; margin-top: 2px;">Tap players to check them in</div>
                    </div>
                    <div id="grid-pagination-info-home" style="text-align: center; margin-bottom: 10px; color: #666; font-size: 0.85em;"></div>
                    <div id="grid-container-home" class="player-grid-container"></div>
                    <div id="grid-pagination-home" style="text-align: center; margin-top: 10px;"></div>
                </div>
                
                <div id="grid-away-team" style="display: none;">
                    <div style="background: ${awayTeam.colorData}; color: white; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; text-align: center;">
                        <h4 style="margin: 0; font-size: 1em; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${awayTeam.name} Check-In</h4>
                        <div style="font-size: 0.8em; opacity: 0.9; margin-top: 2px;">Tap players to check them in</div>
                    </div>
                    <div id="grid-pagination-info-away" style="text-align: center; margin-bottom: 10px; color: #666; font-size: 0.85em;"></div>
                    <div id="grid-container-away" class="player-grid-container"></div>
                    <div id="grid-pagination-away" style="text-align: center; margin-top: 10px;"></div>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
            </div>
        `);
        
        // LOADING SPINNER: Close loading modal before showing the main modal
        this.closeLoadingModal();
        
        document.body.appendChild(modal);
        
        // Initialize grid view
        this.initializeGridView(eventId, matchId, homeTeam, awayTeam, match);
        
        // Load lifetime cards for all players in the match
        this.loadLifetimeCardsForMatch(homeTeam, awayTeam);
        
        } catch (error) {
            console.error('Error in viewMatch:', error);
            this.closeLoadingModal();
            alert('Failed to load match details. Please try again.');
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
    
    // Toggle between home and away team in grid view
    toggleGridTeam(teamType) {
        this.currentGridTeam = teamType;
        this.currentGridPage = 0; // Reset to first page
        
        const homeTeamDiv = document.getElementById('grid-home-team');
        const awayTeamDiv = document.getElementById('grid-away-team');
        
        if (teamType === 'home') {
            homeTeamDiv.style.display = 'block';
            awayTeamDiv.style.display = 'none';
        } else {
            homeTeamDiv.style.display = 'none';
            awayTeamDiv.style.display = 'block';
        }
        
        this.renderGridTeam(teamType);
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
        this.saveEvents().then(() => {
            console.log('Events saved successfully');
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
            console.log('Saving events...');
            await this.saveEvents();
            console.log('Events saved successfully');
            
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
    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
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
}

// Global functions for onclick handlers
async function showSection(sectionName) {
    await app.showSection(sectionName);
}

// Initialize app
const app = new CheckInApp();