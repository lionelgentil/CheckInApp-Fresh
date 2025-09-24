// CheckIn App - Manager Portal JavaScript
// Version 6.5.0 - Manager-specific functionality

// Don't redeclare APP_VERSION if it already exists
if (typeof APP_VERSION === 'undefined') {
    const APP_VERSION = '6.5.0';
}

class CheckInManagerApp {
    constructor() {
        this.teams = [];
        this.teamManagers = [];
        this.events = [];
        this.referees = [];
        
        // Use current season if function exists, otherwise use current year
        this.currentSeason = typeof getCurrentSeason === 'function' ? getCurrentSeason() : new Date().getFullYear() + '-Fall';
        
        // Initialize app
        this.init();
    }
    
    async init() {
        try {
            console.log('Initializing manager app...');
            
            // Load initial data
            await Promise.all([
                this.loadTeams(),
                this.loadTeamManagers(),
                this.loadEvents(),
                this.loadReferees()
            ]);
            
            console.log('Data loaded successfully');
            
            // Render initial section
            this.showSection('teams');
        } catch (error) {
            console.error('Failed to initialize manager app:', error);
            this.showError('Failed to load application data. Please refresh the page.');
        }
    }
    
    // Data loading methods
    async loadTeams() {
        try {
            console.log('Loading teams...');
            const response = await fetch('/api/teams');
            console.log('Teams response status:', response.status);
            if (!response.ok) throw new Error('Failed to load teams');
            this.teams = await response.json();
            console.log('Loaded teams:', this.teams.length);
        } catch (error) {
            console.error('Error loading teams:', error);
            throw error;
        }
    }
    
    async loadTeamManagers() {
        try {
            const response = await fetch('/api/team-managers');
            if (!response.ok) throw new Error('Failed to load team managers');
            this.teamManagers = await response.json();
        } catch (error) {
            console.error('Error loading team managers:', error);
            // Don't throw - managers might not exist yet
            this.teamManagers = [];
        }
    }
    
    async loadEvents() {
        try {
            const response = await fetch('/api/events');
            if (!response.ok) throw new Error('Failed to load events');
            this.events = await response.json();
        } catch (error) {
            console.error('Error loading events:', error);
            throw error;
        }
    }
    
    async loadReferees() {
        try {
            const response = await fetch('/api/referees');
            if (!response.ok) throw new Error('Failed to load referees');
            this.referees = await response.json();
        } catch (error) {
            console.error('Error loading referees:', error);
            this.referees = [];
        }
    }
    
    // Navigation
    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const navBtn = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
        if (navBtn) navBtn.classList.add('active');
        
        // Update content sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        const section = document.getElementById(`${sectionName}-section`);
        if (section) section.classList.add('active');
        
        // Render section content
        switch (sectionName) {
            case 'teams':
                this.renderTeams();
                break;
            case 'standings':
                this.renderStandings();
                break;
            case 'cards':
                this.renderCardTracker();
                break;
            case 'game-tracker':
                this.renderGameTracker();
                break;
        }
    }
    
    // Helper function to generate mailto links for managers
    generateManagerEmailLink(category = null) {
        let emails = [];
        
        if (category) {
            // Get emails for managers of teams in specific category
            const teamsInCategory = this.teams.filter(team => (team.category || 'Other') === category);
            const teamIds = teamsInCategory.map(team => team.id);
            emails = this.teamManagers
                .filter(manager => teamIds.includes(manager.team_id) && manager.email_address)
                .map(manager => manager.email_address);
        } else {
            // Get all manager emails
            emails = this.teamManagers
                .filter(manager => manager.email_address)
                .map(manager => manager.email_address);
        }
        
        // Remove duplicates
        emails = [...new Set(emails)];
        
        if (emails.length === 0) {
            return null;
        }
        
        return `mailto:${emails.join(',')}`;
    }
    
    // Teams section rendering
    renderTeams() {
        const container = document.getElementById('teams-container');
        
        if (this.teams.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>No teams found</h3><p>No teams are currently available.</p></div>';
            return;
        }
        
        // Group teams by category
        const teamsByCategory = {};
        this.teams.forEach(team => {
            const category = team.category || 'Other';
            if (!teamsByCategory[category]) {
                teamsByCategory[category] = [];
            }
            teamsByCategory[category].push(team);
        });
        
        let html = '';
        
        // Add "Email All Managers" link at the top
        const allManagersEmailLink = this.generateManagerEmailLink();
        if (allManagersEmailLink) {
            html += `
                <div class="email-all-managers" style="text-align: center; margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2196F3;">
                    <a href="${allManagersEmailLink}" style="color: #2196F3; text-decoration: none; font-weight: 600; font-size: 16px;">
                        📧 Email All Managers
                    </a>
                </div>
            `;
        }
        
        // Render each category
        Object.keys(teamsByCategory).sort().forEach(category => {
            const teams = teamsByCategory[category];
            const categoryEmailLink = this.generateManagerEmailLink(category);
            
            html += `
                <div class="category-section">
                    <div class="category-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 class="category-title" style="margin: 0;">${category}</h3>
                        ${categoryEmailLink ? `
                            <a href="${categoryEmailLink}" style="color: #2196F3; text-decoration: none; font-weight: 600; font-size: 14px;">
                                📧 Email ${category} Managers
                            </a>
                        ` : ''}
                    </div>
                    <div class="teams-grid">
            `;
            
            teams.forEach(team => {
                const teamManagers = this.teamManagers.filter(m => m.team_id === team.id);
                const captain = team.members?.find(m => m.captain) || null;
                
                html += this.renderTeamCard(team, teamManagers, captain);
            });
            
            html += `
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
    
    renderTeamCard(team, managers, captain) {
        const memberCount = team.members ? team.members.length : 0;
        const managerDisplay = this.renderManagerDisplay(managers);
        
        return `
            <div class="team-card" data-team-id="${team.id}">
                <div class="team-header">
                    <div class="team-info">
                        <h4 class="team-name">${team.name}</h4>
                        <div class="team-category">${team.category || 'N/A'}</div>
                        ${captain ? `<div class="team-captain">👑 Captain: ${captain.name}</div>` : ''}
                        ${managerDisplay}
                    </div>
                    <div class="team-actions">
                        <button class="btn btn-small" onclick="app.showTeamDetails('${team.id}')" title="View Team Details">
                            👥
                        </button>
                        <button class="btn btn-small" onclick="app.showManagerDialog('${team.id}')" title="Manage Team Managers">
                            💼
                        </button>
                    </div>
                </div>
                
                <div class="team-stats">
                    <span class="member-count">${memberCount} players</span>
                    <span class="manager-count">${managers.length} managers</span>
                </div>
            </div>
        `;
    }
    
    renderManagerDisplay(managers) {
        if (managers.length === 0) {
            return '<div class="team-managers"><em>💼 No managers assigned</em></div>';
        }
        
        return managers.map(manager => 
            `<div class="team-managers">💼 ${manager.first_name} ${manager.last_name}</div>`
        ).join('');
    }
    
    // Manager dialog functionality - clear existing modals first
    showManagerDialog(teamId) {
        // Close any existing modals to prevent stacking
        document.querySelectorAll('.modal').forEach(modal => modal.remove());
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        const teamManagers = this.teamManagers.filter(m => m.team_id === teamId);
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">💼 ${team.name} - Team Managers</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div class="managers-list" id="managers-list-${teamId}">
                        ${this.renderManagersList(teamManagers, teamId)}
                    </div>
                    
                    <div class="add-manager-section">
                        <button class="btn" onclick="app.showAddManagerForm('${teamId}')">
                            ➕ Add Manager
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    renderManagersList(managers, teamId) {
        if (managers.length === 0) {
            return '<div class="empty-state"><p>No managers assigned to this team.</p></div>';
        }
        
        return managers.map(manager => `
            <div class="manager-item" data-manager-id="${manager.id}">
                <div class="manager-info">
                    <div class="manager-name" onclick="app.showManagerProfile(${manager.id})" style="cursor: pointer; color: #2196F3;">${manager.first_name} ${manager.last_name}</div>
                    <div class="manager-contact">
                        ${manager.phone_number ? `<div class="contact-line">📞 <a href="tel:${manager.phone_number}" style="color: #2196F3; text-decoration: none;">${manager.phone_number}</a></div>` : ''}
                        ${manager.email_address ? `<div class="contact-line">📧 <a href="mailto:${manager.email_address}" style="color: #2196F3; text-decoration: none;">${manager.email_address}</a></div>` : ''}
                        ${!manager.phone_number && !manager.email_address ? '<div class="contact-line">No contact info</div>' : ''}
                    </div>
                </div>
                <div class="manager-actions">
                    <button class="btn btn-small" onclick="app.editManager(${manager.id})" title="Edit Manager">
                        ✏️
                    </button>
                    <button class="btn btn-small" onclick="app.deleteManager(${manager.id}, '${teamId}')" title="Remove Manager">
                        🗑️
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    // Add manager form - clear existing modals first
    showAddManagerForm(teamId) {
        // Close any existing modals to prevent stacking
        document.querySelectorAll('.modal').forEach(modal => modal.remove());
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Add Manager - ${team.name}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <form id="add-manager-form" onsubmit="app.saveNewManager(event, '${teamId}')">
                        <div class="form-group">
                            <label>First Name *</label>
                            <input type="text" name="first_name" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Last Name *</label>
                            <input type="text" name="last_name" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" name="phone_number" placeholder="555-555-5555" maxlength="12" oninput="app.formatPhoneNumber(this)">
                        </div>
                        
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" name="email_address">
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                            <button type="submit" class="btn">Add Manager</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // Form validation for manager data
    validateManagerForm(formData) {
        const errors = [];
        
        // Required fields
        if (!formData.get('first_name')?.trim()) {
            errors.push('First name is required');
        }
        
        if (!formData.get('last_name')?.trim()) {
            errors.push('Last name is required');
        }
        
        // Phone number validation (if provided)
        const phoneNumber = formData.get('phone_number')?.trim();
        if (phoneNumber) {
            // Enforce XXX-XXX-XXXX format
            const phoneRegex = /^\d{3}-\d{3}-\d{4}$/;
            if (!phoneRegex.test(phoneNumber)) {
                errors.push('Phone number must be in format: 555-555-5555');
            }
        }
        
        // Email validation (if provided)
        const email = formData.get('email_address')?.trim();
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errors.push('Please enter a valid email address');
            }
        }
        
        return errors;
    }
    
    // Show validation errors to user in the correct modal
    showValidationErrors(errors) {
        const errorHtml = `
            <div class="form-errors" style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #f5c6cb;">
                <div class="error-title" style="font-weight: 600; margin-bottom: 10px;">Please fix the following errors:</div>
                <ul style="margin: 0; padding-left: 20px;">
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
        `;
        
        // Remove any existing error display
        const existingErrors = document.querySelector('.form-errors');
        if (existingErrors) {
            existingErrors.remove();
        }
        
        // Find the currently active modal and add errors to its modal body
        const activeModals = document.querySelectorAll('.modal');
        const currentModal = Array.from(activeModals).pop(); // Get the top-most modal
        if (currentModal) {
            const modalBody = currentModal.querySelector('.modal-body');
            modalBody.insertAdjacentHTML('afterbegin', errorHtml);
        }
    }
    
    // Format phone number as user types
    formatPhoneNumber(input) {
        // Remove all non-numeric characters
        let value = input.value.replace(/\D/g, '');
        
        // Format as XXX-XXX-XXXX
        if (value.length >= 6) {
            value = `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6, 10)}`;
        } else if (value.length >= 3) {
            value = `${value.slice(0, 3)}-${value.slice(3)}`;
        }
        
        input.value = value;
    }
    
    async saveNewManager(event, teamId) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        
        // Validate form data
        const validationErrors = this.validateManagerForm(formData);
        if (validationErrors.length > 0) {
            this.showValidationErrors(validationErrors);
            return;
        }
        
        const managerData = {
            team_id: teamId,
            first_name: formData.get('first_name'),
            last_name: formData.get('last_name'),
            phone_number: formData.get('phone_number') || null,
            email_address: formData.get('email_address') || null
        };
        
        try {
            const response = await fetch('/api/team-managers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(managerData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create manager');
            }
            
            const newManager = await response.json();
            
            // Update local data
            this.teamManagers.push(newManager);
            
            // Close modal
            form.closest('.modal').remove();
            
            // Refresh teams display
            this.renderTeams();
            
            // Show the updated manager dialog
            this.showManagerDialog(teamId);
            
            this.showSuccess('Manager added successfully!');
            
        } catch (error) {
            console.error('Error creating manager:', error);
            this.showError('Failed to add manager: ' + error.message);
        }
    }
    
    // Edit manager
    editManager(managerId) {
        const manager = this.teamManagers.find(m => m.id === managerId);
        if (!manager) return;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Edit Manager - ${manager.team_name || 'Team'}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <form id="edit-manager-form" onsubmit="app.saveEditManager(event, ${managerId})">
                        <div class="form-group">
                            <label>First Name *</label>
                            <input type="text" name="first_name" value="${manager.first_name}" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Last Name *</label>
                            <input type="text" name="last_name" value="${manager.last_name}" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" name="phone_number" value="${manager.phone_number || ''}" placeholder="555-555-5555" maxlength="12" oninput="app.formatPhoneNumber(this)">
                        </div>
                        
                        <div class="form-group">
                            <label>Email Address</label>
                            <input type="email" name="email_address" value="${manager.email_address || ''}">
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                            <button type="submit" class="btn">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    async saveEditManager(event, managerId) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        
        // Validate form data
        const validationErrors = this.validateManagerForm(formData);
        if (validationErrors.length > 0) {
            this.showValidationErrors(validationErrors);
            return;
        }
        
        const managerData = {
            first_name: formData.get('first_name'),
            last_name: formData.get('last_name'),
            phone_number: formData.get('phone_number') || null,
            email_address: formData.get('email_address') || null
        };
        
        try {
            const response = await fetch(`/api/team-managers/${managerId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(managerData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update manager');
            }
            
            const updatedManager = await response.json();
            
            // Update local data
            const index = this.teamManagers.findIndex(m => m.id === managerId);
            if (index !== -1) {
                this.teamManagers[index] = updatedManager;
            }
            
            // Get the team ID for reopening the manager dialog
            const teamId = updatedManager.team_id;
            
            // Close modal
            form.closest('.modal').remove();
            
            // Refresh teams display
            this.renderTeams();
            
            // Reopen the manager dialog to show updated information
            this.showManagerDialog(teamId);
            
            this.showSuccess('Manager updated successfully!');
            
        } catch (error) {
            console.error('Error updating manager:', error);
            this.showError('Failed to update manager: ' + error.message);
        }
    }
    
    // Delete manager
    async deleteManager(managerId, teamId) {
        const manager = this.teamManagers.find(m => m.id === managerId);
        if (!manager) return;
        
        if (!confirm(`Are you sure you want to remove ${manager.first_name} ${manager.last_name} as a manager?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/team-managers/${managerId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete manager');
            }
            
            // Update local data
            this.teamManagers = this.teamManagers.filter(m => m.id !== managerId);
            
            // Refresh the manager dialog
            const managersListElement = document.getElementById(`managers-list-${teamId}`);
            if (managersListElement) {
                const teamManagers = this.teamManagers.filter(m => m.team_id === teamId);
                managersListElement.innerHTML = this.renderManagersList(teamManagers, teamId);
            }
            
            // Refresh teams display
            this.renderTeams();
            
            this.showSuccess('Manager removed successfully!');
            
        } catch (error) {
            console.error('Error deleting manager:', error);
            this.showError('Failed to remove manager: ' + error.message);
        }
    }
    
    // Manager profile view-only mode
    showManagerProfile(managerId) {
        const manager = this.teamManagers.find(m => m.id === managerId);
        if (!manager) return;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">👤 Manager Profile</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div class="profile-info">
                        <div class="profile-section">
                            <h4>Personal Information</h4>
                            <p><strong>Name:</strong> ${manager.first_name} ${manager.last_name}</p>
                            <p><strong>Team:</strong> ${manager.team_name || 'Unknown'}</p>
                        </div>
                        
                        <div class="profile-section">
                            <h4>Contact Information</h4>
                            <p><strong>Phone:</strong> ${manager.phone_number || 'Not provided'}</p>
                            <p><strong>Email:</strong> ${manager.email_address || 'Not provided'}</p>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                        <button type="button" class="btn" onclick="this.closest('.modal').remove(); app.editManager(${managerId})">Edit Manager</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // Team details view
    showTeamDetails(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        // Calculate gender breakdown
        const members = team.members || [];
        const maleCount = members.filter(m => m.gender === 'male').length;
        const femaleCount = members.filter(m => m.gender === 'female').length;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3 class="modal-title">${team.name} - Team Details</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div class="team-details">
                        <div class="detail-section">
                            <h4>Team Information</h4>
                            <p><strong>Category:</strong> ${team.category || 'N/A'}</p>
                            <p><strong>Total Players:</strong> ${members.length}</p>
                            <p><strong>Males:</strong> ${maleCount}</p>
                            <p><strong>Females:</strong> ${femaleCount}</p>
                        </div>
                        
                        <div class="detail-section">
                            <h4>Player Roster</h4>
                            <div class="players-list">
                                ${this.renderPlayersList(members)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    renderPlayersList(members) {
        if (members.length === 0) {
            return '<p>No players registered for this team.</p>';
        }
        
        return `
            <div class="players-grid">
                ${members.map(member => `
                    <div class="player-card ${member.gender || 'male'}">
                        <div class="player-photo">
                            <img src="${this.getPlayerPhotoUrl(member)}" alt="${member.name}" class="player-avatar" loading="lazy">
                        </div>
                        <div class="player-info">
                            <div class="player-name">${member.name}${member.captain ? ' 👑' : ''}</div>
                            <div class="player-details">
                                ${member.jersey_number ? `#${member.jersey_number}` : 'No #'} • 
                                ${member.gender || 'N/A'}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Get player photo URL with fallback to default
    getPlayerPhotoUrl(member) {
        // Debug: Log what photo data we're receiving
        console.log('🖼️ getPlayerPhotoUrl for:', member.name, 'photo:', member.photo, 'photo_filename:', member.photo_filename);
        
        // Check for custom photo in main photo field
        if (member.photo) {
            if (member.photo.startsWith('data:image/')) {
                console.log('✅ Using base64 photo');
                return member.photo;
            }
            if (member.photo.startsWith('/photos/')) {
                console.log('✅ Using direct photo URL');
                return member.photo;
            }
            if ((member.photo.includes('.jpg') || member.photo.includes('.jpeg') || 
                member.photo.includes('.png') || member.photo.includes('.webp')) &&
                !member.photo.startsWith('/photos/')) {
                console.log('✅ Converting filename to /photos/ URL');
                return `/photos/${member.photo}`;
            }
        }
        
        // Check for legacy photo fields
        if (member.photo_filename) {
            console.log('📁 Using photo_filename:', member.photo_filename);
            return `/photos/${member.photo_filename}`;
        }
        if (member.photo_base64) {
            console.log('📋 Using photo_base64');
            return member.photo_base64;
        }
        
        // Default photo based on gender
        console.log('🚫 No photo found, using default for gender:', member.gender);
        return `/photos/default-${member.gender === 'female' ? 'female' : 'male'}.svg`;
    }
    
    // Standings section
    renderStandings() {
        const container = document.getElementById('standings-container');
        const showCurrentSeasonOnly = document.getElementById('show-current-season-only-standings')?.checked ?? true;
        
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
    
    // Helper function to check if event is in current season (inherited from core.js pattern)
    isCurrentSeasonEvent(eventDate) {
        const currentSeason = this.getCurrentSeason();
        
        let event;
        if (typeof eventDate === 'number') {
            // Handle epoch timestamp (assume seconds, convert to milliseconds)
            event = new Date(eventDate * 1000);
        } else {
            // Handle date string or Date object
            event = new Date(eventDate);
        }
        
        const eventYear = event.getFullYear();
        const eventMonth = event.getMonth() + 1; // getMonth() returns 0-11
        
        if (currentSeason.includes('Spring')) {
            // Spring season: January to June
            const springYear = parseInt(currentSeason.split('-')[0]);
            return eventYear === springYear && eventMonth >= 1 && eventMonth <= 6;
        } else {
            // Fall season: July to December
            const fallYear = parseInt(currentSeason.split('-')[0]);
            return eventYear === fallYear && eventMonth >= 7 && eventMonth <= 12;
        }
    }
    
    // Helper function to get current season (inherited from core.js pattern)
    getCurrentSeason() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
        
        // Spring season: Jan 1st to Jun 30th
        // Fall season: Jul 1st to Dec 31st
        if (currentMonth >= 1 && currentMonth <= 6) {
            return currentYear + '-Spring';
        } else {
            return currentYear + '-Fall';
        }
    }
    
    // Game Tracker section
    renderGameTracker() {
        console.log('🎯 renderGameTracker called');
        const container = document.getElementById('game-tracker-container');
        const teamFilter = document.getElementById('game-team-filter')?.value || 'all';
        
        // Populate team filter dropdown if not already populated
        this.populateTeamFilter();
        
        console.log('👥 Team filter:', teamFilter);
        
        // Collect all matches from all events (only completed games for managers)
        const gameRecords = this.collectAllGameRecords();
        
        console.log('📊 Collected game records:', gameRecords.length);
        
        // Filter by team if specified
        let filteredGames = gameRecords;
        if (teamFilter !== 'all') {
            filteredGames = gameRecords.filter(game => 
                game.homeTeamId === teamFilter || game.awayTeamId === teamFilter
            );
        }
        
        // Only show completed games for managers
        filteredGames = filteredGames.filter(game => game.status === 'completed');
        
        console.log('📊 Filtered completed games:', filteredGames.length);
        
        if (filteredGames.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No completed games found</h3>
                    <p>Completed game records will appear here when available</p>
                </div>
            `;
            return;
        }
        
        // Sort by combined date + time (most recent datetime first)
        filteredGames.sort((a, b) => {
            // Create combined datetime for proper chronological sorting
            const getGameDateTime = (game) => {
                const baseDate = new Date(game.eventDate_epoch * 1000);
                
                if (game.time_epoch) {
                    const timeDate = new Date(game.time_epoch * 1000);
                    return new Date(
                        baseDate.getFullYear(),
                        baseDate.getMonth(), 
                        baseDate.getDate(),
                        timeDate.getHours(),
                        timeDate.getMinutes(),
                        timeDate.getSeconds()
                    );
                } else if (game.time && typeof game.time === 'string') {
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
                    return baseDate;
                }
            };
            
            const dateTimeA = getGameDateTime(a);
            const dateTimeB = getGameDateTime(b);
            
            if (dateTimeA.getTime() !== dateTimeB.getTime()) {
                return dateTimeB - dateTimeA;
            }
            
            const getFieldNumber = (game) => {
                if (!game.field) return 999999;
                const fieldStr = game.field.toString().toLowerCase();
                const match = fieldStr.match(/(\d+)/);
                return match ? parseInt(match[1]) : 999999;
            };
            
            const fieldA = getFieldNumber(a);
            const fieldB = getFieldNumber(b);
            
            return fieldA - fieldB;
        });
        
        container.innerHTML = `
            <div class="game-tracker-table-container">
                <table class="game-tracker-table">
                    <thead>
                        <tr>
                            <th>Date/Time</th>
                            <th>Home Team</th>
                            <th>Away Team</th>
                            <th>Score</th>
                            <th>Field</th>
                            <th>Status</th>
                            <th>Referee(s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredGames.map(game => `
                            <tr class="game-row ${game.status}">
                                <td class="date-time-cell">
                                    <div class="game-date">${this.epochToPacificDate(game.eventDate_epoch)}</div>
                                    ${game.time_epoch ? `<div class="game-time">${this.epochToPacificTime(game.time_epoch)}</div>` : ''}
                                </td>
                                <td class="team-cell">
                                    ${this.getTeamResultBubble(game.homeTeam, 'home', game)}
                                </td>
                                <td class="team-cell">
                                    ${this.getTeamResultBubble(game.awayTeam, 'away', game)}
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
                                        game.referees.map(ref => `<span class="referee-bubble">${ref.replace('👨‍⚖️ ', '')}</span>`).join('<br>') 
                                        : '—'}
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
                                <div class="game-date-large">${this.epochToPacificDate(game.eventDate_epoch)}</div>
                                ${game.time_epoch ? `<div class="game-time-large">${this.epochToPacificTime(game.time_epoch)}</div>` : ''}
                            </div>
                            <div class="game-status-section">
                                <span class="status-badge status-${game.status}">${this.getStatusDisplay(game.status)}</span>
                            </div>
                        </div>
                        
                        <div class="game-record-details">
                            <div class="teams-matchup">
                                <div class="match-teams-bubbled">
                                    ${this.getTeamResultBubble(game.homeTeam, 'home', game)}
                                    <span class="vs-separator">vs</span>
                                    ${this.getTeamResultBubble(game.awayTeam, 'away', game)}
                                </div>
                                ${game.hasScore && game.status === 'completed' ? `
                                    <div class="score-display">${game.homeScore} - ${game.awayScore}</div>
                                ` : ''}
                            </div>
                            
                            <div class="game-details-grid">
                                ${game.field ? `<div class="detail-item"><span class="detail-label">Field:</span> ${game.field}</div>` : ''}
                                ${game.referees.length > 0 ? `
                                    <div class="detail-item">
                                        <span class="detail-label">Referee(s):</span>
                                        <div class="mobile-referees">
                                            ${game.referees.map(ref => `<span class="referee-bubble">${ref.replace('👨‍⚖️ ', '')}</span>`).join(' ')}
                                        </div>
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
        console.log('👥 Available teams:', this.teams.length);
        console.log('👨‍⚖️ Available referees:', this.referees.length);
        
        const gameRecords = [];
        
        // Create lookup maps for efficiency
        const teamLookup = new Map();
        const refereeLookup = new Map();
        
        this.teams.forEach(team => teamLookup.set(team.id, team));
        this.referees.forEach(referee => refereeLookup.set(referee.id, referee));
        
        // Process all events and matches
        this.events.forEach((event, eventIndex) => {
            console.log(`📅 Processing event ${eventIndex + 1}/${this.events.length}: ${event.name}`);
            
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
                    homeTeamId: match.homeTeamId,
                    awayTeamId: match.awayTeamId,
                    eventDate_epoch: event.date_epoch,
                    time_epoch: match.time_epoch,
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
                
                gameRecords.push(gameRecord);
            });
        });
        
        console.log(`🎯 Final result: ${gameRecords.length} game records collected`);
        return gameRecords;
    }
    
    populateTeamFilter() {
        const teamFilter = document.getElementById('game-team-filter');
        if (!teamFilter || teamFilter.children.length > 1) return; // Already populated
        
        // Add team options
        this.teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            teamFilter.appendChild(option);
        });
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
    
    getTeamResultBubble(teamName, teamSide, game) {
        if (!game.hasScore || game.status !== 'completed') {
            return `<span class="team-result-bubble no-result">${teamName}</span>`;
        }
        
        const homeScore = parseInt(game.homeScore);
        const awayScore = parseInt(game.awayScore);
        
        let bubbleClass = 'no-result';
        if (homeScore > awayScore) {
            bubbleClass = teamSide === 'home' ? 'winner' : 'loser';
        } else if (awayScore > homeScore) {
            bubbleClass = teamSide === 'away' ? 'winner' : 'loser';
        } else {
            bubbleClass = 'draw';
        }
        
        return `<span class="team-result-bubble ${bubbleClass}">${teamName}</span>`;
    }
    
    // Card Tracker section
    async renderCardTracker() {
        console.log('🃏 renderCardTracker called');
        const container = document.getElementById('cards-tracker-container');
        const cardTypeFilter = document.getElementById('card-type-filter')?.value || 'all';
        
        try {
            // Collect all card data from matches
            const cardData = this.collectAllCardData();
            
            // Filter by card type if specified
            let filteredCards = cardData;
            if (cardTypeFilter !== 'all') {
                filteredCards = cardData.filter(card => card.cardType === cardTypeFilter);
            }
            
            console.log('🃏 Filtered card records:', filteredCards.length);
            
            if (filteredCards.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <h3>No card records found</h3>
                        <p>Card records will appear here when cards are issued during matches</p>
                    </div>
                `;
                return;
            }
            
            // Group cards by player and calculate totals
            const playerCardStats = this.calculatePlayerCardStats(filteredCards);
            
            // Sort by total cards (most cards first)
            const sortedPlayers = Object.values(playerCardStats).sort((a, b) => {
                const totalA = a.totalYellow + a.totalRed;
                const totalB = b.totalYellow + b.totalRed;
                if (totalB !== totalA) return totalB - totalA;
                // If tied, sort by red cards first, then yellow cards
                if (b.totalRed !== a.totalRed) return b.totalRed - a.totalRed;
                if (b.totalYellow !== a.totalYellow) return b.totalYellow - a.totalYellow;
                return a.playerName.localeCompare(b.playerName);
            });
            
            // Render desktop table and mobile view
            container.innerHTML = `
                <!-- Desktop Table View -->
                <table class="card-tracker-table">
                    <thead>
                        <tr>
                            <th class="player-name-header">Player</th>
                            <th class="team-name-header">Team</th>
                            <th>🟨 Yellow</th>
                            <th>🟥 Red</th>
                            <th class="card-total">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedPlayers.map(player => `
                            <tr class="card-row">
                                <td class="player-name-cell">${player.playerName}</td>
                                <td class="team-name-card-cell">${player.teamName}</td>
                                <td class="card-count yellow-cards">${player.totalYellow}</td>
                                <td class="card-count red-cards">${player.totalRed}</td>
                                <td class="card-total">${player.totalYellow + player.totalRed}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <!-- Mobile Card View -->
                <div class="card-tracker-mobile">
                    ${sortedPlayers.map(player => `
                        <div class="card-record-item">
                            <div class="card-record-header">
                                <div class="card-player-info">
                                    <div class="card-player-name">${player.playerName}</div>
                                    <div class="card-team-name">${player.teamName}</div>
                                </div>
                                <div class="card-counts-mobile">
                                    <span class="card-count-mobile yellow">${player.totalYellow} 🟨</span>
                                    <span class="card-count-mobile red">${player.totalRed} 🟥</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
        } catch (error) {
            console.error('Error rendering card tracker:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Error loading card data</h3>
                    <p>Please try again later</p>
                </div>
            `;
        }
    }
    
    collectAllCardData() {
        console.log('🔍 collectAllCardData called');
        const cardRecords = [];
        
        // Create lookup maps for efficiency
        const teamLookup = new Map();
        this.teams.forEach(team => teamLookup.set(team.id, team));
        
        // Get current season start epoch for filtering
        const currentSeasonStart = this.getCurrentSeasonStartEpoch();
        
        // Process all events and matches to collect card data
        this.events.forEach(event => {
            // Filter by current season only
            if (event.date_epoch < currentSeasonStart) {
                return;
            }
            
            if (!event.matches || event.matches.length === 0) {
                return;
            }
            
            event.matches.forEach(match => {
                if (!match.cards || match.cards.length === 0) {
                    return;
                }
                
                match.cards.forEach(card => {
                    const homeTeam = teamLookup.get(match.homeTeamId);
                    const awayTeam = teamLookup.get(match.awayTeamId);
                    
                    // Determine which team this card belongs to
                    const isHomeTeam = card.teamType === 'home';
                    const team = isHomeTeam ? homeTeam : awayTeam;
                    
                    if (team) {
                        // Find the member in the team
                        const member = team.members?.find(m => m.id === card.memberId);
                        
                        if (member) {
                            cardRecords.push({
                                eventId: event.id,
                                matchId: match.id,
                                eventDate: event.date_epoch,
                                memberId: card.memberId,
                                memberName: card.memberName || member.name,
                                teamId: team.id,
                                teamName: team.name,
                                teamType: card.teamType,
                                cardType: card.cardType,
                                reason: card.reason,
                                notes: card.notes,
                                minute: card.minute
                            });
                        }
                    }
                });
            });
        });
        
        console.log(`🃏 Collected ${cardRecords.length} card records from current season`);
        return cardRecords;
    }
    
    calculatePlayerCardStats(cardRecords) {
        const playerStats = {};
        
        cardRecords.forEach(card => {
            const playerId = card.memberId;
            
            if (!playerStats[playerId]) {
                playerStats[playerId] = {
                    playerId: playerId,
                    playerName: card.memberName,
                    teamId: card.teamId,
                    teamName: card.teamName,
                    totalYellow: 0,
                    totalRed: 0,
                    cards: []
                };
            }
            
            // Count card types
            if (card.cardType === 'yellow') {
                playerStats[playerId].totalYellow++;
            } else if (card.cardType === 'red') {
                playerStats[playerId].totalRed++;
            }
            
            // Add card details
            playerStats[playerId].cards.push(card);
        });
        
        return playerStats;
    }
    
    // Helper function to get current season start epoch timestamp
    getCurrentSeasonStartEpoch() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
        
        // Spring season: Jan 1st to Jun 30th
        // Fall season: Jul 1st to Dec 31st
        if (currentMonth >= 1 && currentMonth <= 6) {
            // Current Spring season: Jan 1st to Jun 30th
            return Math.floor(new Date(currentYear, 0, 1, 0, 0, 0).getTime() / 1000);
        } else {
            // Current Fall season: Jul 1st to Dec 31st  
            return Math.floor(new Date(currentYear, 6, 1, 0, 0, 0).getTime() / 1000);
        }
    }
    
    // Date/time formatting functions
    epochToPacificDate(epoch) {
        return new Date(epoch * 1000).toLocaleDateString('en-US', { 
            timeZone: 'America/Los_Angeles',
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }
    
    epochToPacificTime(epoch) {
        return new Date(epoch * 1000).toLocaleTimeString('en-US', { 
            timeZone: 'America/Los_Angeles',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
    
    // Utility methods
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add CSS if not already present
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 15px 20px;
                    border-radius: 8px;
                    color: white;
                    font-weight: 600;
                    z-index: 10000;
                    max-width: 400px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                .notification-success { background: #28a745; }
                .notification-error { background: #dc3545; }
                .notification-info { background: #2196F3; }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Global functions for onclick handlers - define early
window.showSection = function(sectionName) {
    if (window.app && window.app.showSection) {
        window.app.showSection(sectionName);
    } else {
        console.log('App not ready yet, section:', sectionName);
    }
};

// Initialize app - handle both cases: DOM ready or already loaded
function initManagerApp() {
    console.log('Initializing manager app...');
    const app = new CheckInManagerApp();
    window.app = app;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initManagerApp);
} else {
    // DOM is already loaded
    initManagerApp();
}