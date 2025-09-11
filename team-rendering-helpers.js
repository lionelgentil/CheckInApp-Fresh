/**
 * CheckIn App v6.1.0 - Refactored Team Rendering Methods
 * Smaller, focused functions extracted from large renderTeams method
 */

// This file contains refactored methods that should replace the large renderTeams method in app.js
// These methods follow the single responsibility principle

/**
 * Helper methods for team rendering (Item 10: Method extraction)
 */

/**
 * Create team selector dropdown HTML
 */
function createTeamSelectorHtml(teams, selectedTeamId) {
    const over30Teams = teams.filter(team => team.category === 'Over 30');
    const over40Teams = teams.filter(team => team.category === 'Over 40');
    
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
    
    return `
        <div class="team-selector-container">
            <label class="form-label">Select a team to view roster:</label>
            <select id="teams-team-selector" class="form-select" onchange="app.renderTeams()">
                <option value="">Choose a team...</option>
                ${optionsHtml}
            </select>
        </div>
    `;
}

/**
 * Calculate roster statistics for a team
 */
function calculateRosterStats(team) {
    const totalPlayers = team.members.length;
    const maleCount = team.members.filter(m => m.gender === 'male').length;
    const femaleCount = team.members.filter(m => m.gender === 'female').length;
    const unknownCount = totalPlayers - maleCount - femaleCount;
    
    return {
        totalPlayers,
        maleCount,
        femaleCount,
        unknownCount
    };
}

/**
 * Calculate team card statistics for current season
 */
function calculateTeamCardStats(team, events, isCurrentSeasonEvent) {
    let teamCurrentSeasonYellow = 0;
    let teamCurrentSeasonRed = 0;
    
    team.members.forEach(member => {
        events.forEach(event => {
            // Only count cards from current season events
            if (isCurrentSeasonEvent(event.date)) {
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
    
    return {
        teamCurrentSeasonYellow,
        teamCurrentSeasonRed
    };
}

/**
 * Calculate individual member card statistics
 */
function calculateMemberCardStats(member, events, isCurrentSeasonEvent) {
    let currentYellowCards = 0;
    let currentRedCards = 0;
    
    events.forEach(event => {
        // Only count cards from current season events
        if (isCurrentSeasonEvent(event.date)) {
            event.matches.forEach(match => {
                if (match.cards) {
                    const memberCards = match.cards.filter(card => card.memberId === member.id);
                    currentYellowCards += memberCards.filter(card => card.cardType === 'yellow').length;
                    currentRedCards += memberCards.filter(card => card.cardType === 'red').length;
                }
            });
        }
    });
    
    return {
        currentYellowCards,
        currentRedCards
    };
}

/**
 * Create team header HTML with actions
 */
function createTeamHeaderHtml(team, captain) {
    return `
        <div class="team-header">
            <div>
                <div class="team-name">${team.name}</div>
                <div class="team-category">${team.category || ''}</div>
                ${captain ? `<div class="team-captain">👑 Captain: ${captain.name}</div>` : ''}
            </div>
            <div class="team-actions">
                <button class="btn btn-small" onclick="app.showAddMemberModal('${team.id}')" title="Add Member">+</button>
                ${team.members.length > 0 ? `<button class="btn btn-small btn-captain" onclick="app.showCaptainModal('${team.id}')" title="Set Captain">👑</button>` : ''}
                <button class="btn btn-small btn-secondary" onclick="app.editTeam('${team.id}')" title="Edit Team">✏️</button>
                <button class="btn btn-small btn-danger" onclick="app.deleteTeam('${team.id}')" title="Delete Team">🗑️</button>
            </div>
        </div>
    `;
}

/**
 * Create roster statistics HTML
 */
function createRosterStatsHtml(team, rosterStats, cardStats) {
    const { totalPlayers, maleCount, femaleCount, unknownCount } = rosterStats;
    const { teamCurrentSeasonYellow, teamCurrentSeasonRed } = cardStats;
    
    if (totalPlayers === 0) return '';
    
    return `
        <div class="roster-stats" style="margin: 12px 0; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 0.9em; color: #666;">
            <div style="margin-bottom: 6px;"><strong>👥 ${totalPlayers} player${totalPlayers !== 1 ? 's' : ''}</strong></div>
            ${maleCount > 0 || femaleCount > 0 ? `
                <div style="margin-bottom: 6px;">👨 ${maleCount} male${maleCount !== 1 ? 's' : ''} • 👩 ${femaleCount} female${femaleCount !== 1 ? 's' : ''} ${unknownCount > 0 ? `• ❓ ${unknownCount} unspecified` : ''}</div>
            ` : ''}
            <div id="team-card-stats-${team.id}" style="margin-bottom: 3px;">
                <strong>📋 Team Cards:</strong> 
                ${teamCurrentSeasonYellow + teamCurrentSeasonRed > 0 ? `🟨${teamCurrentSeasonYellow} 🟥${teamCurrentSeasonRed} (current season)` : 'No current season cards'}
                <span id="team-lifetime-stats-${team.id}"> • Loading disciplinary records...</span>
            </div>
        </div>
    `;
}

/**
 * Create member item HTML
 */
function createMemberItemHtml(member, team, memberCardStats, getLazyImageHtml) {
    const { currentYellowCards, currentRedCards } = memberCardStats;
    
    const currentCardsDisplay = [];
    if (currentYellowCards > 0) currentCardsDisplay.push(`🟨${currentYellowCards}`);
    if (currentRedCards > 0) currentCardsDisplay.push(`🟥${currentRedCards}`);
    const currentCardsText = currentCardsDisplay.length > 0 ? ` • ${currentCardsDisplay.join(' ')} (current season)` : '';
    
    return `
        <div class="member-item">
            <div class="member-info">
                ${getLazyImageHtml(member, 'member-photo')}
                <div class="member-details">
                    <div class="member-name">${member.name}${member.id === team.captainId ? ' 👑' : ''}</div>
                    <div class="member-meta" id="member-meta-${member.id}">
                        ${member.jerseyNumber ? `#${member.jerseyNumber}` : ''}
                        ${member.gender ? ` • ${member.gender}` : ''}
                        ${currentCardsText}
                        <span class="lifetime-cards" id="lifetime-cards-${member.id}"> • Loading disciplinary records...</span>
                    </div>
                </div>
            </div>
            <div class="member-actions">
                <button class="btn btn-small" onclick="app.viewPlayerProfile('${team.id}', '${member.id}')" title="View Profile">👤</button>
                <button class="btn btn-small btn-secondary" onclick="app.editMember('${team.id}', '${member.id}')" title="Edit Member">✏️</button>
                <button class="btn btn-small btn-danger" onclick="app.deleteMember('${team.id}', '${member.id}')" title="Delete Member">🗑️</button>
            </div>
        </div>
    `;
}

/**
 * Create members list HTML
 */
function createMembersListHtml(team, events, isCurrentSeasonEvent, getLazyImageHtml) {
    if (team.members.length === 0) {
        return '<div class="empty-state"><p>No members yet</p></div>';
    }
    
    const sortedMembers = team.members
        .slice() // Create a copy to avoid mutating original array
        .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name
    
    return sortedMembers.map(member => {
        const memberCardStats = calculateMemberCardStats(member, events, isCurrentSeasonEvent);
        return createMemberItemHtml(member, team, memberCardStats, getLazyImageHtml);
    }).join('');
}

/**
 * Create selected team details HTML
 */
function createSelectedTeamHtml(team, events, isCurrentSeasonEvent, getLazyImageHtml) {
    const captain = team.captainId ? team.members.find(m => m.id === team.captainId) : null;
    const rosterStats = calculateRosterStats(team);
    const cardStats = calculateTeamCardStats(team, events, isCurrentSeasonEvent);
    
    return `
        <div class="selected-team-container">
            <div class="team-card-full" style="border-left-color: ${team.colorData}">
                ${createTeamHeaderHtml(team, captain)}
                <div class="team-description">${team.description || ''}</div>
                ${createRosterStatsHtml(team, rosterStats, cardStats)}
                <div class="members-list-full">
                    ${createMembersListHtml(team, events, isCurrentSeasonEvent, getLazyImageHtml)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Refactored renderTeams method - much smaller and focused
 */
function renderTeams() {
    const container = document.getElementById('teams-container');
    const selectedTeamId = document.getElementById('teams-team-selector')?.value;
    
    // Get all teams and sort alphabetically
    const teamsToShow = this.teams.slice().sort((a, b) => a.name.localeCompare(b.name));
    
    // Handle empty state
    if (teamsToShow.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No teams yet</h3>
                <p>Create your first team to get started</p>
            </div>
        `;
        return;
    }
    
    // Build selector HTML
    let html = createTeamSelectorHtml(teamsToShow, selectedTeamId);
    
    // Add selected team details if a team is selected
    if (selectedTeamId) {
        const selectedTeam = this.teams.find(team => team.id === selectedTeamId);
        if (selectedTeam) {
            html += createSelectedTeamHtml(
                selectedTeam, 
                this.events, 
                this.isCurrentSeasonEvent.bind(this), 
                this.getLazyImageHtml.bind(this)
            );
        }
    }
    
    // Update DOM
    container.innerHTML = html;
    
    // Load lifetime cards and initialize lazy loading
    if (selectedTeamId) {
        const selectedTeam = this.teams.find(team => team.id === selectedTeamId);
        if (selectedTeam && selectedTeam.members.length > 0) {
            this.loadLifetimeCardsForTeam(selectedTeam);
        }
    }
    
    // Initialize lazy loading for newly rendered images
    this.initializeLazyImages(container);
}

// Export functions for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createTeamSelectorHtml,
        calculateRosterStats,
        calculateTeamCardStats,
        calculateMemberCardStats,
        createTeamHeaderHtml,
        createRosterStatsHtml,
        createMemberItemHtml,
        createMembersListHtml,
        createSelectedTeamHtml,
        renderTeams
    };
}