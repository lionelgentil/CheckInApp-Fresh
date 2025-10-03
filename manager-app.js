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
        this.cardCharts = {}; // Store chart instances
        
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
    
    // Teams section rendering - Complete implementation from view.html
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
        
        // Add "Email All Managers" link at the top
        const allManagersEmailLink = this.generateManagerEmailLink();
        let emailSection = '';
        if (allManagersEmailLink) {
            emailSection = `
                <div class="email-all-managers" style="text-align: center; margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2196F3;">
                    <a href="${allManagersEmailLink}" style="color: #2196F3; text-decoration: none; font-weight: 600; font-size: 16px;">
                        📧 Email All Managers
                    </a>
                </div>
            `;
        }
        
        // Create team selector dropdown with categories
        let selectorHtml = `
            ${emailSection}
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
                // Get team managers for this team
                const teamManagers = this.teamManagers.filter(m => m.team_id === selectedTeam.id);
                
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
                
                // Calculate team-wide card statistics (current season only)
                let teamCurrentSeasonYellow = 0;
                let teamCurrentSeasonRed = 0;
                
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
                                    ${this.renderManagerDisplay(teamManagers)}
                                </div>
                                <div class="team-actions">
                                    <button class="btn btn-small" onclick="app.showManagerDialog('${selectedTeam.id}')" title="Manage Team Managers">
                                        💼
                                    </button>
                                </div>
                            </div>
                            <div class="team-description">${selectedTeam.description || ''}</div>
                            ${totalPlayers > 0 ? `
                                <div class="roster-stats" style="margin: 12px 0; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 0.9em; color: #666;">
                                    <div style="margin-bottom: 6px;"><strong>👥 ${totalPlayers} player${totalPlayers !== 1 ? 's' : ''}</strong></div>
                                    ${maleCount > 0 || femaleCount > 0 ? `
                                        <div style="margin-bottom: 6px;">👨 ${maleCount} male${maleCount !== 1 ? 's' : ''} • 👩 ${femaleCount} female${femaleCount !== 1 ? 's' : ''} ${unknownCount > 0 ? `• ❓ ${unknownCount} unspecified` : ''}</div>
                                    ` : ''}
                                    <div style="margin-bottom: 3px;">
                                        <strong>📋 Current Season Cards:</strong> 
                                        ${teamCurrentSeasonYellow + teamCurrentSeasonRed > 0 ? `🟨${teamCurrentSeasonYellow} 🟥${teamCurrentSeasonRed}` : 'No cards issued'}
                                    </div>
                                </div>
                            ` : ''}
                            <div class="members-list-full">
                                ${selectedTeam.members
                                    .slice()
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map(member => {
                                    // Count current season cards for this member
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
                                    
                                    const currentCardsDisplay = [];
                                    if (currentSeasonYellowCards > 0) currentCardsDisplay.push(`🟨${currentSeasonYellowCards}`);
                                    if (currentSeasonRedCards > 0) currentCardsDisplay.push(`🟥${currentSeasonRedCards}`);
                                    const currentCardsText = currentCardsDisplay.length > 0 ? ` • ${currentCardsDisplay.join(' ')} (current season)` : '';
                                    
                                    return `
                                        <div class="member-item">
                                            <div class="member-info">
                                                <img src="${this.getPlayerPhotoUrl(member)}" alt="${member.name}" class="member-photo">
                                                <div class="member-details">
                                                    <div class="member-name">${member.name}${this.isMemberCaptain(member, selectedTeam) ? ' 👑' : ''}</div>
                                                    <div class="member-meta">
                                                        ${member.jersey_number ? `#${member.jersey_number}` : ''}
                                                        ${member.gender ? ` • ${member.gender}` : ''}
                                                        ${currentCardsText}
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="member-actions">
                                                <button class="btn btn-small" onclick="app.showPlayerProfile('${selectedTeam.id}', '${member.id}')" title="View Profile">👤</button>
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
    }
    
    // Helper method to check if member is captain
    isMemberCaptain(member, team) {
        // Check new captains array
        if (team.captains && team.captains.some(c => c.memberId === member.id)) {
            return true;
        }
        
        // Check legacy captain system
        if (team.captainId === member.id) {
            return true;
        }
        
        // Check legacy member captain flag
        if (member.captain) {
            return true;
        }
        
        return false;
    }
    
    // Player profile view for read-only access
    showPlayerProfile(teamId, memberId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        const member = team.members?.find(m => m.id === memberId);
        if (!member) return;
        
        // Collect current season cards for this player
        const currentSeasonCards = [];
        this.events.forEach(event => {
            if (this.isCurrentSeasonEvent(event.date_epoch)) {
                event.matches.forEach(match => {
                    if (match.cards) {
                        const memberCards = match.cards.filter(card => card.memberId === member.id);
                        memberCards.forEach(card => {
                            const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
                            const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
                            const referee = this.referees.find(r => r.id === match.mainRefereeId);
                            
                            currentSeasonCards.push({
                                cardType: card.cardType,
                                reason: card.reason,
                                notes: card.notes,
                                minute: card.minute,
                                eventName: event.name,
                                matchInfo: `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`,
                                refereeName: referee?.name || 'Unknown',
                                eventDate: this.epochToPacificDate(event.date_epoch)
                            });
                        });
                    }
                });
            }
        });
        
        // Sort cards by date (most recent first)
        currentSeasonCards.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3 class="modal-title">👤 Player Profile - ${member.name}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>

                <div class="modal-body">
                    <div class="profile-info">
                        <div class="profile-section" style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                            <img src="${this.getPlayerPhotoUrl(member)}" alt="${member.name}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #e9ecef;">
                            <div>
                                <h4 style="margin: 0 0 5px 0;">${member.name}${this.isMemberCaptain(member, team) ? ' 👑' : ''}</h4>
                                <p><strong>Team:</strong> ${team.name}</p>
                                <p><strong>Jersey Number:</strong> ${member.jersey_number || 'Not assigned'}</p>
                                <p><strong>Gender:</strong> ${member.gender || 'Not specified'}</p>
                            </div>
                        </div>

                        <div class="profile-section">
                            <h4 style="margin: 0 0 12px 0; color: #333; display: flex; align-items: center; gap: 8px;">
                                📋 Disciplinary Record (Current Season)
                                <span style="background: ${currentSeasonCards.length === 0 ? '#28a745' : '#ffc107'}; color: ${currentSeasonCards.length === 0 ? 'white' : '#212529'}; padding: 2px 6px; border-radius: 10px; font-size: 0.75em; font-weight: normal;">
                                    ${currentSeasonCards.length} card${currentSeasonCards.length !== 1 ? 's' : ''}
                                </span>
                            </h4>

                            ${currentSeasonCards.length > 0 ? `
                                <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px;">
                                    ${currentSeasonCards.map(card => `
                                        <div style="padding: 12px; border-bottom: 1px solid #f8f9fa; display: flex; justify-content: space-between; align-items: flex-start;">
                                            <div style="flex: 1;">
                                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                                    <span style="background: ${card.cardType === 'yellow' ? '#fff3cd' : '#f8d7da'}; color: ${card.cardType === 'yellow' ? '#856404' : '#721c24'}; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 600;">
                                                        ${card.cardType === 'yellow' ? '🟨 Yellow' : '🟥 Red'}
                                                    </span>
                                                    ${card.minute ? `<span style="font-size: 0.8em; color: #666;">${card.minute}'</span>` : ''}
                                                </div>
                                                <div style="font-weight: 600; margin-bottom: 2px;">${card.matchInfo}</div>
                                                <div style="font-size: 0.85em; color: #666; margin-bottom: 2px;">${card.eventDate}</div>
                                                ${card.reason ? `<div style="font-size: 0.85em; color: #333;"><strong>Reason:</strong> ${card.reason}</div>` : ''}
                                                ${card.notes ? `<div style="font-size: 0.85em; color: #666;"><strong>Notes:</strong> ${card.notes}</div>` : ''}
                                                <div style="font-size: 0.8em; color: #888;">Referee: ${card.refereeName}</div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div style="text-align: center; padding: 30px; color: #666; background: #f8f9fa; border-radius: 8px;">
                                    <div style="font-size: 2em; margin-bottom: 8px;">✅</div>
                                    <p style="margin: 0; font-style: italic; font-size: 0.9em;">Clean record - No disciplinary actions this season</p>
                                </div>
                            `}
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
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

        // Sort managers: Manager first, then Assistant Managers
        const sortedManagers = managers.sort((a, b) => {
            if (a.role === 'Manager' && b.role !== 'Manager') return -1;
            if (a.role !== 'Manager' && b.role === 'Manager') return 1;
            return 0;
        });

        return sortedManagers.map(manager => {
            const icon = manager.role === 'Manager' ? '👔' : '🏃‍♀️';
            const roleClass = manager.role === 'Manager' ? 'manager-primary' : 'manager-assistant';
            return `<div class="team-managers ${roleClass}">${icon} ${manager.first_name} ${manager.last_name}</div>`;
        }).join('');
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

        // Sort managers: Manager first, then Assistant Managers
        const sortedManagers = managers.sort((a, b) => {
            if (a.role === 'Manager' && b.role !== 'Manager') return -1;
            if (a.role !== 'Manager' && b.role === 'Manager') return 1;
            return 0;
        });

        return sortedManagers.map(manager => {
            const icon = manager.role === 'Manager' ? '👔' : '🏃‍♀️';
            const roleLabel = manager.role || 'Assistant Manager'; // Default for existing records
            const roleClass = manager.role === 'Manager' ? 'manager-primary' : 'manager-assistant';

            return `
            <div class="manager-item ${roleClass}" data-manager-id="${manager.id}">
                <div class="manager-info">
                    <div class="manager-name" onclick="app.showManagerProfile(${manager.id})" style="cursor: pointer; color: #2196F3;">
                        ${icon} ${manager.first_name} ${manager.last_name}
                        <span class="manager-role-badge">${roleLabel}</span>
                    </div>
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
            </div>`;
        }).join('');
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

                        <div class="form-group">
                            <label>Role *</label>
                            <select name="role" required>
                                <option value="Assistant Manager" selected>🏃‍♀️ Assistant Manager</option>
                                <option value="Manager">👔 Manager</option>
                            </select>
                            <small style="color: #666; font-size: 0.85em; margin-top: 5px; display: block;">
                                Note: Only one Manager per team is recommended
                            </small>
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
            email_address: formData.get('email_address') || null,
            role: formData.get('role') || 'Assistant Manager'
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

                        <div class="form-group">
                            <label>Role *</label>
                            <select name="role" required id="edit-role-select" onchange="app.handleRoleChange('${manager.team_id}', ${managerId})">
                                <option value="Assistant Manager" ${(manager.role || 'Assistant Manager') === 'Assistant Manager' ? 'selected' : ''}>🏃‍♀️ Assistant Manager</option>
                                <option value="Manager" ${manager.role === 'Manager' ? 'selected' : ''}>👔 Manager</option>
                            </select>
                            <div id="role-warning" style="display: none; color: #e74c3c; font-size: 0.85em; margin-top: 5px;">
                                ⚠️ This team already has a Manager. Please demote the current Manager to Assistant Manager first.
                            </div>
                            <small style="color: #666; font-size: 0.85em; margin-top: 5px; display: block;">
                                Only one Manager per team is allowed
                            </small>
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

    // Handle role change validation
    handleRoleChange(teamId, currentManagerId) {
        const select = document.getElementById('edit-role-select');
        const warning = document.getElementById('role-warning');
        const selectedRole = select.value;

        if (selectedRole === 'Manager') {
            // Check if team already has a manager (excluding current manager being edited)
            const existingManager = this.teamManagers.find(m =>
                m.team_id === teamId &&
                m.role === 'Manager' &&
                m.id !== currentManagerId
            );

            if (existingManager) {
                // Show warning and reset to Assistant Manager
                warning.style.display = 'block';
                select.value = 'Assistant Manager';

                // Show modal with options to handle conflict
                this.showManagerConflictDialog(existingManager, currentManagerId, teamId);
            } else {
                warning.style.display = 'none';
            }
        } else {
            warning.style.display = 'none';
        }
    }

    // Show dialog for handling manager role conflicts
    showManagerConflictDialog(existingManager, newManagerId, teamId) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.zIndex = '10001'; // Above other modals
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">⚠️ Manager Role Conflict</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>

                <div class="modal-body">
                    <p style="margin-bottom: 20px; color: #666;">
                        <strong>${existingManager.first_name} ${existingManager.last_name}</strong> is already the Manager for this team.
                    </p>
                    <p style="margin-bottom: 20px; color: #666;">
                        To promote someone else to Manager, the current Manager must first be demoted to Assistant Manager.
                    </p>

                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                            Cancel
                        </button>
                        <button class="btn" onclick="app.swapManagerRoles(${existingManager.id}, ${newManagerId}, '${teamId}')">
                            👔➡️🏃‍♀️ Swap Roles
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    // Swap manager roles - demote current manager and promote new one
    async swapManagerRoles(currentManagerId, newManagerId, teamId) {
        try {
            // Close all modals
            document.querySelectorAll('.modal').forEach(modal => modal.remove());

            // Step 1: Demote current manager to Assistant Manager
            const demoteResponse = await fetch(`/api/team-managers/${currentManagerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'Assistant Manager'
                })
            });

            if (!demoteResponse.ok) {
                throw new Error('Failed to demote current manager');
            }

            // Step 2: Promote new manager to Manager
            const promoteResponse = await fetch(`/api/team-managers/${newManagerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'Manager'
                })
            });

            if (!promoteResponse.ok) {
                throw new Error('Failed to promote new manager');
            }

            // Refresh data and update UI
            await this.loadTeamManagers();
            await this.renderTeams();

            // Show success message
            this.showMessage('Manager roles swapped successfully!', 'success');

        } catch (error) {
            console.error('Error swapping manager roles:', error);
            this.showMessage('Failed to swap manager roles. Please try again.', 'error');
        }
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
            email_address: formData.get('email_address') || null,
            role: formData.get('role') || 'Assistant Manager'
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
                            <td class="player-name-cell">
                                ${card.teamId && card.memberId ? 
                                    `<a href="#" onclick="app.viewPlayerProfile('${card.teamId}', '${card.memberId}'); return false;" style="color: #007bff; text-decoration: none; font-weight: 600;" title="View ${card.playerName}'s profile">${card.playerName}</a>` : 
                                    card.playerName
                                }
                            </td>
                            <td class="center-cell">
                                <span class="card-type-badge card-type-${card.cardType}">
                                    ${card.cardType === 'yellow' ? '🟨 Yellow' : '🟥 Red'}
                                </span>
                            </td>
                            <td>${card.reason || 'Not specified'}</td>
                            <td class="notes-cell" title="${card.notes || ''}">${card.notes || '—'}</td>
                            <td class="match-info-cell">
                                <div><strong>${card.matchInfo}</strong></div>
                                <div style="font-size: 0.8em; color: #888;">${this.epochToPacificDate(card.eventDate_epoch || card.eventDate)}</div>
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
                            <div class="card-date">${this.epochToPacificDate(card.eventDate_epoch || card.eventDate)}</div>
                        </div>
                        
                        <div class="card-record-details">
                            <div class="player-team-info">
                                <div class="player-name-large">
                                    ${card.teamId && card.memberId ? 
                                        `<a href="#" onclick="app.viewPlayerProfile('${card.teamId}', '${card.memberId}'); return false;" style="color: #007bff; text-decoration: none; font-weight: 600;" title="View ${card.playerName}'s profile">${card.playerName}</a>` : 
                                        card.playerName
                                    }
                                </div>
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
        
        // Render charts after DOM is updated
        this.waitForChartJsAndRender(filteredCards);
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
                        matchField: match.field,
                        // Add team and member IDs for clickable player profiles
                        teamId: playerTeam?.id,
                        memberId: card.memberId
                    });
                });
            });
        });
        
        return cardRecords;
    }
    
    // Helper method for card sorting
    getCardDateTime(card) {
        // Create combined datetime for proper chronological sorting
        const baseDate = new Date(card.eventDate_epoch * 1000);
        
        if (card.matchTimeEpoch) {
            const timeDate = new Date(card.matchTimeEpoch * 1000);
            return new Date(
                baseDate.getFullYear(),
                baseDate.getMonth(), 
                baseDate.getDate(),
                timeDate.getHours(),
                timeDate.getMinutes(),
                timeDate.getSeconds()
            );
        } else if (card.matchTime && typeof card.matchTime === 'string') {
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
            return baseDate;
        }
    }
    
    // Helper method for field sorting
    getCardFieldNumber(card) {
        if (!card.matchField) return 999999;
        
        // Extract numeric part from field (e.g., "Field 1" -> 1, "1" -> 1)
        const fieldStr = card.matchField.toString().toLowerCase();
        const match = fieldStr.match(/(\d+)/);
        return match ? parseInt(match[1]) : 999999;
    }
    
    // Player profile view method (simplified for manager portal)
    viewPlayerProfile(teamId, memberId) {
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        const member = team.members?.find(m => m.id === memberId);
        if (!member) return;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">👤 Player Profile - ${member.name}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div class="profile-info">
                        <div class="profile-section">
                            <h4>Player Information</h4>
                            <p><strong>Name:</strong> ${member.name}</p>
                            <p><strong>Team:</strong> ${team.name}</p>
                            <p><strong>Jersey Number:</strong> ${member.jerseyNumber || 'Not assigned'}</p>
                            <p><strong>Gender:</strong> ${member.gender || 'Not specified'}</p>
                        </div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
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
    
    // Chart rendering methods
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
            const date = this.epochToPacificDate(card.eventDate_epoch || card.eventDate);
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