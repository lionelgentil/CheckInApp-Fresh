/**
 * CheckIn App v2.0 - JavaScript Frontend
 * Works with PHP/SQLite backend
 */

class CheckInApp {
    constructor() {
        this.teams = [];
        this.events = [];
        this.currentEditingTeam = null;
        this.currentEditingMember = null;
        this.currentEditingEvent = null;
        
        this.init();
    }
    
    async init() {
        await this.loadTeams();
        await this.loadEvents();
        this.renderTeams();
        this.renderEvents();
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
        console.log('saveTeams called with teams:', this.teams);
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
    
    // Utility Methods
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    async convertFileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    // UI Methods
    showSection(sectionName) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Show section
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName + '-section').classList.add('active');
    }
    
    renderTeams() {
        const container = document.getElementById('teams-container');
        
        if (this.teams.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No teams yet</h3>
                    <p>Create your first team to get started</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.teams.map(team => `
            <div class="team-card" style="border-left-color: ${team.colorData}">
                <div class="team-header">
                    <div>
                        <div class="team-name">${team.name}</div>
                        <div class="team-category">${team.category || ''}</div>
                    </div>
                    <div class="team-actions">
                        <button class="btn btn-small" onclick="app.showAddMemberModal('${team.id}')">Add Member</button>
                        <button class="btn btn-small btn-secondary" onclick="app.editTeam('${team.id}')">Edit</button>
                        <button class="btn btn-small btn-danger" onclick="app.deleteTeam('${team.id}')">Delete</button>
                    </div>
                </div>
                <div class="team-description">${team.description || ''}</div>
                <div class="members-list">
                    ${team.members.map(member => `
                        <div class="member-item">
                            <div class="member-info">
                                ${member.photo ? 
                                    `<img src="${member.photo}" alt="${member.name}" class="member-photo">` :
                                    `<div class="member-photo"></div>`
                                }
                                <div class="member-details">
                                    <div class="member-name">${member.name}</div>
                                    <div class="member-meta">
                                        ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                        ${member.gender ? ` • ${member.gender}` : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="member-actions">
                                <button class="btn btn-small btn-secondary" onclick="app.editMember('${team.id}', '${member.id}')">Edit</button>
                                <button class="btn btn-small btn-danger" onclick="app.deleteMember('${team.id}', '${member.id}')">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                    ${team.members.length === 0 ? '<div class="empty-state"><p>No members yet</p></div>' : ''}
                </div>
            </div>
        `).join('');
    }
    
    renderEvents() {
        const container = document.getElementById('events-container');
        
        if (this.events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No events yet</h3>
                    <p>Create your first event to get started</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.events.map(event => `
            <div class="event-card">
                <div class="event-header">
                    <div>
                        <div class="event-name">${event.name}</div>
                        <div class="event-date">${new Date(event.date).toLocaleDateString()}</div>
                    </div>
                    <div class="team-actions">
                        <button class="btn btn-small" onclick="app.showAddMatchModal('${event.id}')">Add Match</button>
                        <button class="btn btn-small btn-secondary" onclick="app.editEvent('${event.id}')">Edit</button>
                        <button class="btn btn-small btn-danger" onclick="app.deleteEvent('${event.id}')">Delete</button>
                    </div>
                </div>
                <div class="event-description">${event.description || ''}</div>
                <div class="matches-container">
                    ${event.matches.map(match => {
                        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
                        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
                        return `
                            <div class="match-item">
                                <div class="match-teams">
                                    <span class="team-name-match">${homeTeam ? homeTeam.name : 'Unknown Team'}</span>
                                    <span class="vs-text">VS</span>
                                    <span class="team-name-match">${awayTeam ? awayTeam.name : 'Unknown Team'}</span>
                                </div>
                                ${match.field ? `<div class="match-field">Field: ${match.field}</div>` : ''}
                                ${match.time ? `<div class="match-time">Time: ${match.time}</div>` : ''}
                                <div class="match-actions">
                                    <button class="btn btn-small" onclick="app.viewMatch('${event.id}', '${match.id}')">View Match</button>
                                    <button class="btn btn-small btn-danger" onclick="app.deleteMatch('${event.id}', '${match.id}')">Delete</button>
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
        
        console.log('Form values:', { name, category, color, description });
        
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
        } else {
            // Add new team
            const newTeam = {
                id: this.generateUUID(),
                name: name,
                category: category,
                colorData: color,
                description: description,
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
    
    // Member Management
    showAddMemberModal(teamId) {
        this.currentEditingMember = null;
        this.showMemberModal(teamId);
    }
    
    editMember(teamId, memberId) {
        const team = this.teams.find(t => t.id === teamId);
        this.currentEditingMember = team.members.find(m => m.id === memberId);
        this.showMemberModal(teamId, this.currentEditingMember);
    }
    
    showMemberModal(teamId, member = null) {
        const isEdit = member !== null;
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
                <label class="form-label">Photo</label>
                <input type="file" class="form-input file-input" id="member-photo" accept="image/*">
                ${member && member.photo ? `<img src="${member.photo}" alt="Current photo" class="preview-image">` : ''}
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
        
        let photo = this.currentEditingMember ? this.currentEditingMember.photo : null;
        
        if (photoFile) {
            try {
                photo = await this.convertFileToBase64(photoFile);
            } catch (error) {
                console.error('Error converting photo:', error);
            }
        }
        
        if (this.currentEditingMember) {
            // Edit existing member
            this.currentEditingMember.name = name;
            this.currentEditingMember.jerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
            this.currentEditingMember.gender = gender || null;
            if (photo) this.currentEditingMember.photo = photo;
        } else {
            // Add new member
            const newMember = {
                id: this.generateUUID(),
                name: name,
                jerseyNumber: jerseyNumber ? parseInt(jerseyNumber) : null,
                gender: gender || null,
                photo: photo
            };
            team.members.push(newMember);
        }
        
        try {
            await this.saveTeams();
            this.renderTeams();
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
        const field = document.getElementById('match-field').value.trim();
        const time = document.getElementById('match-time').value;
        const notes = document.getElementById('match-notes').value.trim();
        
        if (!homeTeamId || !awayTeamId) {
            alert('Please select both home and away teams');
            return;
        }
        
        if (homeTeamId === awayTeamId) {
            alert('Home and away teams must be different');
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
            notes: notes,
            homeTeamAttendees: [],
            awayTeamAttendees: []
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
    
    viewMatch(eventId, matchId) {
        const event = this.events.find(e => e.id === eventId);
        const match = event.matches.find(m => m.id === matchId);
        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
        
        const modal = this.createModal(`Match: ${homeTeam.name} vs ${awayTeam.name}`, `
            <div style="margin-bottom: 20px;">
                ${match.field ? `<p><strong>Field:</strong> ${match.field}</p>` : ''}
                ${match.time ? `<p><strong>Time:</strong> ${match.time}</p>` : ''}
                ${match.notes ? `<p><strong>Notes:</strong> ${match.notes}</p>` : ''}
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <h3 style="color: ${homeTeam.colorData}; margin-bottom: 15px;">${homeTeam.name} (Home)</h3>
                    <div class="attendees-grid">
                        ${homeTeam.members.map(member => {
                            const isCheckedIn = match.homeTeamAttendees.some(a => a.memberId === member.id);
                            return `
                                <div class="attendee-item ${isCheckedIn ? 'checked-in' : ''}" onclick="app.toggleMatchAttendance('${eventId}', '${matchId}', '${member.id}', 'home')">
                                    <div class="member-info">
                                        ${member.photo ? `<img src="${member.photo}" alt="${member.name}" class="member-photo">` : `<div class="member-photo"></div>`}
                                        <div class="member-details">
                                            <div class="member-name">${member.name}</div>
                                            <div class="member-meta">
                                                ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                                ${member.gender ? ` • ${member.gender}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div style="color: ${isCheckedIn ? '#28a745' : '#6c757d'}; font-weight: bold;">
                                        ${isCheckedIn ? '✓' : '○'}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div>
                    <h3 style="color: ${awayTeam.colorData}; margin-bottom: 15px;">${awayTeam.name} (Away)</h3>
                    <div class="attendees-grid">
                        ${awayTeam.members.map(member => {
                            const isCheckedIn = match.awayTeamAttendees.some(a => a.memberId === member.id);
                            return `
                                <div class="attendee-item ${isCheckedIn ? 'checked-in' : ''}" onclick="app.toggleMatchAttendance('${eventId}', '${matchId}', '${member.id}', 'away')">
                                    <div class="member-info">
                                        ${member.photo ? `<img src="${member.photo}" alt="${member.name}" class="member-photo">` : `<div class="member-photo"></div>`}
                                        <div class="member-details">
                                            <div class="member-name">${member.name}</div>
                                            <div class="member-meta">
                                                ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                                ${member.gender ? ` • ${member.gender}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div style="color: ${isCheckedIn ? '#28a745' : '#6c757d'}; font-weight: bold;">
                                        ${isCheckedIn ? '✓' : '○'}
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
        
        if (existingIndex >= 0) {
            // Remove attendance
            attendeesArray.splice(existingIndex, 1);
            console.log('Removed attendance for member:', memberId);
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
        }
        
        try {
            console.log('Saving events...');
            await this.saveEvents();
            console.log('Events saved successfully');
            // Refresh the modal
            this.closeModal();
            setTimeout(() => this.viewMatch(eventId, matchId), 100);
        } catch (error) {
            console.error('Failed to save events:', error);
            alert(`Failed to update attendance: ${error.message}\n\nCheck browser console for details.`);
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
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.remove();
        });
    }
}

// Global functions for onclick handlers
function showSection(sectionName) {
    app.showSection(sectionName);
}

// Initialize app
const app = new CheckInApp();