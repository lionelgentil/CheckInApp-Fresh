<?php
// Simple diagnostic script to identify the database constraint error

// Start session for authentication
session_start();

// Same authentication as main script
const ADMIN_PASSWORD = 'checkin2024';

function authenticate($password) {
    return $password === ADMIN_PASSWORD;
}

// Handle authentication
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'authenticate') {
    $password = $_POST['password'] ?? '';
    if (authenticate($password)) {
        $_SESSION['diagnostic_authenticated'] = true;
        echo json_encode(['success' => true]);
        exit();
    } else {
        echo json_encode(['success' => false, 'error' => 'Invalid password']);
        exit();
    }
}

// Check if authenticated
$isAuthenticated = isset($_SESSION['diagnostic_authenticated']) && $_SESSION['diagnostic_authenticated'] === true;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'test' && $isAuthenticated) {
    testDatabaseOperations();
    exit();
}

function getDatabaseConnection() {
    // Same database connection logic as main API
    $databaseUrl = null;
    
    // Check common Railway PostgreSQL variable patterns
    $possibleVars = array('DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL');
    foreach ($possibleVars as $var) {
        if (isset($_ENV[$var])) {
            $databaseUrl = $_ENV[$var];
            break;
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
        throw new Exception('No PostgreSQL database URL found');
    }
    
    // Parse PostgreSQL URL and convert to PDO connection string
    $parsedUrl = parse_url($databaseUrl);
    
    $host = $parsedUrl['host'];
    $port = isset($parsedUrl['port']) ? $parsedUrl['port'] : 5432;
    $dbname = ltrim($parsedUrl['path'], '/');
    $user = $parsedUrl['user'];
    $password = $parsedUrl['pass'];
    
    // Build PostgreSQL PDO connection string
    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname}";
    
    $db = new PDO($dsn, $user, $password);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    return $db;
}

function testDatabaseOperations() {
    try {
        $db = getDatabaseConnection();
        
        $results = [
            'success' => true,
            'tests' => [],
            'errors' => []
        ];
        
        // Test 1: Basic query
        try {
            $stmt = $db->query("SELECT COUNT(*) as total FROM team_members WHERE photo IS NOT NULL AND photo != ''");
            $count = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
            $results['tests'][] = "✅ Basic query successful: {$count} members with photos";
        } catch (Exception $e) {
            $results['tests'][] = "❌ Basic query failed: " . $e->getMessage();
            $results['errors'][] = $e->getMessage();
        }
        
        // Test 2: Sample photo data
        try {
            $stmt = $db->query("
                SELECT id, name, photo, 
                       LENGTH(photo) as photo_length,
                       CASE 
                           WHEN photo LIKE 'data:image/%' THEN 'BASE64'
                           WHEN photo LIKE '/api/photos%' THEN 'API_URL'
                           ELSE 'OTHER'
                       END as photo_type
                FROM team_members 
                WHERE photo IS NOT NULL AND photo != ''
                LIMIT 5
            ");
            $samples = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $results['tests'][] = "✅ Sample data query successful: " . count($samples) . " samples";
            $results['sample_data'] = $samples;
        } catch (Exception $e) {
            $results['tests'][] = "❌ Sample data query failed: " . $e->getMessage();
            $results['errors'][] = $e->getMessage();
        }
        
        // Test 3: Try a simple update (to see if constraint is the issue)
        try {
            $db->beginTransaction();
            
            // Get one member
            $stmt = $db->query("SELECT id, name, photo FROM team_members WHERE photo IS NOT NULL LIMIT 1");
            $member = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($member) {
                // Try to update with the same value (should work)
                $updateStmt = $db->prepare("UPDATE team_members SET photo = ? WHERE id = ?");
                $updateStmt->execute([$member['photo'], $member['id']]);
                
                $results['tests'][] = "✅ Simple update test successful for member: " . $member['name'];
                
                // Try to update with a clean filename
                $cleanFilename = 'test_filename.jpg';
                $updateStmt = $db->prepare("UPDATE team_members SET photo = ? WHERE id = ?");
                $updateStmt->execute([$cleanFilename, $member['id']]);
                
                $results['tests'][] = "✅ Clean filename update test successful";
                
                // Rollback - we don't want to actually change data
                $db->rollBack();
                $results['tests'][] = "✅ Transaction rolled back - no data changed";
            } else {
                $results['tests'][] = "⚠️ No members found for update test";
            }
            
        } catch (Exception $e) {
            $db->rollBack();
            $results['tests'][] = "❌ Update test failed - THIS IS LIKELY THE CONSTRAINT ERROR";
            $results['tests'][] = "❌ Error: " . $e->getMessage();
            $results['tests'][] = "❌ Error Code: " . $e->getCode();
            $results['errors'][] = "UPDATE ERROR: " . $e->getMessage();
        }
        
        echo json_encode($results, JSON_PRETTY_PRINT);
        
    } catch (Exception $e) {
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Constraint Diagnostic</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .section { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .section.authenticated { background: #e8f5e8; border-left: 4px solid #4caf50; }
        input[type="password"] { width: 200px; padding: 8px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #2196F3; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
        button:hover { background: #1976D2; }
        .success { color: green; }
        .error { color: red; }
        .status { font-weight: bold; margin: 10px 0; }
        .results { margin-top: 20px; font-family: monospace; white-space: pre-wrap; background: #f8f9fa; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>🔍 Database Constraint Diagnostic</h1>
    <p>This will test database operations to identify the "string did not match the expected pattern" error.</p>

    <?php if (!$isAuthenticated): ?>
    <!-- Authentication Section -->
    <div class="section">
        <h3>🔐 Authentication Required</h3>
        <input type="password" id="passwordInput" placeholder="Admin password" onkeypress="handlePasswordKeypress(event)">
        <button onclick="authenticate()">Login</button>
        <div id="authStatus" class="status"></div>
    </div>
    <?php else: ?>
    
    <!-- Authenticated Section -->
    <div class="section authenticated">
        <h3>✅ Authenticated</h3>
        <p>Ready to run diagnostic tests.</p>
    </div>

    <!-- Test Section -->
    <div class="section">
        <h3>🧪 Run Database Tests</h3>
        <p>This will test various database operations to identify the constraint error.</p>
        <button onclick="runTests()">🔬 Run Diagnostic Tests</button>
        <div id="testResults" class="results" style="display: none;"></div>
    </div>

    <?php endif; ?>

    <script>
        function handlePasswordKeypress(event) {
            if (event.key === 'Enter') {
                authenticate();
            }
        }

        async function authenticate() {
            const password = document.getElementById('passwordInput').value;
            if (!password) {
                alert('Please enter password');
                return;
            }

            try {
                const formData = new FormData();
                formData.append('action', 'authenticate');
                formData.append('password', password);

                const response = await fetch('', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                
                if (result.success) {
                    location.reload(); // Reload to show authenticated interface
                } else {
                    document.getElementById('authStatus').innerHTML = 
                        '<span class="error">❌ Invalid password</span>';
                }
            } catch (error) {
                document.getElementById('authStatus').innerHTML = 
                    '<span class="error">❌ Login failed: ' + error.message + '</span>';
            }
        }

        async function runTests() {
            const resultsDiv = document.getElementById('testResults');
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = 'Running diagnostic tests...';

            try {
                const formData = new FormData();
                formData.append('action', 'test');

                const response = await fetch('', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                resultsDiv.innerHTML = JSON.stringify(result, null, 2);
                
            } catch (error) {
                resultsDiv.innerHTML = `Error: ${error.message}`;
            }
        }
    </script>
</body>
</html>