/**
 * CheckIn App Core v4.9.2 - Shared Functionality
 * Common utilities and components shared between main and view apps
 */

// Version constant - shared across all apps
const CORE_VERSION = '4.9.2';

/**
 * Base class with shared functionality for CheckIn apps
 */
class CheckInCore {
    constructor() {
        this.apiCache = new Map();
        this.currentModalType = null;
        this.cardCharts = {};
    }

    // =====================================
    // ERROR HANDLING UTILITIES (Item 11)
    // =====================================

    /**
     * Centralized error handler with consistent user messaging
     */
    handleError(error, context = '', showToUser = true) {
        const errorId = Date.now().toString(36);
        const errorInfo = {
            id: errorId,
            message: error.message || 'Unknown error',
            context: context,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };

        // Log detailed error for debugging
        console.error(`[${errorId}] Error in ${context}:`, errorInfo);

        if (showToUser) {
            this.showUserFriendlyError(error, context);
        }

        return errorId;
    }

    /**
     * Show user-friendly error messages
     */
    showUserFriendlyError(error, context) {
        let userMessage = 'An unexpected error occurred.';
        
        if (error.message?.includes('Network error')) {
            userMessage = 'Network connection issue. Please check your internet connection and try again.';
        } else if (error.message?.includes('401')) {
            userMessage = 'Your session has expired. Please refresh the page to re-authenticate.';
        } else if (error.message?.includes('Failed to fetch')) {
            userMessage = 'Unable to connect to the server. Please try again in a moment.';
        } else if (context) {
            userMessage = `Error ${context.toLowerCase()}. Please try again.`;
        }

        alert(userMessage);
    }

    /**
     * Async operation wrapper with consistent error handling
     */
    async safeAsyncOperation(operation, context = '', showErrorToUser = true) {
        try {
            return await operation();
        } catch (error) {
            this.handleError(error, context, showErrorToUser);
            throw error;
        }
    }

    // =====================================
    // API AND SESSION MANAGEMENT
    // =====================================

    /**
     * Centralized API request handler with session management
     */
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
                throw new Error('Network error - please check your connection');
            }
            throw error;
        }
    }

    /**
     * Handle session expiration with user-friendly messaging
     */
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

    /**
     * Cached fetch with automatic error handling
     */
    async cachedFetch(url, cacheDurationMs = 300000, bustCache = false) {
        const cacheKey = url;
        const now = Date.now();
        
        // Check cache first
        if (!bustCache && this.apiCache.has(cacheKey)) {
            const cached = this.apiCache.get(cacheKey);
            if (now - cached.timestamp < cacheDurationMs) {
                console.log('📦 Using cached data for:', url);
                return cached.data;
            }
        }
        
        return this.safeAsyncOperation(async () => {
            const cacheTimestamp = now;
            const response = await fetch(url);
            
            if (response.status === 401) {
                console.warn('🔐 Session expired (401), redirecting to re-authenticate...');
                this.handleSessionExpired();
                return;
            }
            
            if (response.ok) {
                const data = await response.json();
                
                // Cache the response
                this.apiCache.set(cacheKey, {
                    data: data,
                    timestamp: cacheTimestamp
                });
                
                console.log('🔄 Fetched and cached:', url);
                return data;
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }, `fetching data from ${url}`);
    }

    /**
     * Clear API cache
     */
    clearCache() {
        this.apiCache.clear();
        console.log('🧹 API cache cleared');
    }

    // =====================================
    // MODAL MANAGEMENT
    // =====================================

    /**
     * Create modal with consistent styling and behavior
     */
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

    /**
     * Show loading modal with consistent styling
     */
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

    /**
     * Close loading modal
     */
    closeLoadingModal() {
        const loadingModal = document.getElementById('loading-modal');
        if (loadingModal) {
            loadingModal.remove();
        }
    }

    /**
     * Close all modals
     */
    closeModal() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.remove();
        });
        
        this.currentModalType = null;
    }

    // =====================================
    // PHOTO MANAGEMENT
    // =====================================

    /**
     * Get member photo URL with gender defaults and consistent fallbacks
     */
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

    /**
     * Helper method for gender defaults
     */
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

    /**
     * Upload photo with consistent error handling
     */
    async uploadPhoto(file, memberId) {
        return this.safeAsyncOperation(async () => {
            console.log('uploadPhoto called with:', { fileName: file.name, fileSize: file.size, memberId });
            
            if (!file || !memberId) {
                throw new Error('File and member ID are required');
            }
            
            const formData = new FormData();
            formData.append('photo', file);
            formData.append('member_id', memberId);
            
            console.log('Sending photo upload request to /api/photos');
            
            const result = await this.apiRequest('/api/photos', {
                method: 'POST',
                body: formData
            });
            
            console.log('Photo upload result:', result);
            
            // Don't add cache-busting to base64 data, only to URL endpoints
            let photoUrl = result.url;
            if (photoUrl && !photoUrl.startsWith('data:image/')) {
                // Only add cache-busting to API URLs, not base64 data
                photoUrl = photoUrl + (photoUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
            }
            
            return photoUrl;
        }, 'uploading photo');
    }

    // =====================================
    // SEASON MANAGEMENT
    // =====================================

    /**
     * Get current season information
     */
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

    /**
     * Check if event date is in current season
     */
    isCurrentSeasonEvent(eventDate) {
        const currentSeason = this.getCurrentSeason();
        const event = new Date(eventDate);
        return event >= currentSeason.startDate && event <= currentSeason.endDate;
    }

    // =====================================
    // UTILITY METHODS
    // =====================================

    /**
     * Check if device is mobile
     */
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Generate UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Debounce function for performance optimization
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function for performance optimization  
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CheckInCore, CORE_VERSION };
}