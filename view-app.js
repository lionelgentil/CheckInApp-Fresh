/**
 * CheckIn App v2.16.2 - View Only Mode
 * Read-only version for public viewing
 */

// Version constant - update this single location to change version everywhere
const APP_VERSION = '2.16.2';

class CheckInViewApp {
    constructor() {
        this.teams = [];
        this.events = [];
        this.referees = [];
        this.currentModalType = null;
        
        this.init();
    }
    
    async init() {
        // Only load events by default (lazy load other sections)
        await this.loadEvents();
        this.renderEvents();
        
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
        if (sectionName === 'teams' && this.teams.length === 0) {
            await this.loadTeams();
            this.renderTeams();
        } else if (sectionName === 'referees' && this.referees.length === 0) {
            await this.loadReferees();
            this.renderReferees();
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
    
    // Player Profile Management  
    async viewPlayerProfile(teamId, memberId) {
        const team = this.teams.find(t => t.id === teamId);
        const member = team?.members.find(m => m.id === memberId);
        
        if (!team || !member) return;
        
        // Get all match cards for this player across all events
        const matchCards = [];
        this.events.forEach(event => {
            event.matches.forEach(match => {
                if (match.cards) {
                    match.cards.forEach(card => {
                        if (card.memberId === memberId) {
                            const homeTeam = this.teams.find(t => t.id === match.homeTeamId);
                            const awayTeam = this.teams.find(t => t.id === match.awayTeamId);
                            
                            matchCards.push({
                                type: 'match',
                                eventName: event.name,
                                eventDate: event.date,
                                matchInfo: `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`,
                                cardType: card.cardType,
                                reason: card.reason,
                                notes: card.notes,
                                minute: card.minute
                            });
                        }
                    });
                }
            });
        });
        
        // Get disciplinary records from database
        let disciplinaryRecords = [];
        try {
            const response = await fetch(`/api/disciplinary-records?member_id=${memberId}`);
            if (response.ok) {
                const records = await response.json();
                disciplinaryRecords = records.map(record => ({
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
            }
        } catch (error) {
            console.error('Error loading disciplinary records:', error);
        }
        
        // Combine all cards and sort by date (most recent first)
        const allCards = [...matchCards, ...disciplinaryRecords];
        allCards.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
        
        const totalCards = allCards.length;
        const matchCardCount = matchCards.length;
        const priorCardCount = disciplinaryRecords.length;
        
        const modal = this.createModal(`Player Profile: ${member.name}`, `
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
            </div>
            
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
                        ${allCards.map(card => {
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
                                </div>
                            `;
                        }).join('')}
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
            
            // Calculate roster statistics
            const totalPlayers = team.members.length;
            const maleCount = team.members.filter(m => m.gender === 'male').length;
            const femaleCount = team.members.filter(m => m.gender === 'female').length;
            const unknownCount = totalPlayers - maleCount - femaleCount;
            
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
                                <button class="btn btn-small" onclick="app.viewPlayerProfile('${team.id}', '${member.id}')" title="View Profile">👤</button>
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
                                    <button class="btn btn-small btn-secondary" onclick="app.editMatchResult('${event.id}', '${match.id}')" title="Edit Result">🏆</button>
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
                        <h3 style="margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${homeTeam.name} (Home) ${hasScore ? `- ${match.homeScore}` : ''}</h3>
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
                        <h3 style="margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${awayTeam.name} (Away) ${hasScore ? `- ${match.awayScore}` : ''}</h3>
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
                                        <option value="Sliding" ${card.reason === 'Sliding' ? 'selected' : ''}>Sliding</option>
                                        <option value="Reckless/aggressive challenge" ${card.reason === 'Reckless/aggressive challenge' ? 'selected' : ''}>Reckless/aggressive challenge</option>
                                        <option value="Denial of a goal scoring opportunity" ${card.reason === 'Denial of a goal scoring opportunity' ? 'selected' : ''}>Denial of a goal scoring opportunity</option>
                                        <option value="Stopping a promising attack" ${card.reason === 'Stopping a promising attack' ? 'selected' : ''}>Stopping a promising attack</option>
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
                        <option value="Serious foul play">Serious foul play</option>
                        <option value="Violent conduct">Violent conduct</option>
                        <option value="Spitting">Spitting</option>
                        <option value="Offensive/insulting language">Offensive/insulting language</option>
                        <option value="Second yellow card">Second yellow card</option>
                        <option value="Sliding">Sliding</option>
                        <option value="Reckless/aggressive challenge">Reckless/aggressive challenge</option>
                        <option value="Denial of a goal scoring opportunity">Denial of a goal scoring opportunity</option>
                        <option value="Stopping a promising attack">Stopping a promising attack</option>
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
async function showSection(sectionName) {
    await app.showSection(sectionName);
}

// Initialize app
const app = new CheckInViewApp();