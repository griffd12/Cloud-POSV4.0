# Cloud POS — Local Failover Server (LFS) Installation Guide

## Overview

The Local Failover Server (LFS) runs on a dedicated PC at your store (the "service host").
It maintains a local copy of your property's database so that POS terminals and KDS
displays can keep working even if the cloud server or internet goes down.

**Architecture:**
- One service host PC per property runs the LFS and local PostgreSQL
- All POS terminals and KDS displays connect to the service host over your LAN
- The LFS syncs configuration from the cloud and sends transactions back to the cloud
- Credit card payments go directly to the payment processor (not through the cloud)

## What You Need

| Item | Details |
|------|---------|
| **Service Host PC** | Windows 10/11 PC that stays powered on during business hours |
| **RAM** | 4 GB minimum, 8 GB recommended |
| **Disk** | 2 GB free space for PostgreSQL + LFS |
| **Network** | Wired ethernet recommended (Wi-Fi works but wired is more reliable) |
| **LFS Package** | Downloaded from GitHub Releases or provided by your administrator |
| **Cloud URL** | The URL of your Cloud POS server |
| **Admin Credentials** | EMC email and password with enterprise_admin or property_admin role |

## Installation Steps

### Step 1: Extract the LFS Package

Download the latest LFS release (e.g., `cloud-pos-lfs-4.x.x-windows.zip`) and extract
it to a permanent location on your service host PC. We recommend:

```
C:\CloudPOS-LFS\
```

Do NOT extract to a temporary folder or the desktop. The LFS service runs from this location.

### Step 2: Run the One-Click Installer

Open **PowerShell as Administrator** (right-click PowerShell → "Run as administrator").

**Important:** Windows blocks scripts downloaded from the internet by default. 
Run this command first to allow the installer to run (applies only to the current
PowerShell window):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then navigate to the scripts folder and run the installer. Note the `.\` prefix — 
PowerShell requires it to run scripts from the current directory:

```powershell
cd C:\CloudPOS-LFS\scripts
.\install-lfs.ps1
```

The installer will automatically:

1. **Check for PostgreSQL** — If PostgreSQL 17 is not installed, the bundled installer
   runs silently. No user interaction needed. PostgreSQL installs as a Windows service
   that starts automatically on boot.

2. **Create the database** — Creates a database called `cloud_pos_lfs` and a user
   called `lfs_user` with an auto-generated secure password.

3. **Initialize the schema** — Creates all database tables needed by the POS system.

4. **Write configuration** — Generates the `.env` file with the correct database
   connection string and default settings.

5. **Install LFS as a Windows service** — The "CloudPOS-LFS" service starts
   automatically when Windows boots. If it crashes, it restarts automatically.

6. **Open firewall ports** — Opens ports 3001 (POS API) and 3002 (Admin Dashboard)
   so other devices on your LAN can connect.

7. **Start the LFS service** — The LFS server starts immediately.

8. **Open the Admin Dashboard** — Your browser opens to `http://localhost:3002`
   where you complete the first-run setup wizard.

### Step 3: First-Run Setup Wizard

After the installer finishes, the Admin Dashboard opens in your browser. The setup
wizard walks you through connecting to the cloud:

**Step 3a: Enter Cloud URL**
- Enter the URL of your Cloud POS server (e.g., `https://your-cloud-pos.replit.app`)
- The wizard tests the connection to make sure it's reachable

**Step 3b: Enter Admin Credentials**
- Enter your EMC email and password
- You must have enterprise_admin or property_admin access

**Step 3c: Select Property**
- Choose your property from the list (e.g., "Newport Beach")
- Each LFS serves one property

**Step 3d: Select Device Type and Device**
- Choose "Service Host" as the device type
- Select the device name for this PC (e.g., "Derek-Laptop")

**Step 3e: Initial Sync**
- Click "Start Sync" to download all configuration from the cloud
- This includes menus, employees, modifiers, tenders, tax groups, and all settings
- A progress bar shows the sync status
- This typically takes 30-60 seconds depending on your data

**After sync completes:**
- The Admin Dashboard shows a green status indicator
- The LFS is fully operational
- POS terminals and KDS displays can now connect

### Step 4: Connect POS Terminals and KDS Displays

Other devices on your LAN simply open a web browser and navigate to:

```
http://<service-host-ip>:3001
```

For example, if the service host PC's IP address is `192.168.1.4`:

```
http://192.168.1.4:3001
```

Each terminal or KDS display:
1. Opens the browser to the LFS URL
2. Selects device type ("Workstation" or "KDS")
3. Selects their device name from the list
4. Starts working — no additional setup needed

**Finding your service host IP:**
Open Command Prompt on the service host PC and run `ipconfig`. Look for the
"IPv4 Address" under your ethernet or Wi-Fi adapter.

## After Installation

### What Runs Automatically

| Service | Description | Starts On |
|---------|-------------|-----------|
| PostgreSQL 17 | Local database | Windows boot |
| CloudPOS-LFS | LFS server (port 3001 + 3002) | Windows boot |
| LFS Tray Indicator | System tray icon (Green/Yellow/Red) | User login |

### Ports Used

| Port | Service | Accessible From |
|------|---------|-----------------|
| 3001 | POS API | All LAN devices |
| 3002 | Admin Dashboard | Service host only (or LAN if needed) |
| 5432 | PostgreSQL | localhost only |

### Status Indicator (System Tray)

The system tray icon shows the LFS status:

| Color | Meaning |
|-------|---------|
| **Green** | Everything healthy — synced with cloud, internet available |
| **Yellow** | Internet available but cloud sync is stale or delayed |
| **Red** | No internet or LFS not responding — POS still works locally |

Right-click the tray icon for options:
- Open Admin Dashboard
- Open POS
- Sync Now
- Exit Tray Monitor

### Ongoing Sync

- **Configuration sync** (cloud → local) runs every 60 seconds by default
- **Transaction sync** (local → cloud) runs continuously in the background
- If the cloud or internet goes down, transactions queue locally and sync when connectivity returns

## Troubleshooting

### LFS service won't start
1. Open PowerShell as Administrator
2. Run: `Get-Service CloudPOS-LFS | Format-List *`
3. Check the logs at `C:\CloudPOS-LFS\logs\`
4. Verify PostgreSQL is running: `Get-Service postgresql*`

### POS terminals can't connect
1. Verify the service host IP hasn't changed: run `ipconfig`
2. Check Windows Firewall allows port 3001
3. Make sure the LFS service is running: look for the green tray icon
4. Try accessing `http://localhost:3001/api/health` from the service host itself

### Sync issues
1. Open the Admin Dashboard at `http://localhost:3002`
2. Check the Sync Status card for errors
3. Click "Sync Now" to trigger a manual sync
4. Verify the cloud URL is correct in Configuration tab

### Reset / Reinstall
To completely reset the LFS:
1. Stop the service: `Stop-Service CloudPOS-LFS`
2. Delete the database: open `psql -U postgres` and run `DROP DATABASE cloud_pos_lfs;`
3. Re-run the installer: `.\scripts\install-lfs.ps1`
4. Go through the first-run wizard again

## Uninstalling

Run the uninstaller script as Administrator:

```powershell
cd C:\CloudPOS-LFS
.\scripts\uninstall-windows-service.ps1
```

This removes the Windows service and firewall rules. To also remove PostgreSQL,
use the Windows "Add or Remove Programs" settings.
