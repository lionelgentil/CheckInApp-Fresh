<?php
header('Content-Type: application/json');
error_reporting(E_ALL);
ini_set('display_errors', 1);

function connectToDatabase() {
    // Check common Railway PostgreSQL variable patterns
    $possibleVars = array('DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL');
    $databaseUrl = null;
    
    foreach ($possibleVars as $var) {
        if (isset($_ENV[$var])) {
            $databaseUrl = $_ENV[$var];
            break;
        }
    }
    
    // Also check getenv function
    if (!$databaseUrl) {
        foreach ($possibleVars as $var) {
            $envValue = getenv($var);
            if ($envValue) {
                $databaseUrl = $envValue;
                break;
            }
        }
    }
    
    // Also check for any PostgreSQL connection strings in environment
    foreach ($_ENV as $key => $value) {
        if ((strpos($key, 'DATABASE_URL') !== false || 
             strpos($key, 'POSTGRES') !== false) && 
            strpos($value, 'postgres://') === 0) {
            $databaseUrl = $value;
            break;
        }
    }
    
    if (!$databaseUrl) {
        throw new Exception('PostgreSQL database required. No DATABASE_URL found.');
    }
    
    $db_parts = parse_url($databaseUrl);
    $host = $db_parts['host'];
    $port = $db_parts['port'];
    $dbname = ltrim($db_parts['path'], '/');
    $username = $db_parts['user'];
    $password = $db_parts['pass'];
    
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;sslmode=require";
    $pdo = new PDO($dsn, $username, $password, array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ));
    
    return $pdo;
}

function parseGameDate($dateStr) {
    $dateStr = trim($dateStr);
    
    // Handle MM/DD/YYYY format
    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $dateStr, $matches)) {
        $month = intval($matches[1]);
        $day = intval($matches[2]);
        $year = intval($matches[3]);
        
        // Create date and convert to epoch
        $date = DateTime::createFromFormat('n/j/Y', "$month/$day/$year");
        if ($date) {
            return $date->getTimestamp();
        }
    }
    
    return null;
}

function normalizePlayerName($name) {
    $name = trim($name);
    
    // Remove quotes
    $name = str_replace(array('"', "'"), '', $name);
    
    // Handle "Last, First (Gender)" format
    if (preg_match('/^(.+?),\s*(.+?)\s*\((?:Male|Female)\)$/i', $name, $matches)) {
        $lastName = trim($matches[1]);
        $firstName = trim($matches[2]);
        return "$firstName $lastName";
    }
    
    // Handle "First Last" format (already normalized)
    return $name;
}

function normalizeTeamName($teamName) {
    $teamName = trim($teamName);
    
    // Remove division indicators in parentheses
    $teamName = preg_replace('/\s*\([^)]*\)$/', '', $teamName);
    
    // Common team name mappings
    $mappings = array(
        'Lumberjacks' => 'Lumberjacks',
        'Renegades' => 'Renegades', 
        'Spartans' => 'Spartans',
        'Fireball' => 'Fireball',
        'Rat Pack' => 'Rat Pack',
        'Fire N Ice' => 'Fire N Ice',
        'Miskicks' => 'Miskicks',
        'Flash' => 'Flash',
        'Knights' => 'Knights',
        'Phoenix' => 'Phoenix',
        'Stingrays ReUtd' => 'Stingrays ReUtd',
        'Stingrays' => 'Stingrays',
        'Goal Diggers' => 'Goal Diggers',
        'KR3W' => 'KR3W',
        'Mayhem' => 'Mayhem',
        'Green Achers' => 'Green Achers',
        'GreenAchers' => 'Green Achers',
        'BU1' => 'BU1',
        'BU2' => 'BU2',
        'Boom City' => 'Boom City',
        'Perezosos F.C.' => 'Perezosos F.C.',
        'SloAssBus VSC' => 'SloAssBus VSC',
        'Beers and Tears' => 'Beers and Tears',
        'Shin Splints United' => 'Shin Splints United',
        'Shin Splints Utd' => 'Shin Splints United',
        'Ol\'Limpians' => 'Ol\'Limpians',
        'BenchWarmers' => 'BenchWarmers',
        'Grass Stains' => 'Grass Stains'
    );
    
    return isset($mappings[$teamName]) ? $mappings[$teamName] : $teamName;
}

function normalizeCardType($cardType) {
    $cardType = strtoupper(trim($cardType));
    
    switch ($cardType) {
        case 'YELLOW':
            return 'yellow';
        case 'RED':
            return 'red';
        case 'N/A':
            return null; // Skip N/A records
        default:
            return 'yellow'; // Default to yellow for unclear cases
    }
}

function findPlayerMatch($playerName, $teamName, $players) {
    $normalizedName = strtolower($playerName);
    $normalizedTeam = strtolower($teamName);
    
    // First try exact name and team match
    foreach ($players as $player) {
        if (strtolower($player['name']) === $normalizedName && 
            strtolower($player['team_name']) === $normalizedTeam) {
            return $player;
        }
    }
    
    // Try exact name match regardless of team
    foreach ($players as $player) {
        if (strtolower($player['name']) === $normalizedName) {
            return $player;
        }
    }
    
    // Try fuzzy name matching with team
    foreach ($players as $player) {
        $playerNameLower = strtolower($player['name']);
        $teamNameLower = strtolower($player['team_name']);
        
        if ($teamNameLower === $normalizedTeam) {
            // Split names and check for partial matches
            $csvNameParts = explode(' ', $normalizedName);
            $dbNameParts = explode(' ', $playerNameLower);
            
            $matchCount = 0;
            foreach ($csvNameParts as $csvPart) {
                foreach ($dbNameParts as $dbPart) {
                    if (strlen($csvPart) > 2 && strlen($dbPart) > 2) {
                        if (strpos($dbPart, $csvPart) !== false || strpos($csvPart, $dbPart) !== false) {
                            $matchCount++;
                            break;
                        }
                    }
                }
            }
            
            // If majority of name parts match, consider it a match
            if ($matchCount >= max(1, count($csvNameParts) / 2)) {
                return $player;
            }
        }
    }
    
    return null;
}

function importDisciplinaryHistory($dryRun = true) {
    try {
        // Add debugging info
        error_log("Starting import with dry_run: " . ($dryRun ? 'true' : 'false'));
        
        $db = connectToDatabase();
        $results = array(
            'success' => false,
            'records_processed' => 0,
            'records_imported' => 0,
            'records_skipped' => 0,
            'players_added' => 0,
            'errors' => array(),
            'warnings' => array(),
            'dry_run' => $dryRun
        );
        
        // Read CSV file
        $csvFile = 'Cumulative PASS 2025 Card Data through Spring 2025 - Sheet1.csv';
        error_log("Looking for CSV file: " . $csvFile);
        
        if (!file_exists($csvFile)) {
            $results['errors'][] = "CSV file not found: $csvFile";
            error_log("CSV file not found: " . $csvFile);
            return $results;
        }
        
        error_log("CSV file found, starting to read data");
        
        $csvData = array();
        if (($handle = fopen($csvFile, 'r')) !== false) {
            $header = fgetcsv($handle);
            error_log("CSV headers: " . implode(', ', $header));
            
            $rowCount = 0;
            while (($data = fgetcsv($handle)) !== false) {
                $csvData[] = array_combine($header, $data);
                $rowCount++;
            }
            fclose($handle);
            error_log("Read $rowCount rows from CSV");
        } else {
            $results['errors'][] = "Could not open CSV file for reading";
            return $results;
        }
        
        $results['records_processed'] = count($csvData);
        
        // Get all current players and teams
        $playersQuery = "
            SELECT tm.id, tm.name, tm.team_id, t.name as team_name, tm.active
            FROM team_members tm 
            JOIN teams t ON tm.team_id = t.id
        ";
        $players = $db->query($playersQuery)->fetchAll();
        
        $teamsQuery = "SELECT id, name FROM teams";
        $teams = $db->query($teamsQuery)->fetchAll();
        $teamMap = array();
        foreach ($teams as $team) {
            $teamMap[strtolower($team['name'])] = $team['id'];
        }
        
        if (!$dryRun) {
            $db->beginTransaction();
            
            // Clear existing disciplinary records
            $db->exec("DELETE FROM player_disciplinary_records");
            $results['warnings'][] = "Cleared all existing disciplinary records";
        }
        
        $playersToAdd = array();
        $recordsToImport = array();
        
        foreach ($csvData as $row) {
            $playerName = normalizePlayerName(isset($row['Name of Player Receiving Card']) ? $row['Name of Player Receiving Card'] : '');
            $teamName = normalizeTeamName(isset($row['Team of Player Receiving Yellow Card']) ? $row['Team of Player Receiving Yellow Card'] : '');
            $cardType = normalizeCardType(isset($row['Card Type']) ? $row['Card Type'] : '');
            $gameDate = parseGameDate(isset($row['Game (Date)']) ? $row['Game (Date)'] : '');
            
            // Skip N/A records
            if ($cardType === null || empty($playerName) || empty($teamName)) {
                $results['records_skipped']++;
                continue;
            }
            
            // Find or prepare player
            $player = findPlayerMatch($playerName, $teamName, $players);
            
            if (!$player) {
                // Check if we already planned to add this player
                $playerKey = strtolower($playerName) . '|' . strtolower($teamName);
                if (!isset($playersToAdd[$playerKey])) {
                    // Check if team exists
                    $teamId = isset($teamMap[strtolower($teamName)]) ? $teamMap[strtolower($teamName)] : null;
                    if ($teamId) {
                        $playersToAdd[$playerKey] = array(
                            'name' => $playerName,
                            'team_id' => $teamId,
                            'team_name' => $teamName,
                            'active' => false
                        );
                    } else {
                        $results['errors'][] = "Team not found: $teamName for player $playerName";
                        $results['records_skipped']++;
                        continue;
                    }
                }
                $player = $playersToAdd[$playerKey];
            }
            
            // Prepare disciplinary record
            $recordsToImport[] = array(
                'player_name' => $playerName,
                'team_name' => $teamName,
                'card_type' => $cardType,
                'reason' => trim(isset($row['Reason Card Issued']) ? $row['Reason Card Issued'] : ''),
                'incident_date_epoch' => $gameDate,
                'season' => trim(isset($row['Season']) ? $row['Season'] : ''),
                'division' => trim(isset($row['Division']) ? $row['Division'] : ''),
                'additional_comments' => trim(isset($row['Additional Comments about Card Issued']) ? $row['Additional Comments about Card Issued'] : ''),
                'official_name' => trim(isset($row['Official Issuing Card']) ? $row['Official Issuing Card'] : ''),
                'player' => $player
            );
        }
        
        if (!$dryRun) {
            // Add new players
            foreach ($playersToAdd as $playerData) {
                $stmt = $db->prepare("
                    INSERT INTO team_members (name, team_id, active, created_at) 
                    VALUES (?, ?, ?, NOW()) 
                    RETURNING id
                ");
                $stmt->execute(array($playerData['name'], $playerData['team_id'], false));
                $newPlayerId = $stmt->fetchColumn();
                $playerData['id'] = $newPlayerId;
                
                // Update players array for record insertion
                $players[] = $playerData;
                $results['players_added']++;
            }
            
            // Insert disciplinary records
            $stmt = $db->prepare("
                INSERT INTO player_disciplinary_records 
                (member_id, card_type, reason, incident_date_epoch, notes, created_at) 
                VALUES (?, ?, ?, ?, ?, NOW())
            ");
            
            foreach ($recordsToImport as $record) {
                $player = $record['player'];
                $memberId = isset($player['id']) ? $player['id'] : null;
                
                if ($memberId) {
                    $notes = json_encode(array(
                        'season' => $record['season'],
                        'division' => $record['division'],
                        'additional_comments' => $record['additional_comments'],
                        'official_name' => $record['official_name'],
                        'import_source' => 'csv_import'
                    ));
                    
                    $stmt->execute(array(
                        $memberId,
                        $record['card_type'],
                        $record['reason'],
                        $record['incident_date_epoch'],
                        $notes
                    ));
                    
                    $results['records_imported']++;
                } else {
                    $results['errors'][] = "Could not find member ID for {$record['player_name']}";
                    $results['records_skipped']++;
                }
            }
            
            $db->commit();
        } else {
            // Dry run - just count what would be processed
            $results['players_added'] = count($playersToAdd);
            $results['records_imported'] = count($recordsToImport);
            $results['records_skipped'] = $results['records_processed'] - $results['records_imported'];
        }
        
        $results['success'] = true;
        return $results;
        
    } catch (Exception $e) {
        if (!$dryRun && isset($db)) {
            $db->rollback();
        }
        
        $results['success'] = false;
        $results['errors'][] = $e->getMessage();
        return $results;
    }
}

// Handle the request
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    
    // Handle JSON parsing errors
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(array(
            'success' => false,
            'errors' => array('Invalid JSON input: ' . json_last_error_msg())
        ));
        exit;
    }
    
    $dryRun = isset($input['dry_run']) ? $input['dry_run'] : true;
    
    try {
        $result = importDisciplinaryHistory($dryRun);
        echo json_encode($result);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(array(
            'success' => false,
            'errors' => array('Server error: ' . $e->getMessage())
        ));
    }
} else {
    http_response_code(405);
    echo json_encode(array('error' => 'Method not allowed'));
}
?>