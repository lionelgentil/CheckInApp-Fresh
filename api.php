<?php
/**
 * CheckIn App - PHP API
 * RESTful API for team and event management
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database connection
$dbPath = __DIR__ . '/data/checkin.db';
try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('PRAGMA foreign_keys = ON');
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit();
}

// Get request path
$path = $_GET['path'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Route requests
try {
    switch ($path) {
        case 'health':
            echo json_encode([
                'status' => 'OK',
                'timestamp' => date('c'),
                'database' => 'SQLite',
                'php_version' => PHP_VERSION
            ]);
            break;
            
        case 'teams':
            if ($method === 'GET') {
                getTeams($db);
            } elseif ($method === 'POST') {
                saveTeams($db);
            }
            break;
            
        case 'events':
            if ($method === 'GET') {
                getEvents($db);
            } elseif ($method === 'POST') {
                saveEvents($db);
            }
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Endpoint not found']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function getTeams($db) {
    $stmt = $db->query('SELECT * FROM teams ORDER BY name');
    $teams = [];
    
    while ($team = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $memberStmt = $db->prepare('SELECT * FROM team_members WHERE team_id = ? ORDER BY name');
        $memberStmt->execute([$team['id']]);
        
        $members = [];
        while ($member = $memberStmt->fetch(PDO::FETCH_ASSOC)) {
            $members[] = [
                'id' => $member['id'],
                'name' => $member['name'],
                'jerseyNumber' => $member['jersey_number'] ? (int)$member['jersey_number'] : null,
                'gender' => $member['gender'],
                'photo' => $member['photo']
            ];
        }
        
        $teams[] = [
            'id' => $team['id'],
            'name' => $team['name'],
            'colorData' => $team['color'],
            'description' => $team['description'],
            'members' => $members
        ];
    }
    
    echo json_encode($teams);
}

function saveTeams($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        $db->exec('DELETE FROM team_members');
        $db->exec('DELETE FROM teams');
        
        foreach ($input as $team) {
            $stmt = $db->prepare('
                INSERT INTO teams (id, name, color, description)
                VALUES (?, ?, ?, ?)
            ');
            $stmt->execute([
                $team['id'],
                $team['name'],
                $team['colorData'] ?? '#2196F3',
                $team['description'] ?? ''
            ]);
            
            if (isset($team['members']) && is_array($team['members'])) {
                foreach ($team['members'] as $member) {
                    $stmt = $db->prepare('
                        INSERT INTO team_members (id, team_id, name, jersey_number, gender, photo)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $member['id'],
                        $team['id'],
                        $member['name'],
                        $member['jerseyNumber'] ?? null,
                        $member['gender'] ?? null,
                        $member['photo'] ?? null
                    ]);
                }
            }
        }
        
        $db->commit();
        echo json_encode(['success' => true]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function getEvents($db) {
    $stmt = $db->query('SELECT * FROM events ORDER BY date');
    $events = [];
    
    while ($event = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $matchStmt = $db->prepare('SELECT * FROM matches WHERE event_id = ?');
        $matchStmt->execute([$event['id']]);
        
        $matches = [];
        while ($match = $matchStmt->fetch(PDO::FETCH_ASSOC)) {
            // Get attendees
            $attendeesStmt = $db->prepare('
                SELECT ma.*, tm.name as member_name
                FROM match_attendees ma
                JOIN team_members tm ON ma.member_id = tm.id
                WHERE ma.match_id = ?
            ');
            $attendeesStmt->execute([$match['id']]);
            
            $homeAttendees = [];
            $awayAttendees = [];
            
            while ($attendee = $attendeesStmt->fetch(PDO::FETCH_ASSOC)) {
                $attendeeData = [
                    'memberId' => $attendee['member_id'],
                    'name' => $attendee['member_name'],
                    'checkedInAt' => $attendee['checked_in_at']
                ];
                
                if ($attendee['team_type'] === 'home') {
                    $homeAttendees[] = $attendeeData;
                } else {
                    $awayAttendees[] = $attendeeData;
                }
            }
            
            $matches[] = [
                'id' => $match['id'],
                'homeTeamId' => $match['home_team_id'],
                'awayTeamId' => $match['away_team_id'],
                'time' => $match['match_time'],
                'notes' => $match['notes'],
                'homeTeamAttendees' => $homeAttendees,
                'awayTeamAttendees' => $awayAttendees
            ];
        }
        
        // Get general attendees
        $generalStmt = $db->prepare('SELECT * FROM general_attendees WHERE event_id = ?');
        $generalStmt->execute([$event['id']]);
        
        $attendees = [];
        while ($attendee = $generalStmt->fetch(PDO::FETCH_ASSOC)) {
            $attendees[] = [
                'memberId' => $attendee['member_id'],
                'name' => $attendee['name'],
                'team' => $attendee['team_name'],
                'status' => $attendee['status'],
                'checkedInAt' => $attendee['checked_in_at']
            ];
        }
        
        $events[] = [
            'id' => $event['id'],
            'name' => $event['name'],
            'date' => $event['date'],
            'description' => $event['description'],
            'matches' => $matches,
            'attendees' => $attendees
        ];
    }
    
    echo json_encode($events);
}

function saveEvents($db) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON data']);
        return;
    }
    
    $db->beginTransaction();
    
    try {
        $db->exec('DELETE FROM general_attendees');
        $db->exec('DELETE FROM match_attendees');
        $db->exec('DELETE FROM matches');
        $db->exec('DELETE FROM events');
        
        foreach ($input as $event) {
            $stmt = $db->prepare('
                INSERT INTO events (id, name, date, description)
                VALUES (?, ?, ?, ?)
            ');
            $stmt->execute([
                $event['id'],
                $event['name'],
                $event['date'],
                $event['description'] ?? ''
            ]);
            
            if (isset($event['matches']) && is_array($event['matches'])) {
                foreach ($event['matches'] as $match) {
                    $stmt = $db->prepare('
                        INSERT INTO matches (id, event_id, home_team_id, away_team_id, match_time, notes)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $match['id'],
                        $event['id'],
                        $match['homeTeamId'],
                        $match['awayTeamId'],
                        $match['time'] ?? null,
                        $match['notes'] ?? null
                    ]);
                    
                    // Save attendees
                    if (isset($match['homeTeamAttendees'])) {
                        foreach ($match['homeTeamAttendees'] as $attendee) {
                            $stmt = $db->prepare('
                                INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at)
                                VALUES (?, ?, "home", ?)
                            ');
                            $stmt->execute([
                                $match['id'],
                                $attendee['memberId'],
                                $attendee['checkedInAt']
                            ]);
                        }
                    }
                    
                    if (isset($match['awayTeamAttendees'])) {
                        foreach ($match['awayTeamAttendees'] as $attendee) {
                            $stmt = $db->prepare('
                                INSERT INTO match_attendees (match_id, member_id, team_type, checked_in_at)
                                VALUES (?, ?, "away", ?)
                            ');
                            $stmt->execute([
                                $match['id'],
                                $attendee['memberId'],
                                $attendee['checkedInAt']
                            ]);
                        }
                    }
                }
            }
            
            if (isset($event['attendees']) && is_array($event['attendees'])) {
                foreach ($event['attendees'] as $attendee) {
                    $stmt = $db->prepare('
                        INSERT INTO general_attendees (event_id, member_id, name, team_name, status, checked_in_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ');
                    $stmt->execute([
                        $event['id'],
                        $attendee['memberId'],
                        $attendee['name'],
                        $attendee['team'] ?? null,
                        $attendee['status'] ?? 'present',
                        $attendee['checkedInAt']
                    ]);
                }
            }
        }
        
        $db->commit();
        echo json_encode(['success' => true]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function generateUUID() {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}
?>