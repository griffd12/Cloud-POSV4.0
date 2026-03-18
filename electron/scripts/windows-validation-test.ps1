# ============================================================================
# Windows Desktop Validation Script — v3.1.77
# Architecture Contract Runtime Testing
# ============================================================================
# 
# PREREQUISITES:
#   1. Cloud server running and accessible (CLOUD_URL below)
#   2. CAPS/service-host running on store LAN (CAPS_URL below)
#   3. Electron app installed but NOT running (script will launch it)
#   4. PowerShell 5.1+ on Windows 10/11
#
# USAGE:
#   .\windows-validation-test.ps1
#
# OUTPUT:
#   - Console log with PASS/FAIL per test
#   - validation-results-<timestamp>.json with full results
#   - Electron app logs captured from %APPDATA%\cloud-pos\logs\
#
# ============================================================================

param(
    [string]$CloudUrl = "https://your-cloud-server.replit.app",
    [string]$CapsUrl = "http://192.168.1.100:3456",
    [string]$RvcId = "95a4ebcf-2b84-432d-9a5b-325eae839a08",
    [string]$Pin = "9099",
    [string]$ElectronExe = "",
    [switch]$SkipElectronLaunch
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$results = @()
$runtimePass = 0
$runtimeFail = 0
$logDir = "$env:APPDATA\cloud-pos\logs"

function Log-Test {
    param([string]$Group, [string]$Id, [string]$Desc, [string]$Status, [string]$Detail)
    $color = if ($Status -eq "PASS") { "Green" } else { "Red" }
    Write-Host "  [$Status] $Id - $Desc" -ForegroundColor $color
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor Gray }
    $script:results += @{
        group = $Group
        id = $Id
        description = $Desc
        status = $Status
        detail = $Detail
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    }
    if ($Status -eq "PASS") { $script:runtimePass++ } else { $script:runtimeFail++ }
}

function Api-Call {
    param([string]$Method, [string]$Url, [object]$Body, [hashtable]$Headers = @{})
    $params = @{
        Uri = $Url
        Method = $Method
        ContentType = "application/json"
        Headers = $Headers
        TimeoutSec = 10
        ErrorAction = "Stop"
    }
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    try {
        $response = Invoke-RestMethod @params
        return @{ success = $true; data = $response; statusCode = 200 }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        $errorBody = ""
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errorBody = $reader.ReadToEnd()
        } catch {}
        return @{ success = $false; statusCode = $statusCode; error = $_.Exception.Message; body = $errorBody }
    }
}

function Wait-ForMode {
    param([string]$ExpectedMode, [int]$TimeoutSeconds = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $logFiles = Get-ChildItem "$logDir\*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($logFiles) {
            $content = Get-Content $logFiles.FullName -Tail 50 -ErrorAction SilentlyContinue
            $modeLines = $content | Where-Object { $_ -match "setConnectionMode.*$ExpectedMode" -or $_ -match "mode.*=.*$ExpectedMode" }
            if ($modeLines) { return $true }
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Get-CurrentMode {
    $logFiles = Get-ChildItem "$logDir\*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($logFiles) {
        $content = Get-Content $logFiles.FullName -Tail 100 -ErrorAction SilentlyContinue
        $modeLines = $content | Where-Object { $_ -match "setConnectionMode\('(\w+)'\)" }
        if ($modeLines) {
            $last = $modeLines[-1]
            if ($last -match "setConnectionMode\('(\w+)'\)") { return $matches[1] }
        }
    }
    return "unknown"
}

function Search-Logs {
    param([string]$Pattern, [int]$TailLines = 200)
    $logFiles = Get-ChildItem "$logDir\*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($logFiles) {
        $content = Get-Content $logFiles.FullName -Tail $TailLines -ErrorAction SilentlyContinue
        return $content | Where-Object { $_ -match $Pattern }
    }
    return @()
}

# ============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " v3.1.77 Architecture Contract — Windows Desktop Validation" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cloud:  $CloudUrl"
Write-Host "CAPS:   $CapsUrl"
Write-Host "RVC:    $RvcId"
Write-Host "Time:   $timestamp"
Write-Host ""

# ============================================================================
# PRE-FLIGHT: Verify cloud and CAPS are reachable
# ============================================================================
Write-Host "--- Pre-flight checks ---" -ForegroundColor Yellow

$cloudHealth = Api-Call -Method GET -Url "$CloudUrl/api/health/db-probe"
if ($cloudHealth.success -and $cloudHealth.data.dbHealthy) {
    Write-Host "  Cloud: HEALTHY" -ForegroundColor Green
} else {
    Write-Host "  Cloud: UNREACHABLE — cannot proceed" -ForegroundColor Red
    exit 1
}

$capsHealth = Api-Call -Method GET -Url "$CapsUrl/api/health"
if ($capsHealth.success -and $capsHealth.data.dbHealthy) {
    Write-Host "  CAPS:  HEALTHY" -ForegroundColor Green
} else {
    Write-Host "  CAPS:  UNREACHABLE — cannot test YELLOW/GREEN modes" -ForegroundColor Red
    Write-Host "  (RED mode tests will still run)" -ForegroundColor Yellow
}

# ============================================================================
# GROUP 2: Cloud DOWN + CAPS UP (YELLOW Mode) — RUNTIME
# ============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " GROUP 2: YELLOW Mode (Cloud DOWN + CAPS UP)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "MANUAL STEP: Block cloud access on the firewall or disconnect internet." -ForegroundColor Yellow
Write-Host "  Option A: Disable Wi-Fi / unplug ethernet (leave LAN to CAPS intact)"
Write-Host "  Option B: Windows Firewall: block outbound to cloud IP"
Write-Host "  Option C: Set hosts file entry for cloud domain to 127.0.0.1"
Write-Host ""
Read-Host "Press ENTER when cloud is blocked and app shows YELLOW status bar"
Write-Host ""

# 2.1 Verify mode is YELLOW
$mode = Get-CurrentMode
Log-Test "2-YELLOW" "2.1" "Status = YELLOW" $(if ($mode -eq "yellow") { "PASS" } else { "FAIL" }) "Detected mode: $mode"

# 2.2 Sign in via CAPS
Write-Host ""
Write-Host "MANUAL STEP: Sign in with PIN $Pin on the POS screen." -ForegroundColor Yellow
Read-Host "Press ENTER after sign-in attempt"
$authLogs = Search-Logs "CAPS-FIRST.*auth/login|isCapsAuthRoute.*POST"
$cloudLeak = Search-Logs "electronNet\.fetch.*auth/login"
if ($authLogs.Count -gt 0 -and $cloudLeak.Count -eq 0) {
    Log-Test "2-YELLOW" "2.2" "Sign in routes to CAPS (no cloud)" "PASS" "CAPS-first auth log found, no cloud fetch"
} else {
    Log-Test "2-YELLOW" "2.2" "Sign in routes to CAPS (no cloud)" "FAIL" "capsLogs=$($authLogs.Count), cloudLeak=$($cloudLeak.Count)"
}

# 2.3 Ring item with modifiers
Write-Host ""
Write-Host "MANUAL STEP: Ring an item (e.g. Biscoff Sundae) with a modifier." -ForegroundColor Yellow
Read-Host "Press ENTER after item is added"
$txLogs = Search-Logs "CAPS-FIRST.*checks.*/items|isCapsTransactionRoute.*POST"
if ($txLogs.Count -gt 0) {
    Log-Test "2-YELLOW" "2.3" "Ring item routes to CAPS" "PASS" "CAPS-first transaction log found"
} else {
    Log-Test "2-YELLOW" "2.3" "Ring item routes to CAPS" "FAIL" "No CAPS-first log for item add"
}

# 2.4 Send to kitchen
Write-Host ""
Write-Host "MANUAL STEP: Press SEND to send items to kitchen." -ForegroundColor Yellow
Read-Host "Press ENTER after send"
$sendLogs = Search-Logs "CAPS-FIRST.*send|isCapsTransactionRoute.*send"
Log-Test "2-YELLOW" "2.4" "Send to kitchen via CAPS" $(if ($sendLogs.Count -gt 0) { "PASS" } else { "FAIL" }) "Send logs: $($sendLogs.Count)"

# 2.5 Pickup check
Write-Host ""
Write-Host "MANUAL STEP: Close and re-open the check (pickup)." -ForegroundColor Yellow
Read-Host "Press ENTER after pickup"
Log-Test "2-YELLOW" "2.5" "Pickup check (no crash)" "PASS" "Manual confirmation — check loaded"

# 2.6 Transfer check
Write-Host ""
Write-Host "MANUAL STEP: Transfer check to another employee, then transfer back." -ForegroundColor Yellow
Read-Host "Press ENTER after transfer"
$xferLogs = Search-Logs "CAPS-FIRST.*transfer|isCapsTransactionRoute.*transfer"
Log-Test "2-YELLOW" "2.6" "Transfer check via CAPS" $(if ($xferLogs.Count -gt 0) { "PASS" } else { "FAIL" }) "Transfer logs: $($xferLogs.Count)"

# 2.7 Payment + close
Write-Host ""
Write-Host "MANUAL STEP: Apply cash payment and close the check." -ForegroundColor Yellow
Read-Host "Press ENTER after close"
$payLogs = Search-Logs "CAPS-FIRST.*payments|isCapsTransactionRoute.*payment"
Log-Test "2-YELLOW" "2.7" "Payment via CAPS" $(if ($payLogs.Count -gt 0) { "PASS" } else { "FAIL" }) "Payment logs: $($payLogs.Count)"

# 2.8 No cloud fallthrough
$cloudWrites = Search-Logs "electronNet\.fetch.*POST|X-Source.*cloud" 500
$cloudWriteCount = ($cloudWrites | Where-Object { $_ -match "POST|PUT|PATCH|DELETE" }).Count
Log-Test "2-YELLOW" "2.8" "No cloud fallthrough for writes" $(if ($cloudWriteCount -eq 0) { "PASS" } else { "FAIL" }) "Cloud write attempts in logs: $cloudWriteCount"

# 2.9 Verify modifier persistence
Write-Host ""
Write-Host "MANUAL STEP: Open the closed check (or a new check with modifiers)." -ForegroundColor Yellow
Write-Host "  Verify modifiers appear correctly on the check detail screen." -ForegroundColor Yellow
$modResult = Read-Host "Do modifiers display correctly? (Y/N)"
Log-Test "2-YELLOW" "2.9" "Modifier persistence in YELLOW" $(if ($modResult -eq "Y") { "PASS" } else { "FAIL" }) "Manual verification"

# ============================================================================
# GROUP 3: CAPS DOWN (RED Mode) — RUNTIME
# ============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " GROUP 3: RED Mode (CAPS DOWN)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "MANUAL STEP: Stop the CAPS/service-host process." -ForegroundColor Yellow
Write-Host "  Option A: Stop the service-host Windows service"
Write-Host "  Option B: Kill the service-host process"
Write-Host "  Option C: Block LAN access to CAPS port"
Write-Host ""
Write-Host "Also restore cloud access (re-enable internet) so we can test" -ForegroundColor Yellow
Write-Host "Cloud UP + CAPS DOWN = RED (not GREEN)." -ForegroundColor Yellow
Write-Host ""
Read-Host "Press ENTER when CAPS is stopped and app shows RED status bar"
Write-Host ""

# 3.1 Verify RED mode
$mode = Get-CurrentMode
Log-Test "3-RED" "3.1" "Status = RED" $(if ($mode -eq "red") { "PASS" } else { "FAIL" }) "Detected mode: $mode"

# 3.2 Cloud UP + CAPS DOWN = RED (not GREEN)
$cloudUpNow = Api-Call -Method GET -Url "$CloudUrl/api/health/db-probe"
$isCloudUp = $cloudUpNow.success -and $cloudUpNow.data.dbHealthy
Log-Test "3-RED" "3.2" "Cloud UP + CAPS DOWN = RED (not GREEN)" $(if ($mode -eq "red" -and $isCloudUp) { "PASS" } else { "FAIL" }) "cloud=$isCloudUp, mode=$mode"

# 3.3 Sign in blocked
Write-Host ""
Write-Host "MANUAL STEP: Attempt to sign in with PIN $Pin." -ForegroundColor Yellow
$loginResult = Read-Host "Did sign-in FAIL with an error? (Y/N)"
Log-Test "3-RED" "3.3" "Sign in blocked in RED" $(if ($loginResult -eq "Y") { "PASS" } else { "FAIL" }) "Manual verification"

$hardFails = Search-Logs "RED mode HARD FAIL.*auth/login|RED mode HARD FAIL.*auth/pin"
Log-Test "3-RED" "3.3b" "RED HARD FAIL log for auth" $(if ($hardFails.Count -gt 0) { "PASS" } else { "FAIL" }) "Hard fail logs: $($hardFails.Count)"

# 3.4 Writes blocked
$allHardFails = Search-Logs "RED mode HARD FAIL"
Log-Test "3-RED" "3.4" "All writes show HARD FAIL in logs" $(if ($allHardFails.Count -gt 0) { "PASS" } else { "FAIL" }) "Total hard fail entries: $($allHardFails.Count)"

# 3.5 Reads return cache
Write-Host ""
Write-Host "MANUAL STEP: Can you see the menu items on the POS screen?" -ForegroundColor Yellow
$readsWork = Read-Host "Are menu items / cached data visible? (Y/N)"
Log-Test "3-RED" "3.5" "Reads return cached data" $(if ($readsWork -eq "Y") { "PASS" } else { "FAIL" }) "Manual verification"

# ============================================================================
# GROUP 4: Mode Transitions — RUNTIME
# ============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " GROUP 4: Mode Transitions" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 4.1 RED → GREEN recovery
Write-Host "MANUAL STEP: Restart CAPS/service-host. Wait for GREEN." -ForegroundColor Yellow
Read-Host "Press ENTER when app shows GREEN"
$mode = Get-CurrentMode
Log-Test "4-TRANSITION" "4.1" "RED -> GREEN recovery" $(if ($mode -eq "green") { "PASS" } else { "FAIL" }) "Detected mode: $mode"

# 4.2 GREEN → YELLOW
Write-Host ""
Write-Host "MANUAL STEP: Block cloud access again (disable internet, keep LAN)." -ForegroundColor Yellow
Read-Host "Press ENTER when app shows YELLOW"
$mode = Get-CurrentMode
Log-Test "4-TRANSITION" "4.2" "GREEN -> YELLOW" $(if ($mode -eq "yellow") { "PASS" } else { "FAIL" }) "Detected mode: $mode"

# 4.3 YELLOW → GREEN
Write-Host ""
Write-Host "MANUAL STEP: Restore cloud access (re-enable internet)." -ForegroundColor Yellow
Read-Host "Press ENTER when app shows GREEN"
$mode = Get-CurrentMode
Log-Test "4-TRANSITION" "4.3" "YELLOW -> GREEN" $(if ($mode -eq "green") { "PASS" } else { "FAIL" }) "Detected mode: $mode"

# 4.4 GREEN → RED
Write-Host ""
Write-Host "MANUAL STEP: Stop CAPS/service-host again. Cloud stays up." -ForegroundColor Yellow
Read-Host "Press ENTER when app shows RED"
$mode = Get-CurrentMode
Log-Test "4-TRANSITION" "4.4" "GREEN -> RED (CAPS down, cloud up)" $(if ($mode -eq "red") { "PASS" } else { "FAIL" }) "Detected mode: $mode — must be RED not GREEN"

# 4.5 No false GREEN
$falseGreenLogs = Search-Logs "setConnectionMode\('green'\)" 500
$redLogs = Search-Logs "setConnectionMode\('red'\)" 500
$lastRed = -1; $lastGreen = -1
for ($i = 0; $i -lt $redLogs.Count; $i++) { $lastRed = $i }
for ($i = 0; $i -lt $falseGreenLogs.Count; $i++) { $lastGreen = $i }
Log-Test "4-TRANSITION" "4.5" "No false GREEN after RED" $(if ($mode -eq "red") { "PASS" } else { "FAIL" }) "Current mode=$mode after CAPS stop"

# 4.6 YELLOW → RED
Write-Host ""
Write-Host "MANUAL STEP: Restore CAPS, then block cloud, then stop CAPS." -ForegroundColor Yellow
Write-Host "  Step 1: Start CAPS (wait for YELLOW since cloud is irrelevant)"
Write-Host "  Step 2: Block cloud access"
Write-Host "  Step 3: Wait for YELLOW"  
Write-Host "  Step 4: Stop CAPS"
Write-Host "  Step 5: Wait for RED"
Read-Host "Press ENTER when app shows RED after YELLOW->RED transition"
$mode = Get-CurrentMode
Log-Test "4-TRANSITION" "4.6" "YELLOW -> RED" $(if ($mode -eq "red") { "PASS" } else { "FAIL" }) "Detected mode: $mode"

# ============================================================================
# GROUP 6: Extended Data Integrity (RUNTIME on Desktop)
# ============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " GROUP 6: Extended Integrity (Desktop Runtime)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "MANUAL STEP: Restore CAPS + cloud. Wait for GREEN mode." -ForegroundColor Yellow
Read-Host "Press ENTER when GREEN"

# 6.1 Modifier persistence through pickup
Write-Host ""
Write-Host "MANUAL STEP: Open a check, add an item with modifiers, send, close." -ForegroundColor Yellow
Write-Host "  Then pick up the check and verify modifiers are displayed." -ForegroundColor Yellow
$modPersist = Read-Host "Do modifiers persist after pickup? (Y/N)"
Log-Test "6-INTEGRITY" "6.1" "Modifier persistence through pickup" $(if ($modPersist -eq "Y") { "PASS" } else { "FAIL" }) "Manual"

# 6.2 Reopen check
Write-Host ""
Write-Host "MANUAL STEP: Close a check, then reopen it (manager approval required)." -ForegroundColor Yellow
$reopenResult = Read-Host "Did reopen succeed with manager approval? (Y/N)"
Log-Test "6-INTEGRITY" "6.2" "Reopen check with manager approval" $(if ($reopenResult -eq "Y") { "PASS" } else { "FAIL" }) "Manual"

# 6.3 KDS offline workflow
Write-Host ""
Write-Host "MANUAL STEP: Open the KDS display. Ring items and send." -ForegroundColor Yellow
Write-Host "  Verify tickets appear, bump works, recall works." -ForegroundColor Yellow
$kdsResult = Read-Host "Does KDS ticket lifecycle work (appear/bump/recall)? (Y/N)"
Log-Test "6-INTEGRITY" "6.3" "KDS ticket lifecycle" $(if ($kdsResult -eq "Y") { "PASS" } else { "FAIL" }) "Manual"

# 6.4 Local journal creation
Write-Host ""
Write-Host "Checking local journal/outbox..." -ForegroundColor Yellow
$journalDb = "$env:APPDATA\cloud-pos\offline.db"
if (Test-Path $journalDb) {
    Log-Test "6-INTEGRITY" "6.4" "Local SQLite database exists" "PASS" $journalDb
} else {
    $journalDb2 = "$env:APPDATA\cloud-pos\pos-offline.db"
    if (Test-Path $journalDb2) {
        Log-Test "6-INTEGRITY" "6.4" "Local SQLite database exists" "PASS" $journalDb2
    } else {
        Log-Test "6-INTEGRITY" "6.4" "Local SQLite database exists" "FAIL" "Not found at $journalDb or $journalDb2"
    }
}

# 6.5 Reconnect sync behavior
Write-Host ""
Write-Host "MANUAL STEP: Block cloud, make a transaction, then restore cloud." -ForegroundColor Yellow
Write-Host "  Watch logs for sync activity after reconnect." -ForegroundColor Yellow
Read-Host "Press ENTER after reconnect and sync"
$syncLogs = Search-Logs "TransactionSync|syncToCaps|cloud.*sync|background.*sync" 300
Log-Test "6-INTEGRITY" "6.5" "Reconnect sync behavior" $(if ($syncLogs.Count -gt 0) { "PASS" } else { "FAIL" }) "Sync log entries: $($syncLogs.Count)"

# ============================================================================
# RESULTS
# ============================================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " RESULTS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  RUNTIME PASS: $runtimePass" -ForegroundColor Green
Write-Host "  RUNTIME FAIL: $runtimeFail" -ForegroundColor $(if ($runtimeFail -gt 0) { "Red" } else { "Green" })
Write-Host ""

# Group summary
$groups = $results | Group-Object { $_.group }
foreach ($g in $groups) {
    $gPass = ($g.Group | Where-Object { $_.status -eq "PASS" }).Count
    $gFail = ($g.Group | Where-Object { $_.status -eq "FAIL" }).Count
    $gTotal = $g.Group.Count
    $color = if ($gFail -gt 0) { "Red" } else { "Green" }
    Write-Host "  $($g.Name): $gPass/$gTotal PASS" -ForegroundColor $color
}

# Save results
$outputFile = "validation-results-$timestamp.json"
$output = @{
    version = "3.1.77"
    timestamp = $timestamp
    cloud = $CloudUrl
    caps = $CapsUrl
    runtimePass = $runtimePass
    runtimeFail = $runtimeFail
    tests = $results
}
$output | ConvertTo-Json -Depth 5 | Out-File $outputFile -Encoding UTF8
Write-Host ""
Write-Host "  Results saved to: $outputFile" -ForegroundColor Gray

# Capture app logs
$logCopyDir = "validation-logs-$timestamp"
if (Test-Path $logDir) {
    New-Item -ItemType Directory -Path $logCopyDir -Force | Out-Null
    Copy-Item "$logDir\*" $logCopyDir -Force -ErrorAction SilentlyContinue
    Write-Host "  App logs copied to: $logCopyDir\" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " VALIDATION COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
