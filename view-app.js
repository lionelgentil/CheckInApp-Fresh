/**
 * CheckIn App v2.10.3 - View Only Mode
 * Read-only version for public viewing
 */

// Version constant - update this single location to change version everywhere
const APP_VERSION = '2.12.0';

class CheckInViewApp {
    constructor() {
        this.teams = [];
        this.events = [];
        this.referees = [];
        this.currentModalType = null;
        
        this.init();
    }
    
    async init() {
        await this.loadTeams();
        await this.loadEvents();
        await this.loadReferees();
        this.renderTeams();
        this.renderEvents();
        this.renderReferees();
        
        // Ensure Events section is shown by default
        this.showSection('events');
    }
    
    // API Methods (read-only)
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
    showSection(sectionName) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Find and activate the clicked button
        const clickedBtn = event?.target || document.querySelector(`[onclick*="${sectionName}"]`);
        if (clickedBtn) {
            clickedBtn.classList.add('active');
        }
        
        // Show section
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName + '-section').classList.add('active');
    }
    
    // Save Teams (for jersey number and photo updates)
    async saveTeams() {
        try {
            const response = await fetch('/api/teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.teams)
            });
            
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
        
        let photo = member.photo; // Keep existing photo if no new one
        
        if (photoFile) {
            try {
                photo = await this.convertFileToBase64(photoFile);
            } catch (error) {
                console.error('Error converting photo:', error);
            }
        }
        
        // Update only jersey number and photo
        member.jerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
        if (photo) member.photo = photo;
        
        try {
            await this.saveTeams();
            this.renderTeams();
            this.closeModal();
        } catch (error) {
            alert('Failed to update player. Please try again.');
        }
    }
    
    // Utility method for file conversion
    async convertFileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    renderTeams() {
        const container = document.getElementById('teams-container');
        
        // Get current filter state
        const filterValue = document.getElementById('category-filter')?.value || 'all';
        
        // Filter and sort teams
        let teamsToShow = this.teams.slice();
        
        if (filterValue !== 'all') {
            teamsToShow = teamsToShow.filter(team => team.category === filterValue);
        }
        
        // Sort alphabetically
        teamsToShow.sort((a, b) => a.name.localeCompare(b.name));
        
        if (teamsToShow.length === 0) {
            let emptyMessage = 'No teams yet';
            let emptySubtext = 'No teams available';
            
            if (filterValue === 'Over 30') {
                emptyMessage = 'No Over 30 teams yet';
                emptySubtext = 'No Over 30 teams available';
            } else if (filterValue === 'Over 40') {
                emptyMessage = 'No Over 40 teams yet';
                emptySubtext = 'No Over 40 teams available';
            }
            
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${emptyMessage}</h3>
                    <p>${emptySubtext}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = teamsToShow.map(team => {
            const captain = team.captainId ? team.members.find(m => m.id === team.captainId) : null;
            return `
            <div class="team-card" style="border-left-color: ${team.colorData}">
                <div class="team-header">
                    <div>
                        <div class="team-name">${team.name}</div>
                        <div class="team-category">${team.category || ''}</div>
                        ${captain ? `<div class="team-captain">👑 Captain: ${captain.name}</div>` : ''}
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
                                    <div class="member-name">${member.name}${member.id === team.captainId ? ' 👑' : ''}</div>
                                    <div class="member-meta">
                                        ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                                        ${member.gender ? ` • ${member.gender}` : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="member-actions">
                                <button class="btn btn-small btn-secondary" onclick="app.editMemberLimited('${team.id}', '${member.id}')" title="Edit Jersey & Photo">✏️</button>
                            </div>
                        </div>
                    `).join('')}
                    ${team.members.length === 0 ? '<div class="empty-state"><p>No members yet</p></div>' : ''}
                </div>
            </div>
        `}).join('');
    }
    
    renderEvents() {
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
                        const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
                        const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
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
    
    // View Match (read-only)
    viewMatch(eventId, matchId) {
        this.currentModalType = 'match';
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
    
    // Save Events (for attendance updates)
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
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.remove();
        });
        
        this.currentModalType = null;
    }
}

// Global functions for onclick handlers
function showSection(sectionName) {
    app.showSection(sectionName);
}

// Initialize app
const app = new CheckInViewApp();