# Cloud POS — Electron Build Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Build Pipeline                      │
│                                                      │
│  Source Code                                         │
│  ├── client/ (React + Vite)  ──┐                    │
│  ├── server/ (Express API)   ──┤── npm run build    │
│  ├── shared/ (Schema/Types)  ──┘      │             │
│  │                                    ▼             │
│  │                           dist/   (compiled)     │
│  │                           ├── public/ (frontend) │
│  │                           └── index.js (server)  │
│  │                                    │             │
│  ├── electron/                        │             │
│  │   ├── main.cjs                     │             │
│  │   ├── preload.cjs                  │             │
│  │   ├── service-host-embedded.cjs    │             │
│  │   ├── offline-database.cjs         │             │
│  │   └── electron-builder.json        │             │
│  │                                    ▼             │
│  └─────────────────────► electron-builder           │
│                            │                        │
│                            ▼                        │
│                  electron-dist/                     │
│                  └── Cloud POS-{ver}-Setup.exe      │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | LTS recommended |
| npm | 9+ | Comes with Node.js |
| Windows | 10/11 | Required for building Windows installer |
| Visual Studio Build Tools | 2019+ | For native module compilation (better-sqlite3) |
| Git | 2.x | For version control |

## Native Dependencies

The Electron app requires these native Node.js modules:

```bash
npm install better-sqlite3 keytar ws --save
```

For SQLCipher encryption support (AES-256), rebuild better-sqlite3 with SQLCipher:
```bash
npm rebuild better-sqlite3 --build-from-source --sqlite3=sqlcipher
```

---

## Complete Build Process (Step-by-Step)

### Step 1: Bump Version

Every release must have a unique version number. The version is tracked in three files that must stay in sync:

| File | Field | Example |
|------|-------|---------|
| `electron/build-info.json` | `version` | `"3.1.111"` |
| `electron/electron-builder.json` | `extraMetadata.version` | `"3.1.111"` |
| `electron/service-host-embedded.cjs` | `CAPS_VERSION` | `'3.1.111'` |

**Using the bump script (recommended):**
```bash
node electron/bump-version.cjs patch   # 3.1.110 → 3.1.111
node electron/bump-version.cjs minor   # 3.1.110 → 3.2.0
node electron/bump-version.cjs major   # 3.1.110 → 4.0.0
```

**Manual bump (if script unavailable):**
1. Update `version` in `electron/build-info.json`
2. Update `previousVersion` in `electron/build-info.json`
3. Update `buildDate` and `buildNumber` in `electron/build-info.json`
4. Update `extraMetadata.version` in `electron/electron-builder.json`
5. Update `CAPS_VERSION` in `electron/service-host-embedded.cjs` (line 3)

### Step 2: Create Release Notes

Create `electron/RELEASE_NOTES_v{version}.md` documenting:
- Summary of changes
- New features with technical details
- Bug fixes with root cause analysis
- Schema changes (if any) with migration details
- Files changed
- Upgrade notes
- Known issues

### Step 3: Build the Web Application

```bash
npm run build
```

This compiles:
- **Frontend**: React/TypeScript → optimized production bundle via Vite (output: `dist/public/`)
- **Backend**: TypeScript → JavaScript via esbuild (output: `dist/index.js`)
- **Shared types**: Compiled alongside both targets

Verify the build succeeded:
```bash
ls -la dist/public/index.html    # Frontend entry
ls -la dist/index.js              # Backend entry
```

### Step 4: Build the Electron Installer

```bash
npx electron-builder --config electron/electron-builder.json --win
```

This packages:
- The compiled `dist/` output
- Electron runtime
- Native modules (better-sqlite3, keytar)
- The service-host-embedded.cjs (CAPS engine)
- Application icons and metadata

**Output:** `electron-dist/Cloud POS-{version}-Setup.exe`

### Step 5: Verify the Build

```bash
ls -la "electron-dist/Cloud POS-{version}-Setup.exe"
```

Check the installer size (typical: 80-120 MB).

---

## Quick Build (One-liner)

```bash
node electron/bump-version.cjs patch && npm run build && npx electron-builder --config electron/electron-builder.json --win
```

Or use the build script if available:
```bash
./scripts/build-windows.sh
```

---

## CI/CD Build (GitHub Actions)

The repository includes `.github/workflows/electron-build.yml` which:

1. Checks out the repository on `windows-latest`
2. Sets up Node.js 18
3. Installs dependencies (`npm ci`)
4. Builds the web application (`npm run build`)
5. Builds the Electron installer (`npx electron-builder`)
6. Uploads the `.exe` to GitHub Releases

**Trigger methods:**
- Manual: GitHub Actions → workflow_dispatch
- Automatic: On release publication

---

## What Gets Packaged

```
Cloud POS Setup.exe
├── Electron runtime (Chromium + Node.js)
├── dist/
│   ├── public/              # React frontend (HTML/CSS/JS)
│   └── index.js             # Express backend
├── electron/
│   ├── main.cjs             # Electron main process (window management, IPC)
│   ├── preload.cjs          # Context bridge (secure renderer↔main IPC)
│   ├── service-host-embedded.cjs  # CAPS engine (SQLite, config sync, payments)
│   ├── offline-database.cjs # Workstation-level offline SQLite
│   └── assets/              # Icons, splash screen
├── node_modules/
│   ├── better-sqlite3/      # Native SQLite binding
│   ├── keytar/              # OS keychain integration
│   └── ws/                  # WebSocket client
└── build-info.json          # Version metadata
```

---

## Three-Layer Runtime Architecture

```
┌──────────────────────────────────────────────────────────┐
│  LAYER 1: Cloud (PostgreSQL)                             │
│  └── Enterprise config, master data, reporting           │
│      URL: https://cloud-pos.example.com                  │
└────────────────┬─────────────────────────────────────────┘
                 │  HTTPS (config sync, transaction upload)
                 ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 2: CAPS (service-host-embedded.cjs)               │
│  └── Local authority: SQLite database                    │
│      Config sync (Cloud → CAPS)                          │
│      Transaction sync (CAPS → Cloud)                     │
│      Payment proxy, KDS routing, print queue             │
│      Runs on: CAPS workstation (Windows)                 │
└────────────────┬─────────────────────────────────────────┘
                 │  WebSocket + REST (localhost)
                 ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 3: Workstations (Electron renderer)               │
│  └── Touch POS UI (React)                                │
│      Connects to CAPS via WebSocket for real-time state  │
│      IndexedDB for emergency offline caching             │
│      Runs on: POS terminals (Windows touchscreens)       │
└──────────────────────────────────────────────────────────┘
```

---

## Log Files (Post-Installation)

| Log | Path | Contents |
|-----|------|----------|
| Application | `%LOCALAPPDATA%\Cloud POS\logs\app.log` | Startup, config, errors |
| Print Agent | `%LOCALAPPDATA%\Cloud POS\logs\print-agent.log` | Print jobs, connections |
| Offline DB | `%LOCALAPPDATA%\Cloud POS\logs\offline-db.log` | SQLite init, sync, encryption |
| Installer | `%LOCALAPPDATA%\Cloud POS\logs\installer.log` | Installation steps |
| CAPS System | `%LOCALAPPDATA%\Cloud POS\logs\system.log` | Service-host operations |
| CAPS Gateway | `%LOCALAPPDATA%\Cloud POS\logs\gateway.log` | HTTP request/response log |

Access logs from the app: **Settings menu → View Logs**

## Data Directories

| Directory | Contents |
|-----------|----------|
| `%LOCALAPPDATA%\Cloud POS\config\` | Settings, printer config, enrollment |
| `%LOCALAPPDATA%\Cloud POS\data\` | SQLite database, offline queue, print queue |
| `%LOCALAPPDATA%\Cloud POS\logs\` | Log files (auto-rotated at 5MB, keeps 5 files) |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `better-sqlite3` build fails | Install Visual Studio Build Tools, run `npm rebuild better-sqlite3` |
| Version mismatch on startup | Ensure all 3 version files are in sync (build-info, builder, embedded.cjs) |
| Schema migration fails | Check CAPS logs for `[DB] Running vXX migration` — look for SQL errors |
| Installer won't sign | Code signing certificate must be in Windows Certificate Store |
| Large installer size | Normal — includes Chromium runtime (~80-120 MB) |
