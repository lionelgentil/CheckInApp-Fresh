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
    
    // Common team name mappings - handle all variations
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
        'Stingrays ReUtd' => 'Stingrays ReUnited',  // Fix: CSV has "ReUtd", DB has "ReUnited"
        'Stingrays' => 'Stingrays',
        'Goal Diggers' => 'Goal Diggers',
        'KR3W' => 'KR3W',
        'Mayhem' => 'Mayhem',
        'Green Achers' => 'GreenAchers',  // Fix: CSV has "Green Achers", DB has "GreenAchers"
        'GreenAchers' => 'GreenAchers',
        'BU1' => 'BU1',  // These might be missing teams that need to be created
        'BU2' => 'BU2',  // These might be missing teams that need to be created
        'Boom City' => 'Boom City',  // This might be missing team that needs to be created
        'Perezosos F.C.' => 'Perezosos F.C.',
        'SloAssBus VSC' => 'SloAssBus VSC',  // This might be missing team that needs to be created
        'Beers and Tears' => 'Beers and Tears',
        'Shin Splints United' => 'Shin Splints United',
        'Shin Splints Utd' => 'Shin Splints United',
        'Ol\'Limpians' => 'Ol\'Limpians',
        'BenchWarmers' => 'BenchWarmers',
        'Grass Stains' => 'Grass Stains',
        'Bandits FC' => 'Bandits FC'
    );
    
    return isset($mappings[$teamName]) ? $mappings[$teamName] : $teamName;
}

function normalizeReason($reason) {
    $reason = trim($reason);
    
    // Common reason mappings from CSV abbreviations to database values
    $mappings = array(
        'UB' => 'Unsporting Behavior',
        'UB - Sliding' => 'Sliding',
        'UB - Reckless' => 'Reckless/aggressive challenge',
        'UB - Stopping promising attack' => 'Stopping a promising attack',
        'UB - Pushing' => 'Reckless/aggressive challenge',
        'UB - Reckless Challenge' => 'Reckless/aggressive challenge',
        'UB/Reckless Challenge' => 'Reckless/aggressive challenge',
        'UB-Reckless' => 'Reckless/aggressive challenge',
        'UB-Reckless Challenge' => 'Reckless/aggressive challenge',
        'UB-Stopping a promising attack' => 'Stopping a promising attack',
        'UB-Sliding' => 'Sliding',
        'UB-Lack of respect' => 'Dissent by word or action',
        'USB' => 'Unsporting Behavior',
        'Dissent' => 'Dissent by word or action',
        'Dissent by word' => 'Dissent by word or action',
        'Persistent Offences' => 'Persistent offenses',
        'Persistent Offenses' => 'Persistent offenses',
        'Delaying Restart' => 'Delaying the restart of play',
        'Deliberate Foul' => 'Reckless/aggressive challenge',
        'Slide Tackle' => 'Sliding',
        'Repeated Slide Tackling' => 'Sliding',
        'Reckless tackle from behind' => 'Reckless/aggressive challenge',
        'Denial of goal scoring opportunity' => 'Denies an opponent an obvious goal-scoring opportunity by committing an offense which was an attempt to play the ball and a penalty kick is awarded',
        'Dangerous Play' => 'Dangerous play high kick with contact to opponent\'s face',
        'Flagrant Play, out of control running over a player from behind' => 'Reckless/aggressive challenge',
        'Foul language toward ref' => 'Dissent by word or action',
        'Abusive language & physical violence' => 'Using offensive, insulting or abusive language and/or action(s)',
        'UB/ Intentional foul & physical pushing' => 'Using offensive, insulting or abusive language and/or action(s)',
        'Retaliation and Pushing' => 'Player confrontation (pushing, arguing, chest bumping, etc)',
        'Aggressive Foul, stepping over opposing player' => 'Reckless/aggressive challenge',
        'Reckless shoulder challenge' => 'Reckless/aggressive challenge',
        'AL/Gestures' => 'Using offensive, insulting or abusive language and/or action(s)',
        'Dissent - Word or Action' => 'Dissent by word or action',
        'Flagrant Play, out of control running over a player from behind' => 'Reckless/aggressive challenge',
        'Aggressive Foul/Dangerous Play' => 'Reckless/aggressive challenge',
        'Grabbed player from behind' => 'Reckless/aggressive challenge',
        'Unsporting behavior stopping a  promising attack by tripping' => 'Stopping a promising attack',
        'Unsporting behavior - stopping a promising attack by handling' => 'Stopping a promising attack',
        'Unsporting behavior arguing and chest bumping with opponent' => 'Player confrontation (pushing, arguing, chest bumping, etc)',
        'Late tackle on girl. Not intentional but dangerous.' => 'Reckless/aggressive challenge',
        'unsporting behavior' => 'Unsporting Behavior',
        'Dissent by word or action' => 'Dissent by word or action',
        'Reckless/aggressive challenge' => 'Reckless/aggressive challenge',
        'Player confrontation (pushing, arguing, chest bumping, etc)' => 'Player confrontation (pushing, arguing, chest bumping, etc)',
        'Taunting' => 'Unsporting Behavior',
        'Using offensive, insulting or abusive language and/or action(s)' => 'Using offensive, insulting or abusive language and/or action(s)',
        'Receiving a second caution in the same match' => 'Receiving a second caution in the same match',
        'Handball denying a goal or an obvious goal-scoring opportunity' => 'Handball denying a goal or an obvious goal-scoring opportunity',
        'Entering, re-entering, or deliberately leaving the field of play without the referee\'s permission' => 'Entering, re-entering, or deliberately leaving the field of play without the referee\'s permission',
        'Failing to respect the required distance when play is restarted with a dropped ball, corner kick, free kick or throw-in' => 'Failing to respect the required distance when play is restarted with a dropped ball, corner kick, free kick or throw-in',
        'Denies an opponent an obvious goal-scoring opportunity by committing an offense which was an attempt to play the ball and a penalty kick is awarded' => 'Denies an opponent an obvious goal-scoring opportunity by committing an offense which was an attempt to play the ball and a penalty kick is awarded',
        'Tripping' => 'Reckless/aggressive challenge',
        'Holding and grabbing the opponent from advancing' => 'Stopping a promising attack',
        'NA' => '',  // Map N/A to empty string
        '' => ''     // Keep empty strings empty
    );
    
    // First try exact match
    if (isset($mappings[$reason])) {
        return $mappings[$reason];
    }
    
    // If no exact match, try case-insensitive match
    foreach ($mappings as $csvReason => $dbReason) {
        if (strcasecmp($csvReason, $reason) === 0) {
            return $dbReason;
        }
    }
    
    // If no mapping found, return original reason
    return $reason;
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

function generateSQLPreview($dryRun = true) {
    try {
        $db = connectToDatabase();
        $sqlStatements = array();
        
        // Read CSV file
        $csvFile = 'Cumulative PASS 2025 Card Data through Spring 2025 - Sheet1.csv';
        if (!file_exists($csvFile)) {
            return array('error' => "CSV file not found: $csvFile");
        }
        
        $csvData = array();
        if (($handle = fopen($csvFile, 'r')) !== false) {
            $header = fgetcsv($handle);
            while (($data = fgetcsv($handle)) !== false) {
                $csvData[] = array_combine($header, $data);
            }
            fclose($handle);
        }
        
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
        
        // Start building SQL statements
        $sqlStatements[] = "-- ========================================";
        $sqlStatements[] = "-- DISCIPLINARY HISTORY IMPORT SQL PREVIEW";
        $sqlStatements[] = "-- ========================================";
        $sqlStatements[] = "";
        
        // Clear existing records
        $sqlStatements[] = "-- Clear existing disciplinary records";
        $sqlStatements[] = "DELETE FROM player_disciplinary_records;";
        $sqlStatements[] = "";
        
        $playersToAdd = array();
        $recordsToImport = array();
        $skippedCount = 0;
        
        foreach ($csvData as $rowIndex => $row) {
            $playerName = normalizePlayerName(isset($row['Name of Player Receiving Card']) ? $row['Name of Player Receiving Card'] : '');
            $teamName = normalizeTeamName(isset($row['Team of Player Receiving Yellow Card']) ? $row['Team of Player Receiving Yellow Card'] : '');
            $cardType = normalizeCardType(isset($row['Card Type']) ? $row['Card Type'] : '');
            $gameDate = parseGameDate(isset($row['Game (Date)']) ? $row['Game (Date)'] : '');
            
            // Skip invalid records
            if ($cardType === null || empty($playerName) || empty($teamName)) {
                $skippedCount++;
                $sqlStatements[] = "-- SKIPPED ROW " . ($rowIndex + 2) . ": " . 
                    ($cardType === null ? "Invalid card type" : 
                     (empty($playerName) ? "Missing player name" : "Missing team name")) . 
                    " - Player: '$playerName', Team: '$teamName'";
                continue;
            }
            
            // Check if team exists
            $teamId = isset($teamMap[strtolower($teamName)]) ? $teamMap[strtolower($teamName)] : null;
            if (!$teamId) {
                $skippedCount++;
                $sqlStatements[] = "-- SKIPPED ROW " . ($rowIndex + 2) . ": Team not found - '$teamName' for player '$playerName'";
                continue;
            }
            
            // Find or prepare player
            $player = findPlayerMatch($playerName, $teamName, $players);
            
            if (!$player) {
                // Check if we already planned to add this player
                $playerKey = strtolower($playerName) . '|' . strtolower($teamName);
                if (!isset($playersToAdd[$playerKey])) {
                    $playersToAdd[$playerKey] = array(
                        'name' => $playerName,
                        'team_id' => $teamId,
                        'team_name' => $teamName,
                        'active' => false
                    );
                }
                $player = $playersToAdd[$playerKey];
            }
            
        // Also store original CSV reasons for mapping display
        $originalReason = trim(isset($row['Reason Card Issued']) ? $row['Reason Card Issued'] : '');
        $normalizedReason = normalizeReason($originalReason);
        
        // Prepare record for SQL generation
        $recordsToImport[] = array(
            'player_name' => $playerName,
            'team_name' => $teamName,
            'card_type' => $cardType,
            'reason' => $normalizedReason,
            'original_reason' => $originalReason,  // Store original for comparison
            'incident_date_epoch' => $gameDate,
            'season' => trim(isset($row['Season']) ? $row['Season'] : ''),
            'division' => trim(isset($row['Division']) ? $row['Division'] : ''),
            'additional_comments' => trim(isset($row['Additional Comments about Card Issued']) ? $row['Additional Comments about Card Issued'] : ''),
            'official_name' => trim(isset($row['Official Issuing Card']) ? $row['Official Issuing Card'] : ''),
            'player' => $player,
            'row_number' => $rowIndex + 2
        );
        }
        
        // Generate SQL for new players
        if (!empty($playersToAdd)) {
            $sqlStatements[] = "-- ========================================";
            $sqlStatements[] = "-- ADD NEW PLAYERS (marked as inactive)";
            $sqlStatements[] = "-- ========================================";
            $sqlStatements[] = "";
            
            foreach ($playersToAdd as $playerData) {
                $escapedName = str_replace("'", "''", $playerData['name']);
                $sqlStatements[] = "-- Add inactive player: {$playerData['name']} to team {$playerData['team_name']}";
                $sqlStatements[] = "INSERT INTO team_members (name, team_id, active, created_at)";
                $sqlStatements[] = "VALUES ('{$escapedName}', '{$playerData['team_id']}', FALSE, NOW());";
                $sqlStatements[] = "";
            }
        }
        
        // Generate SQL for disciplinary records
        $sqlStatements[] = "-- ========================================";
        $sqlStatements[] = "-- INSERT DISCIPLINARY RECORDS";
        $sqlStatements[] = "-- ========================================";
        $sqlStatements[] = "";
        
        foreach ($recordsToImport as $record) {
            $player = $record['player'];
            $notes = array(
                'season' => $record['season'],
                'division' => $record['division'],
                'additional_comments' => $record['additional_comments'],
                'official_name' => $record['official_name'],
                'import_source' => 'csv_import'
            );
            $notesJson = str_replace("'", "''", json_encode($notes));
            $escapedReason = str_replace("'", "''", $record['reason']);
            
            // Show original reason if it was mapped
            $reasonNote = '';
            if (isset($record['original_reason']) && $record['original_reason'] !== $record['reason']) {
                $reasonNote = " (mapped from: '{$record['original_reason']}')";
            }
            
            $sqlStatements[] = "-- CSV Row {$record['row_number']}: {$record['player_name']} ({$record['team_name']}) - {$record['card_type']} card{$reasonNote}";
            
            if (isset($player['id'])) {
                // Existing player
                $sqlStatements[] = "INSERT INTO player_disciplinary_records (member_id, card_type, reason, incident_date_epoch, notes, created_at)";
                $sqlStatements[] = "VALUES ({$player['id']}, '{$record['card_type']}', '{$escapedReason}', " . 
                    ($record['incident_date_epoch'] ? $record['incident_date_epoch'] : 'NULL') . ", '{$notesJson}', NOW());";
            } else {
                // New player - would need to get ID after insert
                $escapedPlayerName = str_replace("'", "''", $record['player_name']);
                $sqlStatements[] = "INSERT INTO player_disciplinary_records (member_id, card_type, reason, incident_date_epoch, notes, created_at)";
                $sqlStatements[] = "VALUES ((SELECT id FROM team_members WHERE name = '{$escapedPlayerName}' AND team_id = '{$player['team_id']}' LIMIT 1), ";
                $sqlStatements[] = "        '{$record['card_type']}', '{$escapedReason}', " . 
                    ($record['incident_date_epoch'] ? $record['incident_date_epoch'] : 'NULL') . ", '{$notesJson}', NOW());";
            }
            $sqlStatements[] = "";
        }
        
        // Summary
        $sqlStatements[] = "-- ========================================";
        $sqlStatements[] = "-- SUMMARY";
        $sqlStatements[] = "-- ========================================";
        $sqlStatements[] = "-- Total CSV rows processed: " . count($csvData);
        $sqlStatements[] = "-- Records to import: " . count($recordsToImport);
        $sqlStatements[] = "-- Records skipped: " . $skippedCount;
        $sqlStatements[] = "-- New players to add: " . count($playersToAdd);
        
        return array(
            'sql' => implode("\n", $sqlStatements),
            'stats' => array(
                'total_rows' => count($csvData),
                'records_to_import' => count($recordsToImport),
                'records_skipped' => $skippedCount,
                'players_to_add' => count($playersToAdd)
            )
        );
        
    } catch (Exception $e) {
        return array('error' => $e->getMessage());
    }
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
            'dry_run' => $dryRun,
            'skipped_details' => array(),  // Add detailed breakdown of skipped records
            'team_stats' => array()        // Add team-by-team statistics
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
        
        error_log("Teams in database: " . implode(', ', array_keys($teamMap)));
        
        // Get unique team names from CSV for debugging
        $csvTeams = array();
        foreach ($csvData as $row) {
            $teamName = normalizeTeamName(isset($row['Team of Player Receiving Yellow Card']) ? $row['Team of Player Receiving Yellow Card'] : '');
            if (!empty($teamName)) {
                $csvTeams[$teamName] = true;
            }
        }
        error_log("Unique teams in CSV: " . implode(', ', array_keys($csvTeams)));
        
        // Find missing teams
        $missingTeams = array();
        foreach (array_keys($csvTeams) as $csvTeam) {
            if (!isset($teamMap[strtolower($csvTeam)])) {
                $missingTeams[] = $csvTeam;
            }
        }
        if (!empty($missingTeams)) {
            error_log("Teams in CSV but not in database: " . implode(', ', $missingTeams));
            $results['warnings'][] = "Teams found in CSV but not in database: " . implode(', ', $missingTeams);
        }
        
        if (!$dryRun) {
            $db->beginTransaction();
            
            // Clear existing disciplinary records
            $db->exec("DELETE FROM player_disciplinary_records");
            $results['warnings'][] = "Cleared all existing disciplinary records";
        }
        
        $playersToAdd = array();
        $recordsToImport = array();
        $teamStats = array();  // Track statistics by team
        
        foreach ($csvData as $row) {
            $playerName = normalizePlayerName(isset($row['Name of Player Receiving Card']) ? $row['Name of Player Receiving Card'] : '');
            $teamName = normalizeTeamName(isset($row['Team of Player Receiving Yellow Card']) ? $row['Team of Player Receiving Yellow Card'] : '');
            $cardType = normalizeCardType(isset($row['Card Type']) ? $row['Card Type'] : '');
            $gameDate = parseGameDate(isset($row['Game (Date)']) ? $row['Game (Date)'] : '');
            
            // Initialize team stats
            if (!isset($teamStats[$teamName])) {
                $teamStats[$teamName] = array(
                    'total' => 0,
                    'imported' => 0,
                    'skipped' => 0,
                    'skip_reasons' => array()
                );
            }
            $teamStats[$teamName]['total']++;
            
            // Track skip reasons with details
            $skipReason = null;
            if ($cardType === null || empty($playerName) || empty($teamName)) {
                if ($cardType === null) $skipReason = 'Invalid card type (N/A)';
                else if (empty($playerName)) $skipReason = 'Missing player name';
                else if (empty($teamName)) $skipReason = 'Missing team name';
                
                $results['skipped_details'][] = array(
                    'player' => $playerName,
                    'team' => $teamName,
                    'date' => isset($row['Game (Date)']) ? $row['Game (Date)'] : '',
                    'card_type' => isset($row['Card Type']) ? $row['Card Type'] : '',
                    'reason' => $skipReason
                );
                $teamStats[$teamName]['skipped']++;
                $teamStats[$teamName]['skip_reasons'][$skipReason] = isset($teamStats[$teamName]['skip_reasons'][$skipReason]) ? $teamStats[$teamName]['skip_reasons'][$skipReason] + 1 : 1;
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
                        // Instead of erroring, log as warning and skip this record
                        $skipReason = 'Team not found in database';
                        $warningMsg = "Team not found: '$teamName' for player '$playerName' - skipping record";
                        $results['warnings'][] = $warningMsg;
                        $results['skipped_details'][] = array(
                            'player' => $playerName,
                            'team' => $teamName,
                            'date' => isset($row['Game (Date)']) ? $row['Game (Date)'] : '',
                            'card_type' => isset($row['Card Type']) ? $row['Card Type'] : '',
                            'reason' => $skipReason
                        );
                        $teamStats[$teamName]['skipped']++;
                        $teamStats[$teamName]['skip_reasons'][$skipReason] = isset($teamStats[$teamName]['skip_reasons'][$skipReason]) ? $teamStats[$teamName]['skip_reasons'][$skipReason] + 1 : 1;
                        error_log($warningMsg);
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
                'reason' => normalizeReason(trim(isset($row['Reason Card Issued']) ? $row['Reason Card Issued'] : '')),
                'incident_date_epoch' => $gameDate,
                'season' => trim(isset($row['Season']) ? $row['Season'] : ''),
                'division' => trim(isset($row['Division']) ? $row['Division'] : ''),
                'additional_comments' => trim(isset($row['Additional Comments about Card Issued']) ? $row['Additional Comments about Card Issued'] : ''),
                'official_name' => trim(isset($row['Official Issuing Card']) ? $row['Official Issuing Card'] : ''),
                'player' => $player
            );
            
            // Track successful import for this team
            $teamStats[$teamName]['imported']++;
        }
        
        // Finalize team statistics
        $results['team_stats'] = $teamStats;
        
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
    
    $action = isset($input['action']) ? $input['action'] : 'import';
    
    if ($action === 'preview_sql') {
        // Generate SQL preview
        try {
            $result = generateSQLPreview();
            echo json_encode(array(
                'success' => true,
                'sql' => $result['sql'],
                'stats' => $result['stats']
            ));
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(array(
                'success' => false,
                'errors' => array('SQL preview error: ' . $e->getMessage())
            ));
        }
    } else {
        // Regular import
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
    }
} else {
    http_response_code(405);
    echo json_encode(array('error' => 'Method not allowed'));
}
?>