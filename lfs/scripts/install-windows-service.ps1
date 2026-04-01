#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs the Cloud POS Local Failover Server as a Windows Service.
.DESCRIPTION
    Sets up the LFS to run as a Windows Service with auto-start on boot,
    automatic restart on failure, and event logging.
.PARAMETER InstallDir
    The directory where the LFS is installed. Defaults to current directory.
.PARAMETER ServiceName
    The name of the Windows Service. Defaults to "CloudPOS-LFS".
.PARAMETER Port
    The API port. Defaults to 3001.
.PARAMETER AdminPort
    The admin dashboard port. Defaults to 3002.
#>

param(
    [string]$InstallDir = (Get-Location).Path,
    [string]$ServiceName = "CloudPOS-LFS",
    [string]$DisplayName = "Cloud POS Local Failover Server",
    [int]$Port = 3001,
    [int]$AdminPort = 3002
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Cloud POS - LFS Windows Service Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$bundledNode = Join-Path $InstallDir "runtime\node.exe"
if (Test-Path $bundledNode) {
    $nodePath = $bundledNode
    $nodeVersion = (& $nodePath --version)
    Write-Host "Bundled Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Path
    if (-not $nodePath) {
        Write-Host "ERROR: Node.js not found. No bundled runtime and no system Node.js." -ForegroundColor Red
        Write-Host "Please install Node.js 18+ from https://nodejs.org or rebuild the LFS package with --platform windows" -ForegroundColor Yellow
        exit 1
    }
    $nodeVersion = (& $nodePath --version)
    Write-Host "System Node.js found: $nodeVersion at $nodePath" -ForegroundColor Green
}

$serverFile = Join-Path $InstallDir "server.cjs"
if (-not (Test-Path $serverFile)) {
    Write-Host "ERROR: server.cjs not found in $InstallDir" -ForegroundColor Red
    Write-Host "Please run this script from the LFS distribution directory." -ForegroundColor Yellow
    exit 1
}

$dataDir = Join-Path $InstallDir "data"
$logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$envFile = Join-Path $InstallDir ".env"
if (-not (Test-Path $envFile)) {
    $envExample = Join-Path $InstallDir ".env.example"
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "Created .env from .env.example — please configure it before starting." -ForegroundColor Yellow
    }
}

$wrapperScript = Join-Path $InstallDir "service-wrapper.cjs"
$wrapperContent = @'
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
process.env.PORT = process.env.PORT || '%%LFS_PORT%%';
process.env.LFS_ADMIN_PORT = process.env.LFS_ADMIN_PORT || '%%LFS_ADMIN_PORT%%';

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
'@
$wrapperContent = $wrapperContent.Replace('%%LFS_PORT%%', $Port.ToString())
$wrapperContent = $wrapperContent.Replace('%%LFS_ADMIN_PORT%%', $AdminPort.ToString())
Set-Content -Path $wrapperScript -Value $wrapperContent -Encoding UTF8

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Stopping existing service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
}

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssm) {
    Write-Host "Installing service using NSSM..." -ForegroundColor Green
    & nssm install $ServiceName $nodePath $wrapperScript
    & nssm set $ServiceName DisplayName $DisplayName
    & nssm set $ServiceName Description "Cloud POS Local Failover Server - provides offline POS capability"
    & nssm set $ServiceName Start SERVICE_AUTO_START
    & nssm set $ServiceName AppDirectory $InstallDir
    & nssm set $ServiceName AppStdout (Join-Path $logDir "service-stdout.log")
    & nssm set $ServiceName AppStderr (Join-Path $logDir "service-stderr.log")
    & nssm set $ServiceName AppRotateFiles 1
    & nssm set $ServiceName AppRotateBytes 10485760
} else {
    Write-Host "NSSM not found. Installing service using sc.exe..." -ForegroundColor Yellow
    Write-Host "Note: For production use, install NSSM (https://nssm.cc) for better service management." -ForegroundColor Yellow

    $binPath = "`"$nodePath`" `"$wrapperScript`""
    sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= $DisplayName | Out-Null
    sc.exe description $ServiceName "Cloud POS Local Failover Server - provides offline POS capability" | Out-Null
    sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
}

Write-Host ""
Write-Host "Service '$ServiceName' installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Install Dir:  $InstallDir"
Write-Host "  API Port:     $Port"
Write-Host "  Admin Port:   $AdminPort"
Write-Host "  Data Dir:     $dataDir"
Write-Host "  Log Dir:      $logDir"
Write-Host ""

$startNow = Read-Host "Start the service now? (Y/n)"
if ($startNow -ne 'n' -and $startNow -ne 'N') {
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 3
    $svc = Get-Service -Name $ServiceName
    if ($svc.Status -eq 'Running') {
        Write-Host "Service is running!" -ForegroundColor Green
        Write-Host "  POS API: http://localhost:$Port" -ForegroundColor Cyan
        Write-Host "  Admin:   http://localhost:$AdminPort" -ForegroundColor Cyan
    } else {
        Write-Host "Service failed to start. Check logs at: $logDir" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Firewall rules..." -ForegroundColor Cyan
$fwRuleApi = Get-NetFirewallRule -DisplayName "CloudPOS-LFS-API" -ErrorAction SilentlyContinue
if (-not $fwRuleApi) {
    New-NetFirewallRule -DisplayName "CloudPOS-LFS-API" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "  Created firewall rule for API port $Port" -ForegroundColor Green
}
$fwRuleAdmin = Get-NetFirewallRule -DisplayName "CloudPOS-LFS-Admin" -ErrorAction SilentlyContinue
if (-not $fwRuleAdmin) {
    New-NetFirewallRule -DisplayName "CloudPOS-LFS-Admin" -Direction Inbound -Protocol TCP -LocalPort $AdminPort -Action Allow | Out-Null
    Write-Host "  Created firewall rule for Admin port $AdminPort" -ForegroundColor Green
}

Write-Host ""
Write-Host "System tray indicator..." -ForegroundColor Cyan
$trayScript = Join-Path $InstallDir "lfs-tray.ps1"
$traySource = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "lfs-tray.ps1"
if (Test-Path $traySource) {
    Copy-Item $traySource $trayScript -Force
    Write-Host "  Copied tray indicator script" -ForegroundColor Green
}

$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "CloudPOS-LFS-Tray.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`" -ApiPort $Port -AdminPort $AdminPort"
$shortcut.WorkingDirectory = $InstallDir
$shortcut.Description = "Cloud POS LFS System Tray Indicator"
$shortcut.Save()
Write-Host "  Tray indicator will start automatically on login" -ForegroundColor Green

$startTray = Read-Host "Start tray indicator now? (Y/n)"
if ($startTray -ne 'n' -and $startTray -ne 'N') {
    Start-Process powershell.exe -ArgumentList "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`" -ApiPort $Port -AdminPort $AdminPort" -WindowStyle Hidden
    Write-Host "  Tray indicator started" -ForegroundColor Green
}

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Edit .env file with cloud connection details"
Write-Host "  2. Access admin dashboard at http://localhost:$AdminPort"
Write-Host "  3. Verify sync status and configure property settings"
