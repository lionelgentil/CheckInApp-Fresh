/**
 * CheckIn App v2.16.12 - JavaScript Frontend
 * Works with PHP/SQLite backend
 */

// Version constant - update this single location to change version everywhere
const APP_VERSION = '2.16.13';

class CheckInApp {
    constructor() {
        this.teams = [];
        this.events = [];
        this.referees = [];
        this.currentEditingTeam = null;
        this.currentEditingMember = null;
        this.currentEditingEvent = null;
        this.currentEditingReferee = null;
        this.currentModalType = null; // Track current modal type
        
        this.init();
    }
    
    async init() {
        // Load both events and teams on initialization since events display requires team names
        await Promise.all([
            this.loadEvents(),
            this.loadTeams()
        ]);
        this.renderEvents();
        
        // Ensure Events section is shown by default
        this.showSection('events');
    }
    
    // API Methods
    async loadTeams() {
        try {
            const response = await fetch('/api/teams');
            if (response.ok) {
                this.teams = await response.json();
            } else {
                console.error('Failed to load teams');
                this.teams = [];
            }
        } catch (error) {
            console.error('Error loading teams:', error);
            this.teams = [];
        }
    }
    
    async saveTeams() {
        const dataSize = JSON.stringify(this.teams).length;
        console.log('🚨 saveTeams called with data size:', dataSize, 'bytes');
        console.trace('saveTeams call stack:');
        
        try {
            const response = await fetch('/api/teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.teams)
            });
            
            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response:', errorText);
                throw new Error(`Failed to save teams: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error saving teams:', error);
            throw error;
        }
    }
    
    async loadEvents() {
        try {
            const response = await fetch('/api/events');
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
    
    async saveEvents() {
        try {
            const response = await fetch('/api/events', {
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
    
    async saveReferees() {
        try {
            const response = await fetch('/api/referees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.referees)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save referees');
            }
            
            return await response.json();
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
    
    async uploadPhoto(file, memberId) {
        console.log('uploadPhoto called with:', { fileName: file.name, fileSize: file.size, memberId });
        
        if (!file || !memberId) {
            throw new Error('File and member ID are required');
        }
        
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('member_id', memberId);
        
        console.log('Sending photo upload request to /api/photos');
        
        const response = await fetch('/api/photos', {
            method: 'POST',
            body: formData
        });
        
        console.log('Photo upload response status:', response.status, response.ok);
        
        const result = await response.json();
        console.log('Photo upload result:', result);
        
        if (!response.ok) {
            throw new Error(result.error || 'Photo upload failed');
        }
        
        return result.url; // Return the photo URL
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
            if (this.teams.length === 0) {
                await this.loadTeams();
            }
            this.renderTeams();
        } else if (sectionName === 'referees') {
            if (this.referees.length === 0) {
                await this.loadReferees();
            }
            this.renderReferees();
        }
        
        // Show section
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName + '-section').classList.add('active');
    }
    
    renderTeams() {
        const container = document.getElementById('teams-container');
        const selectedTeamId = document.getElementById('team-selector')?.value;
        
        // Get current filter state
        const filterValue = document.getElementById('category-filter')?.value || 'all';
        
        // Filter and sort teams for the dropdown
        let teamsToShow = this.teams.slice(); // Create a copy
        
        if (filterValue !== 'all') {
            teamsToShow = teamsToShow.filter(team => team.category === filterValue);
        }
        
        // Sort alphabetically
        teamsToShow.sort((a, b) => a.name.localeCompare(b.name));
        
        if (teamsToShow.length === 0) {
            let emptyMessage = 'No teams yet';
            let emptySubtext = 'Create your first team to get started';
            
            if (filterValue === 'Over 30') {
                emptyMessage = 'No Over 30 teams yet';
                emptySubtext = 'Create teams with Over 30 category';
            } else if (filterValue === 'Over 40') {
                emptyMessage = 'No Over 40 teams yet';
                emptySubtext = 'Create teams with Over 40 category';
            }
            
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${emptyMessage}</h3>
                    <p>${emptySubtext}</p>
                </div>
            `;
            return;
        }
        
        // Create team selector dropdown
        let selectorHtml = `
            <div class="team-selector-container">
                <label class="form-label">Select a team to view roster:</label>
                <select id="team-selector" class="form-select" onchange="app.renderTeams()">
                    <option value="">Choose a team...</option>
                    ${teamsToShow.map(team => `
                        <option value="${team.id}" ${selectedTeamId === team.id ? 'selected' : ''}>
                            ${team.name} ${team.category ? `(${team.category})` : ''} - ${team.members.length} players
                        </option>
                    `).join('')}
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
                                    <strong>👥 ${totalPlayers} player${totalPlayers !== 1 ? 's' : ''}</strong>
                                    ${maleCount > 0 || femaleCount > 0 ? `
                                        • 👨 ${maleCount} male${maleCount !== 1 ? 's' : ''} 
                                        • 👩 ${femaleCount} female${femaleCount !== 1 ? 's' : ''}
                                        ${unknownCount > 0 ? `• ❓ ${unknownCount} unspecified` : ''}
                                    ` : ''}
                                </div>
                            ` : ''}
                            <div class="members-list-full">
                                ${selectedTeam.members.map(member => `
                                    <div class="member-item">
                                        <div class="member-info">
                                            ${member.photo ? 
                                                `<img src="${member.photo}" alt="${member.name}" class="member-photo">` :
                                                `<div class="member-photo"></div>`
                                            }
                                            <div class="member-details">
                                                <div class="member-name">${member.name}${member.id === selectedTeam.captainId ? ' 👑' : ''}</div>
                                                <div class="member-meta">
                                                    ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                                    ${member.gender ? ` • ${member.gender}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="member-actions">
                                            <button class="btn btn-small" onclick="app.viewPlayerProfile('${selectedTeam.id}', '${member.id}')" title="View Profile">👤</button>
                                            <button class="btn btn-small btn-secondary" onclick="app.editMember('${selectedTeam.id}', '${member.id}')" title="Edit Member">✏️</button>
                                            <button class="btn btn-small btn-danger" onclick="app.deleteMember('${selectedTeam.id}', '${member.id}')" title="Delete Member">🗑️</button>
                                        </div>
                                    </div>
                                `).join('')}
                                ${selectedTeam.members.length === 0 ? '<div class="empty-state"><p>No members yet</p></div>' : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        container.innerHTML = selectorHtml;
    }
    
    renderEvents() {
        console.log('🔍 renderEvents called - teams loaded:', this.teams.length, 'events loaded:', this.events.length);
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
                        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
                        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
                        
                        // Debug team lookups
                        if (!homeTeam) {
                            console.log('❌ Home team not found for ID:', match.homeTeamId, 'Available team IDs:', this.teams.map(t => t.id));
                        }
                        if (!awayTeam) {
                            console.log('❌ Away team not found for ID:', match.awayTeamId, 'Available team IDs:', this.teams.map(t => t.id));
                        }
                        
                        const mainReferee = match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null;
                        const assistantReferee = match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null;
                        
                        const homeAttendanceCount = match.homeTeamAttendees ? match.homeTeamAttendees.length : 0;
                        const awayAttendanceCount = match.awayTeamAttendees ? match.awayTeamAttendees.length : 0;
                        const homeTotalPlayers = homeTeam ? homeTeam.members.length : 0;
                        const awayTotalPlayers = awayTeam ? awayTeam.members.length : 0;
                        
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
                    ${team.members.map(member => 
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
            alert(`Failed to save team: ${error.message}\n\nPlease check the browser console (F12) for more details.`);
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
                    ${team.members.map(member => 
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
        
        let photoUrl = null;
        let needsTeamsSave = false;
        
        // Handle member creation/update
        if (this.currentEditingMember) {
            // Edit existing member - check what actually changed BEFORE updating values
            const originalName = this.currentEditingMember.name;
            const originalJerseyNumber = this.currentEditingMember.jerseyNumber;
            const originalGender = this.currentEditingMember.gender;
            
            const basicInfoChanged = (
                originalName !== name ||
                (originalJerseyNumber || null) !== (jerseyNumber ? parseInt(jerseyNumber) : null) ||
                (originalGender || null) !== (gender || null)
            );
            
            console.log('Basic info change detection:', {
                originalName, name, nameChanged: originalName !== name,
                originalJerseyNumber, jerseyNumber: jerseyNumber ? parseInt(jerseyNumber) : null, jerseyChanged: (originalJerseyNumber || null) !== (jerseyNumber ? parseInt(jerseyNumber) : null),
                originalGender, gender: gender || null, genderChanged: (originalGender || null) !== (gender || null),
                basicInfoChanged
            });
            
            // Update local data
            this.currentEditingMember.name = name;
            this.currentEditingMember.jerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
            this.currentEditingMember.gender = gender || null;
            
            // Upload photo FIRST if provided - this will update database directly
            if (photoFile) {
                try {
                    console.log('Uploading photo for existing member:', this.currentEditingMember.id);
                    photoUrl = await this.uploadPhoto(photoFile, this.currentEditingMember.id);
                    
                    // Update photo in BOTH the editing reference AND the teams array
                    this.currentEditingMember.photo = photoUrl;
                    
                    // Also find and update in teams array to be absolutely sure
                    const team = this.teams.find(t => t.id === teamId);
                    const memberInArray = team.members.find(m => m.id === this.currentEditingMember.id);
                    if (memberInArray) {
                        memberInArray.photo = photoUrl;
                        console.log('Photo updated in teams array as well');
                    }
                    
                    console.log('Photo uploaded successfully:', photoUrl);
                    console.log('Updated member object:', this.currentEditingMember);
                    
                    // Force immediate UI refresh to show new photo
                    console.log('saveMember: Forcing UI refresh after photo upload...');
                    this.renderTeams();
                    console.log('saveMember: UI refreshed');
                } catch (error) {
                    console.error('Error uploading photo:', error);
                    alert('Photo upload failed: ' + error.message);
                    return;
                }
            }
            
            // Only save teams if basic member info actually changed
            // If only photo changed, uploadPhoto already updated the database
            needsTeamsSave = basicInfoChanged;
            
            if (basicInfoChanged) {
                console.log('Basic member info changed, will call saveTeams()');
            } else {
                console.log('Only photo changed, skipping saveTeams() - uploadPhoto already updated database');
            }
        } else {
            // Add new member - create locally first
            const newMember = {
                id: this.generateUUID(),
                name: name,
                jerseyNumber: jerseyNumber ? parseInt(jerseyNumber) : null,
                gender: gender || null,
                photo: null
            };
            team.members.push(newMember);
            
            try {
                // Create the member in database first
                await this.saveTeams();
                
                // Now upload photo if provided - this updates database directly
                if (photoFile) {
                    photoUrl = await this.uploadPhoto(photoFile, newMember.id);
                    newMember.photo = photoUrl;
                    // Photo is now saved, no need for another saveTeams call
                    needsTeamsSave = false;
                } else {
                    // No photo, member already saved above
                    needsTeamsSave = false;
                }
            } catch (error) {
                console.error('Error creating member or uploading photo:', error);
                alert('Failed to create member: ' + error.message);
                // Remove the member we just added since creation failed
                const index = team.members.findIndex(m => m.id === newMember.id);
                if (index !== -1) {
                    team.members.splice(index, 1);
                }
                return;
            }
        }
        
        try {
            // Only save teams if needed (avoid redundant 102KB POST requests)
            console.log('saveMember: needsTeamsSave =', needsTeamsSave);
            if (needsTeamsSave) {
                console.log('🚨 About to call saveTeams() - this will send 102KB of data!');
                await this.saveTeams();
            } else {
                console.log('✅ Skipping saveTeams() - photo upload already updated database directly');
            }
            
            // Update UI
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
            alert('Failed to save member. Please try again.');
        }
    }
    
    async deleteMember(teamId, memberId) {
        if (!confirm('Are you sure you want to delete this member?')) {
            return;
        }
        
        const team = this.teams.find(t => t.id === teamId);
        if (!team) return;
        
        team.members = team.members.filter(m => m.id !== memberId);
        
        try {
            await this.saveTeams();
            this.renderTeams();
        } catch (error) {
            alert('Failed to delete member. Please try again.');
        }
    }
    
    async showDetailedMemberModal(teamId, member) {
        const isMobile = this.isMobileDevice();
        const photoLabel = isMobile ? 'Take Photo' : 'Photo';
        
        // Load disciplinary records for this member
        let disciplinaryRecords = [];
        try {
            const response = await fetch(`/api/disciplinary-records?member_id=${member.id}`);
            if (response.ok) {
                disciplinaryRecords = await response.json();
                console.log('Loaded disciplinary records for member:', member.name, disciplinaryRecords);
            } else {
                const errorText = await response.text();
                console.error('Failed to load disciplinary records:', response.status, errorText);
            }
        } catch (error) {
            console.error('Error loading disciplinary records:', error);
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
                <label class="form-label">Prior Disciplinary Records</label>
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
                    ${disciplinaryRecords.length === 0 ? '<p style="text-align: center; color: #666; font-style: italic; margin: 20px 0;">No prior disciplinary records</p>' : ''}
                </div>
                <button class="btn btn-secondary" onclick="app.addDisciplinaryRecord()" style="margin-top: 10px;">+ Add Prior Record</button>
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
                document.getElementById('disciplinary-records-container').innerHTML = '<p style="text-align: center; color: #666; font-style: italic; margin: 20px 0;">No prior disciplinary records</p>';
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
        
        // Get all match cards for this player across all events - optimized version
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
                console.error('Failed to load disciplinary records for profile:', response.status);
                return [];
            }
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
                    ${member.photo ? 
                        `<img src="${member.photo}" alt="${member.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 3px solid #2196F3;">` :
                        `<div style="width: 60px; height: 60px; border-radius: 50%; background: #e9ecef; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 1.5em; color: #6c757d;">👤</div>`
                    }
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
        const typeIcon = card.type === 'match' ? '🏟️' : '📚';
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
                        <span style="margin-right: 15px;">🏟️ ${matchCardCount} match card${matchCardCount !== 1 ? 's' : ''}</span>
                        <span>📚 ${priorCardCount} prior record${priorCardCount !== 1 ? 's' : ''}</span>
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
        
        // Load referees if not already loaded (wait for it to complete)
        if (this.referees.length === 0) {
            this.loadReferees().then(() => {
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
    
    editMatchResult(eventId, matchId) {
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        
        if (!match) return;
        
        // Store current match for addCard function
        this.currentMatch = match;
        
        const modal = this.createModal(`Match Result: ${homeTeam.name} vs ${awayTeam.name}`, `
            <div class="form-group">
                <label class="form-label">Match Status</label>
                <select class="form-select" id="match-status">
                    <option value="scheduled" ${match.matchStatus === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                    <option value="in_progress" ${match.matchStatus === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${match.matchStatus === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="cancelled" ${match.matchStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </div>
            <div style="display: flex; gap: 15px;">
                <div class="form-group" style="flex: 1;">
                    <label class="form-label">${homeTeam.name} Score</label>
                    <input type="number" class="form-input" id="home-score" value="${match.homeScore !== null ? match.homeScore : ''}" min="0">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label class="form-label">${awayTeam.name} Score</label>
                    <input type="number" class="form-input" id="away-score" value="${match.awayScore !== null ? match.awayScore : ''}" min="0">
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Cards & Disciplinary Actions</label>
                <div id="cards-container">
                    ${match.cards && match.cards.length > 0 ? match.cards.map((card, index) => {
                        return `
                            <div class="card-item" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                                <div style="display: flex; gap: 10px; align-items: center;">
                                    <select class="form-select" style="flex: 1;" data-card-index="${index}" data-field="memberId">
                                        <option value="">Select Player</option>
                                        ${homeTeam.members.map(m => `<option value="${m.id}" ${card.memberId === m.id ? 'selected' : ''}>${m.name} (${homeTeam.name})</option>`).join('')}
                                        ${awayTeam.members.map(m => `<option value="${m.id}" ${card.memberId === m.id ? 'selected' : ''}>${m.name} (${awayTeam.name})</option>`).join('')}
                                    </select>
                                    <select class="form-select" style="width: 120px;" data-card-index="${index}" data-field="cardType">
                                        <option value="yellow" ${card.cardType === 'yellow' ? 'selected' : ''}>🟨 Yellow</option>
                                        <option value="red" ${card.cardType === 'red' ? 'selected' : ''}>🟥 Red</option>
                                    </select>
                                    <input type="number" class="form-input" style="width: 80px;" placeholder="Min" data-card-index="${index}" data-field="minute" value="${card.minute || ''}" min="1" max="120">
                                    <button class="btn btn-small btn-danger" onclick="app.removeCard(${index})">🗑️</button>
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    <select class="form-select" style="flex: 1;" data-card-index="${index}" data-field="reason">
                                        <option value="">Select Reason</option>
                                        <option value="Unsporting behavior" ${card.reason === 'Unsporting behavior' ? 'selected' : ''}>Unsporting behavior</option>
                                        <option value="Dissent by word or action" ${card.reason === 'Dissent by word or action' ? 'selected' : ''}>Dissent by word or action</option>
                                        <option value="Persistent infringement" ${card.reason === 'Persistent infringement' ? 'selected' : ''}>Persistent infringement</option>
                                        <option value="Delaying the restart of play" ${card.reason === 'Delaying the restart of play' ? 'selected' : ''}>Delaying the restart of play</option>
                                        <option value="Failure to respect distance" ${card.reason === 'Failure to respect distance' ? 'selected' : ''}>Failure to respect distance</option>
                                        <option value="Entering/leaving without permission" ${card.reason === 'Entering/leaving without permission' ? 'selected' : ''}>Entering/leaving without permission</option>
                                        <option value="Serious foul play" ${card.reason === 'Serious foul play' ? 'selected' : ''}>Serious foul play</option>
                                        <option value="Violent conduct" ${card.reason === 'Violent conduct' ? 'selected' : ''}>Violent conduct</option>
                                        <option value="Spitting" ${card.reason === 'Spitting' ? 'selected' : ''}>Spitting</option>
                                        <option value="Offensive/insulting language" ${card.reason === 'Offensive/insulting language' ? 'selected' : ''}>Offensive/insulting language</option>
                                        <option value="Second yellow card" ${card.reason === 'Second yellow card' ? 'selected' : ''}>Second yellow card</option>
                                    </select>
                                    <input type="text" class="form-input" style="flex: 1;" placeholder="Additional Notes (optional)" data-card-index="${index}" data-field="notes" value="${card.notes || ''}">
                                </div>
                            </div>
                        `;
                    }).join('') : '<p style="text-align: center; color: #666; font-style: italic;">No cards issued</p>'}
                </div>
                <button class="btn btn-secondary" onclick="app.addCard()" style="margin-top: 10px;">+ Add Card</button>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
                <button class="btn" onclick="app.saveMatchResult('${eventId}', '${matchId}')">Save Result</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    addCard() {
        const container = document.getElementById('cards-container');
        const existingCards = container.querySelectorAll('.card-item');
        const newIndex = existingCards.length;
        
        // Remove "no cards" message if it exists
        const noCardsMsg = container.querySelector('p');
        if (noCardsMsg) noCardsMsg.remove();
        
        const homeTeam = this.teams.find(t => t.id === this.currentMatch?.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === this.currentMatch?.awayTeamId);
        
        const cardHtml = `
            <div class="card-item" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select class="form-select" style="flex: 1;" data-card-index="${newIndex}" data-field="memberId">
                        <option value="">Select Player</option>
                        ${homeTeam?.members.map(m => `<option value="${m.id}">${m.name} (${homeTeam.name})</option>`).join('') || ''}
                        ${awayTeam?.members.map(m => `<option value="${m.id}">${m.name} (${awayTeam.name})</option>`).join('') || ''}
                    </select>
                    <select class="form-select" style="width: 120px;" data-card-index="${newIndex}" data-field="cardType">
                        <option value="yellow">🟨 Yellow</option>
                        <option value="red">🟥 Red</option>
                    </select>
                    <input type="number" class="form-input" style="width: 80px;" placeholder="Min" data-card-index="${newIndex}" data-field="minute" min="1" max="120">
                    <button class="btn btn-small btn-danger" onclick="app.removeCard(${newIndex})">🗑️</button>
                </div>
                <div style="display: flex; gap: 10px;">
                    <select class="form-select" style="flex: 1;" data-card-index="${newIndex}" data-field="reason">
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
                    <input type="text" class="form-input" style="flex: 1;" placeholder="Additional Notes (optional)" data-card-index="${newIndex}" data-field="notes">
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', cardHtml);
    }
    
    removeCard(index) {
        const cardItems = document.querySelectorAll('.card-item');
        if (cardItems[index]) {
            cardItems[index].remove();
            
            // Re-index remaining cards
            const remainingCards = document.querySelectorAll('.card-item');
            remainingCards.forEach((card, newIndex) => {
                card.querySelectorAll('[data-card-index]').forEach(element => {
                    element.setAttribute('data-card-index', newIndex);
                });
                const deleteBtn = card.querySelector('.btn-danger');
                if (deleteBtn) {
                    deleteBtn.setAttribute('onclick', `app.removeCard(${newIndex})`);
                }
            });
            
            // Add "no cards" message if no cards remain
            if (remainingCards.length === 0) {
                document.getElementById('cards-container').innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">No cards issued</p>';
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
        
        // Update match data
        match.matchStatus = matchStatus;
        match.homeScore = homeScore !== '' ? parseInt(homeScore) : null;
        match.awayScore = awayScore !== '' ? parseInt(awayScore) : null;
        
        // Collect cards data
        const cardItems = document.querySelectorAll('.card-item');
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
        
        match.cards = cards;
        
        try {
            await this.saveEvents();
            this.renderEvents();
            this.closeModal();
        } catch (error) {
            alert('Failed to save match result. Please try again.');
        }
    }
    
    viewMatch(eventId, matchId) {
        this.currentModalType = 'match'; // Set modal type
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        const mainReferee = match.mainRefereeId ? this.referees.find(r => r.id === match.mainRefereeId) : null;
        const assistantReferee = match.assistantRefereeId ? this.referees.find(r => r.id === match.assistantRefereeId) : null;
        
        const modal = this.createModal(`Match: ${homeTeam.name} vs ${awayTeam.name}`, `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <p><strong>Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
                ${match.field ? `<p><strong>Field:</strong> ${match.field}</p>` : ''}
                ${match.time ? `<p><strong>Time:</strong> ${match.time.substring(0, 5)}</p>` : ''}
                ${mainReferee ? `<p><strong>Referee:</strong> ${mainReferee.name}${assistantReferee ? `, ${assistantReferee.name}` : ''}</p>` : ''}
                ${match.notes ? `<p><strong>Notes:</strong> ${match.notes}</p>` : ''}
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="radio" name="team-toggle" value="both" checked onchange="app.toggleTeamView('both')">
                    <span>Show Both Teams</span>
                </label>
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-top: 8px;">
                    <input type="radio" name="team-toggle" value="home" onchange="app.toggleTeamView('home')">
                    <span>Show ${homeTeam.name} Only</span>
                </label>
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin-top: 8px;">
                    <input type="radio" name="team-toggle" value="away" onchange="app.toggleTeamView('away')">
                    <span>Show ${awayTeam.name} Only</span>
                </label>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div id="home-team-section">
                    <div style="background: ${homeTeam.colorData}; color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                        <h3 style="margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${homeTeam.name} (Home)</h3>
                    </div>
                    <div class="attendees-list">
                        ${homeTeam.members.map(member => {
                            const isCheckedIn = match.homeTeamAttendees.some(a => a.memberId === member.id);
                            return `
                                <div class="attendee-row ${isCheckedIn ? 'checked-in' : ''}" onclick="app.toggleMatchAttendance('${eventId}', '${matchId}', '${member.id}', 'home')">
                                    <div class="member-info-full">
                                        ${member.photo ? `<img src="${member.photo}" alt="${member.name}" class="member-photo-small">` : `<div class="member-photo-small"></div>`}
                                        <div class="member-details-full">
                                            <div class="member-name-full">${member.name}</div>
                                            <div class="member-meta-full">
                                                ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                                ${member.gender ? ` • ${member.gender}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="checkbox-area">
                                        <div class="attendance-checkbox ${isCheckedIn ? 'checked' : ''}">
                                            ${isCheckedIn ? '✓' : '○'}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div id="away-team-section">
                    <div style="background: ${awayTeam.colorData}; color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                        <h3 style="margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${awayTeam.name} (Away)</h3>
                    </div>
                    <div class="attendees-list">
                        ${awayTeam.members.map(member => {
                            const isCheckedIn = match.awayTeamAttendees.some(a => a.memberId === member.id);
                            return `
                                <div class="attendee-row ${isCheckedIn ? 'checked-in' : ''}" onclick="app.toggleMatchAttendance('${eventId}', '${matchId}', '${member.id}', 'away')">
                                    <div class="member-info-full">
                                        ${member.photo ? `<img src="${member.photo}" alt="${member.name}" class="member-photo-small">` : `<div class="member-photo-small"></div>`}
                                        <div class="member-details-full">
                                            <div class="member-name-full">${member.name}</div>
                                            <div class="member-meta-full">
                                                ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                                ${member.gender ? ` • ${member.gender}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="checkbox-area">
                                        <div class="attendance-checkbox ${isCheckedIn ? 'checked' : ''}">
                                            ${isCheckedIn ? '✓' : '○'}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button class="btn btn-secondary" onclick="app.closeModal()">Close</button>
            </div>
        `);
        
        document.body.appendChild(modal);
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
            
            alert(`Failed to update attendance: ${error.message}\\n\\nChanges have been reverted.`);
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