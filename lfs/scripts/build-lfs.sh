#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/lfs/dist"
PACKAGE_NAME="cloud-pos-lfs"
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
TARGET_PLATFORM="${1:-linux}"
NODE_VERSION="20.11.1"

echo "=========================================="
echo " Cloud POS - Local Failover Server Builder"
echo " Version: $VERSION"
echo " Platform: $TARGET_PLATFORM"
echo "=========================================="

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/$PACKAGE_NAME"

echo "[1/10] Building server bundle..."
cd "$PROJECT_ROOT"
npx esbuild server/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --format=cjs \
  --outfile="$BUILD_DIR/$PACKAGE_NAME/server.cjs" \
  --external:pg-native \
  --external:bufferutil \
  --external:utf-8-validate \
  --define:process.env.NODE_ENV=\"production\" \
  --minify

echo "[2/10] Building frontend assets..."
npx vite build --outDir "$BUILD_DIR/$PACKAGE_NAME/public"

if [ ! -f "$BUILD_DIR/$PACKAGE_NAME/public/index.html" ]; then
  echo "ERROR: Frontend build failed — public/index.html not found"
  exit 1
fi
FRONTEND_FILES=$(ls -1 "$BUILD_DIR/$PACKAGE_NAME/public/assets/"*.js 2>/dev/null | wc -l)
if [ "$FRONTEND_FILES" -eq 0 ]; then
  echo "ERROR: Frontend build produced no JS bundles"
  exit 1
fi
echo "  Frontend build OK: index.html + $FRONTEND_FILES JS bundle(s)"

echo "[3/10] Copying LFS admin dashboard..."
cp -r "$PROJECT_ROOT/lfs/admin" "$BUILD_DIR/$PACKAGE_NAME/lfs-admin"

echo "[4/10] Copying runtime dependencies..."
mkdir -p "$BUILD_DIR/$PACKAGE_NAME/node_modules"

copy_dep_tree() {
  local dep="$1"
  local src="$PROJECT_ROOT/node_modules/$dep"
  local dest="$BUILD_DIR/$PACKAGE_NAME/node_modules/$dep"
  if [ -d "$src" ] && [ ! -d "$dest" ]; then
    cp -r "$src" "$dest"
    if [ -f "$src/package.json" ]; then
      local subdeps=$(node -e "
        try {
          const pkg = require('$src/package.json');
          const deps = Object.keys(pkg.dependencies || {});
          console.log(deps.join(' '));
        } catch { }
      " 2>/dev/null)
      for subdep in $subdeps; do
        copy_dep_tree "$subdep"
      done
    fi
  fi
}

RUNTIME_DEPS="pg pg-pool pg-protocol pg-types pgpass buffer-writer packet-reader pg-int8 pg-numeric postgres-array postgres-bytea postgres-date postgres-interval postgres-range split2 obuf pg-copy-streams"
for dep in $RUNTIME_DEPS; do
  copy_dep_tree "$dep"
done

echo "  Bundled $(ls -1 "$BUILD_DIR/$PACKAGE_NAME/node_modules" | wc -l) runtime packages"

echo "[5/10] Downloading Node.js runtime for $TARGET_PLATFORM..."
NODE_DIR="$BUILD_DIR/$PACKAGE_NAME/runtime"
mkdir -p "$NODE_DIR"

case "$TARGET_PLATFORM" in
  "windows"|"win"|"win64")
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
    NODE_ARCHIVE="$BUILD_DIR/node.zip"
    curl -sL "$NODE_URL" -o "$NODE_ARCHIVE"
    unzip -q "$NODE_ARCHIVE" -d "$BUILD_DIR/node-tmp"
    mv "$BUILD_DIR/node-tmp/node-v${NODE_VERSION}-win-x64"/* "$NODE_DIR/"
    rm -rf "$BUILD_DIR/node-tmp" "$NODE_ARCHIVE"
    NODE_BIN="runtime/node.exe"
    ;;
  "linux"|"linux64")
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
    NODE_ARCHIVE="$BUILD_DIR/node.tar.xz"
    curl -sL "$NODE_URL" -o "$NODE_ARCHIVE"
    tar -xf "$NODE_ARCHIVE" -C "$BUILD_DIR/node-tmp" --strip-components=1 2>/dev/null || {
      mkdir -p "$BUILD_DIR/node-tmp"
      tar -xf "$NODE_ARCHIVE" -C "$BUILD_DIR/node-tmp"
      mv "$BUILD_DIR/node-tmp/node-v${NODE_VERSION}-linux-x64"/* "$BUILD_DIR/node-tmp/" 2>/dev/null || true
    }
    cp "$BUILD_DIR/node-tmp/bin/node" "$NODE_DIR/node" 2>/dev/null || cp "$BUILD_DIR/node-tmp/node" "$NODE_DIR/node" 2>/dev/null || true
    chmod +x "$NODE_DIR/node" 2>/dev/null || true
    rm -rf "$BUILD_DIR/node-tmp" "$NODE_ARCHIVE"
    NODE_BIN="runtime/node"
    ;;
  "arm"|"linux-arm64"|"rpi")
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz"
    NODE_ARCHIVE="$BUILD_DIR/node.tar.xz"
    curl -sL "$NODE_URL" -o "$NODE_ARCHIVE"
    mkdir -p "$BUILD_DIR/node-tmp"
    tar -xf "$NODE_ARCHIVE" -C "$BUILD_DIR/node-tmp" --strip-components=1
    cp "$BUILD_DIR/node-tmp/bin/node" "$NODE_DIR/node"
    chmod +x "$NODE_DIR/node"
    rm -rf "$BUILD_DIR/node-tmp" "$NODE_ARCHIVE"
    NODE_BIN="runtime/node"
    ;;
  *)
    echo "WARNING: Unknown platform '$TARGET_PLATFORM'. Skipping Node.js bundling."
    echo "The system Node.js will be used instead."
    NODE_BIN="node"
    ;;
esac

echo "[6/10] Creating startup scripts..."

cat > "$BUILD_DIR/$PACKAGE_NAME/start-lfs.sh" << STARTUP_SH
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="\$SCRIPT_DIR/logs"

mkdir -p "\$LOG_DIR"

export DB_MODE=local
export NODE_ENV=production
export PORT=\${PORT:-3001}

if [ -f "\$SCRIPT_DIR/.env" ]; then
  set -a
  source "\$SCRIPT_DIR/.env"
  set +a
fi

if [ -z "\${LFS_DATABASE_URL:-}" ]; then
  echo "ERROR: LFS_DATABASE_URL is not set."
  echo "Please configure the .env file with your PostgreSQL connection string."
  echo "Example: LFS_DATABASE_URL=postgresql://lfs_user:password@localhost:5432/cloud_pos_lfs"
  exit 1
fi

echo "Checking PostgreSQL connection..."
NODE_CMD="\$SCRIPT_DIR/$NODE_BIN"
if [ ! -x "\$NODE_CMD" ]; then
  NODE_CMD="node"
fi

PG_CHECK=\$("\$NODE_CMD" -e "
  const url = process.env.LFS_DATABASE_URL;
  const { Pool } = require('./node_modules/pg');
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  pool.query('SELECT 1').then(() => { console.log('OK'); pool.end(); }).catch(e => { console.log('FAIL: ' + e.message); pool.end(); process.exit(1); });
" 2>&1) || true

if [[ "\$PG_CHECK" == FAIL* ]]; then
  echo "ERROR: Cannot connect to PostgreSQL."
  echo "  \$PG_CHECK"
  echo ""
  echo "  Verify PostgreSQL is running and LFS_DATABASE_URL is correct."
  exit 1
fi
echo "  PostgreSQL connection OK"

echo "Starting Cloud POS Local Failover Server..."
echo "  API Port: \$PORT"
echo "  Admin: http://localhost:\${LFS_ADMIN_PORT:-3002}"
echo "  Database: PostgreSQL (LFS_DATABASE_URL configured)"
echo "  Logs: \$LOG_DIR"

exec "\$NODE_CMD" "\$SCRIPT_DIR/server.cjs" 2>&1 | tee -a "\$LOG_DIR/lfs-\$(date +%Y%m%d).log"
STARTUP_SH
chmod +x "$BUILD_DIR/$PACKAGE_NAME/start-lfs.sh"

cat > "$BUILD_DIR/$PACKAGE_NAME/start-lfs.bat" << 'STARTUP_BAT'
@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "LOG_DIR=%SCRIPT_DIR%logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set DB_MODE=local
set NODE_ENV=production
if not defined PORT set PORT=3001

if exist "%SCRIPT_DIR%.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("%SCRIPT_DIR%.env") do (
    set "%%a=%%b"
  )
)

if not defined LFS_DATABASE_URL (
  echo ERROR: LFS_DATABASE_URL is not set.
  echo Please configure the .env file with your PostgreSQL connection string.
  echo Example: LFS_DATABASE_URL=postgresql://lfs_user:password@localhost:5432/cloud_pos_lfs
  pause
  exit /b 1
)

set "NODE_CMD=%SCRIPT_DIR%runtime\node.exe"
if not exist "%NODE_CMD%" set "NODE_CMD=node"

echo Checking PostgreSQL connection...
"%NODE_CMD%" -e "const{Pool}=require('./node_modules/pg');const p=new Pool({connectionString:process.env.LFS_DATABASE_URL,connectionTimeoutMillis:5000});p.query('SELECT 1').then(()=>{console.log('OK');p.end()}).catch(e=>{console.log('FAIL: '+e.message);p.end();process.exit(1)})" 2>nul
if errorlevel 1 (
  echo ERROR: Cannot connect to PostgreSQL.
  echo Verify PostgreSQL is running and LFS_DATABASE_URL is correct in .env
  pause
  exit /b 1
)
echo   PostgreSQL connection OK

echo Starting Cloud POS Local Failover Server...
echo   API Port: %PORT%
echo   Admin: http://localhost:3002
echo   Database: PostgreSQL
echo   Logs: %LOG_DIR%

set "LOG_FILE=%LOG_DIR%\lfs.log"
echo [%date% %time%] === LFS Starting === >> "%LOG_FILE%"

powershell -NoProfile -Command "& '%NODE_CMD%' '%SCRIPT_DIR%server.cjs' 2>&1 | ForEach-Object { $line = \"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $_\"; Write-Host $_; Add-Content -Path '%LOG_FILE%' -Value $line }"
STARTUP_BAT

echo "[7/10] Copying installer and utility scripts..."
SCRIPTS_DIR="$BUILD_DIR/$PACKAGE_NAME/scripts"
mkdir -p "$SCRIPTS_DIR"

for script in install-lfs.ps1 install-windows-service.ps1 uninstall-windows-service.ps1 lfs-tray.ps1; do
  if [ -f "$PROJECT_ROOT/lfs/scripts/$script" ]; then
    cp "$PROJECT_ROOT/lfs/scripts/$script" "$SCRIPTS_DIR/"
    echo "  Copied $script"
  fi
done

if [ -d "$PROJECT_ROOT/lfs/docs" ]; then
  cp -r "$PROJECT_ROOT/lfs/docs" "$BUILD_DIR/$PACKAGE_NAME/docs"
  echo "  Copied documentation"
fi

cp "$PROJECT_ROOT/package.json" "$BUILD_DIR/$PACKAGE_NAME/package.json"

echo "[8/10] Bundling PostgreSQL installer..."
PG_INSTALLER="$PROJECT_ROOT/lfs/installers/postgresql-17.9-2-windows-x64.exe"
if [ "$TARGET_PLATFORM" = "windows" ] || [ "$TARGET_PLATFORM" = "win" ] || [ "$TARGET_PLATFORM" = "win64" ]; then
  INSTALLERS_DIR="$BUILD_DIR/$PACKAGE_NAME/installers"
  mkdir -p "$INSTALLERS_DIR"
  if [ -f "$PG_INSTALLER" ]; then
    cp "$PG_INSTALLER" "$INSTALLERS_DIR/"
    PG_SIZE=$(du -sh "$PG_INSTALLER" | cut -f1)
    echo "  Bundled PostgreSQL installer ($PG_SIZE)"
  else
    echo "  WARNING: PostgreSQL installer not found at $PG_INSTALLER"
    echo "  The Windows one-click installer will skip automatic PostgreSQL setup."
    echo "  To include it, place postgresql-17.9-2-windows-x64.exe in lfs/installers/"
  fi
else
  echo "  Skipping PostgreSQL installer bundling (not a Windows build)"
fi

echo "[9/10] Creating environment template..."
cat > "$BUILD_DIR/$PACKAGE_NAME/.env.example" << 'ENV_TEMPLATE'
# Cloud POS - Local Failover Server Configuration
# Copy this file to .env and fill in values

# Cloud connection
LFS_CLOUD_URL=https://your-cloud-pos.example.com
LFS_API_KEY=your-api-key-here
LFS_PROPERTY_ID=your-property-id

# Server ports
PORT=3001
LFS_ADMIN_PORT=3002

# Database (PostgreSQL)
DB_MODE=local
LFS_DATABASE_URL=postgresql://lfs_user:your-password@localhost:5432/cloud_pos_lfs

# Sync interval (milliseconds, default 60000 = 1 minute)
LFS_SYNC_INTERVAL_MS=60000

# Auto-update (set to false to disable)
LFS_AUTO_UPDATE=true
LFS_UPDATE_CHECK_INTERVAL_MS=3600000

# Logging
LFS_LOG_LEVEL=info
ENV_TEMPLATE

echo "[10/10] Creating distribution archive..."
cd "$BUILD_DIR"

if [ "$TARGET_PLATFORM" = "windows" ] || [ "$TARGET_PLATFORM" = "win" ] || [ "$TARGET_PLATFORM" = "win64" ]; then
  if command -v zip &>/dev/null; then
    zip -rq "${PACKAGE_NAME}-${VERSION}-${TARGET_PLATFORM}.zip" "$PACKAGE_NAME"
    ARCHIVE="${PACKAGE_NAME}-${VERSION}-${TARGET_PLATFORM}.zip"
  else
    tar -czf "${PACKAGE_NAME}-${VERSION}-${TARGET_PLATFORM}.tar.gz" "$PACKAGE_NAME"
    ARCHIVE="${PACKAGE_NAME}-${VERSION}-${TARGET_PLATFORM}.tar.gz"
  fi
else
  tar -czf "${PACKAGE_NAME}-${VERSION}-${TARGET_PLATFORM}.tar.gz" "$PACKAGE_NAME"
  ARCHIVE="${PACKAGE_NAME}-${VERSION}-${TARGET_PLATFORM}.tar.gz"
fi

ARCHIVE_SIZE=$(du -sh "$ARCHIVE" | cut -f1)
echo ""
echo "=========================================="
echo " Build complete!"
echo " Output: lfs/dist/$ARCHIVE"
echo " Size: $ARCHIVE_SIZE"
echo " Node.js: $NODE_VERSION (bundled)"
echo " Database: PostgreSQL (pg client bundled)"
echo "=========================================="
echo ""
echo "To deploy:"
echo "  1. Extract the archive on target machine"
echo "  2. Run: scripts/install-lfs.ps1 (Windows) for one-click setup"
echo "  3. Or manually: copy .env.example to .env, configure, run start-lfs.sh"
echo "  4. Access admin at: http://localhost:3002"
