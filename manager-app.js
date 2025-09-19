// CheckIn App - Manager Portal JavaScript
// Version 6.4.0 - Manager-specific functionality

const APP_VERSION = '6.4.0';

class CheckInManagerApp {
    constructor() {
        this.teams = [];
        this.teamManagers = [];
        this.events = [];
        this.referees = [];
        this.currentSeason = getCurrentSeason();
        
        // Initialize app
        this.init();
    }
    
    async init() {
        try {
            // Load initial data
            await Promise.all([
                this.loadTeams(),
                this.loadTeamManagers(),
                this.loadEvents(),
                this.loadReferees()
            ]);
            
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
            const response = await fetch('/api/teams');
            if (!response.ok) throw new Error('Failed to load teams');
            this.teams = await response.json();
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
            case 'game-tracker':
                this.renderGameTracker();
                break;
        }
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
        
        // Render each category
        Object.keys(teamsByCategory).sort().forEach(category => {
            const teams = teamsByCategory[category];
            html += `
                <div class="category-section">
                    <h3 class="category-title">${category}</h3>
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
            return '<div class="team-managers">💼 Managers: <em>None assigned</em></div>';
        }
        
        if (managers.length === 1) {
            return `<div class="team-managers">💼 Manager: ${managers[0].first_name} ${managers[0].last_name}</div>`;
        }
        
        if (managers.length === 2) {
            return `<div class="team-managers">💼 Managers: ${managers[0].first_name} ${managers[0].last_name}, ${managers[1].first_name} ${managers[1].last_name}</div>`;
        }
        
        return `<div class="team-managers">💼 Managers: ${managers[0].first_name} ${managers[0].last_name}, ${managers[1].first_name} ${managers[1].last_name} (+${managers.length - 2} more)</div>`;
    }
    
    // Manager dialog functionality
    showManagerDialog(teamId) {
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
                    <div class="manager-name">${manager.first_name} ${manager.last_name}</div>
                    <div class="manager-contact">
                        ${manager.phone_number ? `📞 ${manager.phone_number}` : ''}
                        ${manager.email_address ? `📧 ${manager.email_address}` : ''}
                    </div>
                </div>
                <div class="manager-actions">
                    <button class="btn btn-small" onclick="app.editManager(${manager.id})" title="Edit Manager">
                        ✏️
                    </button>
                    <button class="btn btn-small btn-danger" onclick="app.deleteManager(${manager.id}, '${teamId}')" title="Remove Manager">
                        🗑️
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    // Add manager form
    showAddManagerForm(teamId) {
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
                            <input type="tel" name="phone_number">
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
    
    async saveNewManager(event, teamId) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        
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
                            <input type="tel" name="phone_number" value="${manager.phone_number || ''}">
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
            
            // Close modal
            form.closest('.modal').remove();
            
            // Refresh teams display
            this.renderTeams();
            
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
            
            // Refresh teams display
            this.renderTeams();
            
            this.showSuccess('Manager removed successfully!');
            
        } catch (error) {
            console.error('Error deleting manager:', error);
            this.showError('Failed to remove manager: ' + error.message);
        }
    }
    
    // Team details view
    showTeamDetails(teamId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
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
                            <p><strong>Total Players:</strong> ${team.members ? team.members.length : 0}</p>
                        </div>
                        
                        <div class="detail-section">
                            <h4>Player Roster</h4>
                            <div class="players-list">
                                ${this.renderPlayersList(team.members || [])}
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
                    <div class="player-card">
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
    
    // Standings section
    renderStandings() {
        const container = document.getElementById('standings-container');
        container.innerHTML = '<div class="empty-state"><h3>Standings Coming Soon</h3><p>This feature is under development.</p></div>';
    }
    
    // Game Tracker section
    renderGameTracker() {
        const container = document.getElementById('game-tracker-container');
        container.innerHTML = '<div class="empty-state"><h3>Game Tracker Coming Soon</h3><p>This feature is under development.</p></div>';
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

// Global functions for onclick handlers
function showSection(sectionName) {
    if (window.app) {
        window.app.showSection(sectionName);
    }
}

// Initialize app
window.app = new CheckInManagerApp();