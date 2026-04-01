#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-click installer for the Cloud POS Local Failover Server.
.DESCRIPTION
    Installs PostgreSQL 17 (if needed), creates the LFS database and user,
    initializes the schema, writes the .env configuration, installs LFS
    as a Windows Service, and opens the admin dashboard for first-run setup.
.PARAMETER InstallDir
    The directory where the LFS package is extracted. Defaults to current directory.
.PARAMETER Port
    The POS API port. Defaults to 3001.
.PARAMETER AdminPort
    The admin dashboard port. Defaults to 3002.
.PARAMETER PgPort
    PostgreSQL port. Defaults to 5432.
.PARAMETER DbName
    The LFS database name. Defaults to "cloud_pos_lfs".
.PARAMETER DbUser
    The LFS database user. Defaults to "lfs_user".
#>

param(
    [string]$InstallDir = (Get-Location).Path,
    [int]$Port = 3001,
    [int]$AdminPort = 3002,
    [int]$PgPort = 5432,
    [string]$DbName = "cloud_pos_lfs",
    [string]$DbUser = "lfs_user"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Cloud POS - LFS One-Click Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

function Generate-Password {
    $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    $password = ""
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 1
    for ($i = 0; $i -lt 24; $i++) {
        $rng.GetBytes($bytes)
        $password += $chars[$bytes[0] % $chars.Length]
    }
    return $password
}

$serverFile = Join-Path $InstallDir "server.cjs"
if (-not (Test-Path $serverFile)) {
    Write-Host "ERROR: server.cjs not found in $InstallDir" -ForegroundColor Red
    Write-Host "Please run this script from the LFS distribution directory." -ForegroundColor Yellow
    exit 1
}

$bundledNode = Join-Path $InstallDir "runtime\node.exe"
if (Test-Path $bundledNode) {
    $nodePath = $bundledNode
    $nodeVersion = (& $nodePath --version)
    Write-Host "[OK] Bundled Node.js: $nodeVersion" -ForegroundColor Green
} else {
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Path
    if (-not $nodePath) {
        Write-Host "ERROR: Node.js not found." -ForegroundColor Red
        exit 1
    }
    $nodeVersion = (& $nodePath --version)
    Write-Host "[OK] System Node.js: $nodeVersion" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 1: PostgreSQL Installation" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$pgInstalled = $false
$pgSuperPassword = ""

$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
if ($pgService) {
    Write-Host "[OK] PostgreSQL service already running: $($pgService.Name)" -ForegroundColor Green
    $pgInstalled = $true
}

if (-not $pgInstalled) {
    $pgExe = Get-Command psql -ErrorAction SilentlyContinue
    if ($pgExe) {
        Write-Host "[OK] PostgreSQL found at $($pgExe.Path)" -ForegroundColor Green
        $pgInstalled = $true
    }
}

if (-not $pgInstalled) {
    $pgInstaller = Join-Path $InstallDir "installers\postgresql-17.9-2-windows-x64.exe"
    if (-not (Test-Path $pgInstaller)) {
        Write-Host "ERROR: PostgreSQL is not installed and the bundled installer was not found." -ForegroundColor Red
        Write-Host "Expected: $pgInstaller" -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
        Write-Host "Options:" -ForegroundColor Yellow
        Write-Host "  1. Install PostgreSQL 17 manually from https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
        Write-Host "  2. Place postgresql-17.9-2-windows-x64.exe in the installers\ folder and re-run" -ForegroundColor Yellow
        exit 1
    }

    $pgSuperPassword = Generate-Password
    $pgDataDir = Join-Path $InstallDir "pg-data"

    Write-Host "Installing PostgreSQL 17 silently..." -ForegroundColor Yellow
    Write-Host "  Data directory: $pgDataDir" -ForegroundColor Gray
    Write-Host "  Port: $PgPort" -ForegroundColor Gray
    Write-Host "  This may take a few minutes..." -ForegroundColor Gray

    $pgArgs = @(
        "--mode", "unattended",
        "--unattendedmodeui", "none",
        "--superpassword", $pgSuperPassword,
        "--serverport", $PgPort.ToString(),
        "--datadir", $pgDataDir,
        "--servicename", "postgresql-17",
        "--enable-components", "server",
        "--disable-components", "pgAdmin,stackbuilder"
    )

    $pgProcess = Start-Process -FilePath $pgInstaller -ArgumentList $pgArgs -Wait -PassThru -NoNewWindow
    if ($pgProcess.ExitCode -ne 0) {
        Write-Host "ERROR: PostgreSQL installation failed (exit code: $($pgProcess.ExitCode))" -ForegroundColor Red
        exit 1
    }

    Start-Sleep -Seconds 5

    $pgServiceCheck = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    if ($pgServiceCheck -and $pgServiceCheck.Status -eq "Running") {
        Write-Host "[OK] PostgreSQL 17 installed and running" -ForegroundColor Green
    } else {
        Write-Host "Starting PostgreSQL service..." -ForegroundColor Yellow
        Start-Service -Name "postgresql-17" -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
        $pgServiceCheck = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
        if ($pgServiceCheck -and $pgServiceCheck.Status -eq "Running") {
            Write-Host "[OK] PostgreSQL service started" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Could not verify PostgreSQL service is running." -ForegroundColor Yellow
            Write-Host "You may need to start it manually from Windows Services." -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Step 2: Database Setup" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

$psqlPath = (Get-Command psql -ErrorAction SilentlyContinue).Path
if (-not $psqlPath) {
    $pgBinDirs = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin",
        "C:\Program Files\PostgreSQL\15\bin"
    )
    foreach ($dir in $pgBinDirs) {
        $testPath = Join-Path $dir "psql.exe"
        if (Test-Path $testPath) {
            $psqlPath = $testPath
            $env:PATH = "$dir;$env:PATH"
            break
        }
    }
}

if (-not $psqlPath) {
    Write-Host "ERROR: psql not found. Make sure PostgreSQL bin directory is in PATH." -ForegroundColor Red
    exit 1
}

$dbPassword = Generate-Password

if ($pgSuperPassword) {
    $env:PGPASSWORD = $pgSuperPassword
} else {
    Write-Host "Enter the PostgreSQL superuser (postgres) password:" -ForegroundColor Yellow
    $securePass = Read-Host -AsSecureString
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
    )
}

Write-Host "Creating database user '$DbUser'..." -ForegroundColor Gray
$userExists = & $psqlPath -h localhost -p $PgPort -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'" 2>$null
if ($userExists -eq "1") {
    Write-Host "  User '$DbUser' already exists, updating password..." -ForegroundColor Gray
    & $psqlPath -h localhost -p $PgPort -U postgres -c "ALTER USER $DbUser WITH PASSWORD '$dbPassword';" 2>$null | Out-Null
} else {
    & $psqlPath -h localhost -p $PgPort -U postgres -c "CREATE USER $DbUser WITH PASSWORD '$dbPassword';" 2>$null | Out-Null
}
Write-Host "[OK] Database user ready" -ForegroundColor Green

Write-Host "Creating database '$DbName'..." -ForegroundColor Gray
$dbExists = & $psqlPath -h localhost -p $PgPort -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>$null
if ($dbExists -eq "1") {
    Write-Host "  Database '$DbName' already exists" -ForegroundColor Gray
} else {
    & $psqlPath -h localhost -p $PgPort -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" 2>$null | Out-Null
}
& $psqlPath -h localhost -p $PgPort -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;" 2>$null | Out-Null
& $psqlPath -h localhost -p $PgPort -U postgres -d $DbName -c "GRANT ALL ON SCHEMA public TO $DbUser;" 2>$null | Out-Null
Write-Host "[OK] Database ready" -ForegroundColor Green

$env:PGPASSWORD = ""

$encodedPassword = [System.Uri]::EscapeDataString($dbPassword)
$databaseUrl = "postgresql://${DbUser}:${encodedPassword}@localhost:${PgPort}/${DbName}"

Write-Host ""
Write-Host "Step 3: Configuration" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan

$envFile = Join-Path $InstallDir ".env"
$envContent = @"
# Cloud POS - Local Failover Server Configuration
# Generated by install-lfs.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

# Database (PostgreSQL - auto-configured)
DB_MODE=local
LFS_DATABASE_URL=$databaseUrl

# Server ports
PORT=$Port
LFS_ADMIN_PORT=$AdminPort

# Cloud connection (configured via first-run wizard)
LFS_CLOUD_URL=
LFS_API_KEY=
LFS_PROPERTY_ID=

# Sync interval (milliseconds)
LFS_SYNC_INTERVAL_MS=60000

# Auto-update
LFS_AUTO_UPDATE=true
LFS_UPDATE_CHECK_INTERVAL_MS=3600000

# Logging
LFS_LOG_LEVEL=info
"@

Set-Content -Path $envFile -Value $envContent -Encoding UTF8
Write-Host "[OK] Configuration written to .env" -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: Schema Initialization" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host "  The LFS server will auto-initialize the database schema on first boot." -ForegroundColor Gray
Write-Host "[OK] Schema initialization will run at first startup" -ForegroundColor Green

Write-Host ""
Write-Host "Step 5: Windows Service Installation" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

$serviceScript = Join-Path $InstallDir "scripts\install-windows-service.ps1"
if (Test-Path $serviceScript) {
    & $serviceScript -InstallDir $InstallDir -Port $Port -AdminPort $AdminPort
} else {
    Write-Host "Service install script not found. Installing directly..." -ForegroundColor Yellow

    $ServiceName = "CloudPOS-LFS"
    $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        sc.exe delete $ServiceName | Out-Null
        Start-Sleep -Seconds 1
    }

    $wrapperScript = Join-Path $InstallDir "service-wrapper.cjs"
    $wrapperContent = @"
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const installDir = path.dirname(process.argv[1] || __filename);
const envFile = path.join(installDir, '.env');

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

process.env.DB_MODE = 'local';
process.env.NODE_ENV = 'production';
process.env.PORT = process.env.PORT || '$Port';
process.env.LFS_ADMIN_PORT = process.env.LFS_ADMIN_PORT || '$AdminPort';

const logDir = path.join(installDir, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, 'lfs-' + new Date().toISOString().slice(0, 10) + '.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const serverPath = path.join(installDir, 'server.cjs');

let currentChild = null;

function startServer() {
  const ts = new Date().toISOString();
  logStream.write(ts + ' [service] Starting LFS server...\n');

  const child = spawn(process.execPath, [serverPath], {
    cwd: installDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  currentChild = child;

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  child.on('exit', (code, signal) => {
    const ts2 = new Date().toISOString();
    logStream.write(ts2 + ' [service] Server exited: code=' + code + ' signal=' + signal + '\n');
    currentChild = null;
    if (code === 100) {
      logStream.write(ts2 + ' [service] Update applied, restarting immediately...\n');
      setTimeout(startServer, 2000);
    } else if (code === 0) {
      logStream.write(ts2 + ' [service] Clean shutdown, not restarting.\n');
    } else {
      logStream.write(ts2 + ' [service] Unexpected exit, restarting in 5 seconds...\n');
      setTimeout(startServer, 5000);
    }
  });

  return child;
}

startServer();

function gracefulShutdown(signal) {
  logStream.write(new Date().toISOString() + ' [service] Received ' + signal + ', shutting down...\n');
  if (currentChild && !currentChild.killed) {
    currentChild.kill('SIGTERM');
    const timeout = setTimeout(() => {
      logStream.write(new Date().toISOString() + ' [service] Force killing child after timeout...\n');
      currentChild.kill('SIGKILL');
      process.exit(1);
    }, 10000);
    currentChild.on('exit', () => {
      clearTimeout(timeout);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
"@
    Set-Content -Path $wrapperScript -Value $wrapperContent -Encoding UTF8

    $binPath = "`"$nodePath`" `"$wrapperScript`""
    sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= "Cloud POS Local Failover Server" | Out-Null
    sc.exe description $ServiceName "Cloud POS Local Failover Server - provides offline POS capability" | Out-Null
    sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null

    Write-Host "[OK] Windows service installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 6: Firewall Configuration" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan

$fwRuleApi = Get-NetFirewallRule -DisplayName "CloudPOS-LFS-API" -ErrorAction SilentlyContinue
if (-not $fwRuleApi) {
    New-NetFirewallRule -DisplayName "CloudPOS-LFS-API" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "[OK] Firewall rule created for API port $Port" -ForegroundColor Green
} else {
    Write-Host "[OK] Firewall rule already exists for API port $Port" -ForegroundColor Green
}

$fwRuleAdmin = Get-NetFirewallRule -DisplayName "CloudPOS-LFS-Admin" -ErrorAction SilentlyContinue
if (-not $fwRuleAdmin) {
    New-NetFirewallRule -DisplayName "CloudPOS-LFS-Admin" -Direction Inbound -Protocol TCP -LocalPort $AdminPort -Action Allow | Out-Null
    Write-Host "[OK] Firewall rule created for Admin port $AdminPort" -ForegroundColor Green
} else {
    Write-Host "[OK] Firewall rule already exists for Admin port $AdminPort" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 7: Starting LFS Service" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

Start-Service -Name "CloudPOS-LFS" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

$svc = Get-Service -Name "CloudPOS-LFS" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "[OK] LFS service is running!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Service may still be starting. Check logs at: $(Join-Path $InstallDir 'logs')" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 8: System Tray Indicator" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

$trayScript = Join-Path $InstallDir "scripts\lfs-tray.ps1"
if (Test-Path $trayScript) {
    $startupDir = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupDir "CloudPOS-LFS-Tray.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`" -ApiPort $Port -AdminPort $AdminPort"
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Description = "Cloud POS LFS System Tray Indicator"
    $shortcut.Save()
    Write-Host "[OK] Tray indicator configured to start on login" -ForegroundColor Green

    Start-Process powershell.exe -ArgumentList "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`" -ApiPort $Port -AdminPort $AdminPort" -WindowStyle Hidden
    Write-Host "[OK] Tray indicator started" -ForegroundColor Green
} else {
    Write-Host "Tray indicator script not found, skipping" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host " Installation Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  POS API:         http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  Admin Dashboard: http://localhost:$AdminPort" -ForegroundColor Cyan
Write-Host "  PostgreSQL:      localhost:$PgPort (database: $DbName)" -ForegroundColor Cyan
Write-Host "  Install Dir:     $InstallDir" -ForegroundColor Cyan
Write-Host "  Logs:            $(Join-Path $InstallDir 'logs')" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next: Complete the first-run setup wizard in your browser." -ForegroundColor Yellow
Write-Host ""

Start-Process "http://localhost:$AdminPort"
Write-Host "Opening Admin Dashboard in your browser..." -ForegroundColor Gray
