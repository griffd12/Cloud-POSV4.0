# Newport Beach Test Location — LFS Deployment Guide

## Overview

This guide covers deploying the Local Failover Server (LFS) on **Derek-Laptop** to serve as the offline failover controller for the Newport Beach test property.

## Prerequisites

- Windows 10/11 on Derek-Laptop
- Internet connectivity for initial download
- Newport Beach property already configured in EMC

## Step 1: Download the LFS Package

1. Go to **GitHub → griffd12/Cloud-POSV4.0 → Actions** tab
2. Click **Build LFS Package** workflow
3. Click **Run workflow** → select **windows** → click **Run workflow**
4. Once complete, download the artifact ZIP from the completed run

Alternatively, download from the **Releases** page if a tagged release is available.

## Step 2: Extract

1. Create a folder: `C:\CloudPOS-LFS\`
2. Extract the downloaded ZIP contents into that folder
3. You should see: `server.cjs`, `start-lfs.bat`, `runtime\`, `scripts\`, etc.

## Step 3: Generate API Key in EMC

1. Log in to EMC at your cloud URL
2. Navigate to: **Hierarchy → [Newport Beach Property] → Local Failover Server**
3. Click **Generate API Key**
4. **Copy the key immediately** — it is only shown once

## Step 4: Configure the .env File

1. Copy `.env.example` to `.env` in the LFS folder
2. Edit `.env` with the following values:

```env
LFS_CLOUD_URL=https://your-replit-app-url.replit.app
LFS_API_KEY=paste-your-api-key-here
LFS_PROPERTY_ID=your-newport-beach-property-id

PORT=3001
LFS_ADMIN_PORT=3002
DB_MODE=local
SQLITE_PATH=./data/pos-local.db
LFS_SYNC_INTERVAL_MS=60000
```

Replace the placeholder values:
- `LFS_CLOUD_URL`: Your deployed Cloud POS URL from Replit
- `LFS_API_KEY`: The key generated in Step 3
- `LFS_PROPERTY_ID`: The property ID shown in EMC for Newport Beach

## Step 5: Start the LFS

### Option A: Manual Start (for testing)
Double-click `start-lfs.bat` or run from command prompt:
```cmd
cd C:\CloudPOS-LFS\cloud-pos-lfs
start-lfs.bat
```

### Option B: Install as Windows Service (for production)
Open PowerShell as Administrator:
```powershell
cd C:\CloudPOS-LFS\cloud-pos-lfs
.\scripts\install-windows-service.ps1
```

This will:
- Install the LFS as a Windows service that starts automatically on boot
- Configure automatic restart on failure
- Set up firewall rules for ports 3001 and 3002
- Optionally start the system tray indicator

## Step 6: Verify

1. Open browser: 
4. Open **http://localhost:3001** → POS interface (failover mode)

## Network Configuration

For POS terminals on the local network to reach the LFS:
- LFS API: `http://derek-laptop:3001` (or use the machine's local IP)
- LFS Admin: `http://derek-laptop:3002`
- Ensure Windows Firewall allows inbound on ports 3001 and 3002

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Connection refused" on port 3001 | Check if LFS is running: `Get-Service CloudPOS-LFS` |
| Sync not working | Verify `LFS_CLOUD_URL` is correct and reachable from laptop |
| "Invalid API key" on admin login | Re-generate key in EMC and update `.env` |
| Service won't start | Check logs in `C:\CloudPOS-LFS\cloud-pos-lfs\logs\` |
| Native module errors | Run `npm rebuild better-sqlite3` in the LFS folder |

## Updating the LFS

When a new version is released:
1. Stop the service: `Stop-Service CloudPOS-LFS`
2. Download the new LFS package from GitHub Actions/Releases
3. Extract over the existing folder (preserves `data/`, `logs/`, `.env`)
4. Start the service: `Start-Service CloudPOS-LFS`

Or enable auto-update in `.env`:
```env
LFS_AUTO_UPDATE=true
LFS_UPDATE_CHECK_INTERVAL_MS=3600000
```
