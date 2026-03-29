#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/lfs/dist"
PACKAGE_NAME="cloud-pos-lfs"
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")

echo "=========================================="
echo " Cloud POS - Local Failover Server Builder"
echo " Version: $VERSION"
echo "=========================================="

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/$PACKAGE_NAME"

echo "[1/7] Building server bundle..."
cd "$PROJECT_ROOT"
npx esbuild server/index.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --format=cjs \
  --outfile="$BUILD_DIR/$PACKAGE_NAME/server.cjs" \
  --external:better-sqlite3 \
  --external:pg \
  --external:pg-native \
  --external:bufferutil \
  --external:utf-8-validate \
  --define:process.env.NODE_ENV=\"production\" \
  --minify

echo "[2/7] Building frontend assets..."
npx vite build --outDir "$BUILD_DIR/$PACKAGE_NAME/client"

echo "[3/7] Copying LFS admin dashboard..."
cp -r "$PROJECT_ROOT/lfs/admin" "$BUILD_DIR/$PACKAGE_NAME/lfs-admin"

echo "[4/7] Copying native dependencies..."
mkdir -p "$BUILD_DIR/$PACKAGE_NAME/node_modules"
NATIVE_DEPS="better-sqlite3"
for dep in $NATIVE_DEPS; do
  if [ -d "$PROJECT_ROOT/node_modules/$dep" ]; then
    cp -r "$PROJECT_ROOT/node_modules/$dep" "$BUILD_DIR/$PACKAGE_NAME/node_modules/"
  fi
done

if [ -d "$PROJECT_ROOT/node_modules/.package-lock.json" ]; then
  cp "$PROJECT_ROOT/node_modules/.package-lock.json" "$BUILD_DIR/$PACKAGE_NAME/node_modules/" 2>/dev/null || true
fi

echo "[5/7] Creating startup scripts..."

cat > "$BUILD_DIR/$PACKAGE_NAME/start-lfs.sh" << 'STARTUP_SH'
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$DATA_DIR" "$LOG_DIR"

export DB_MODE=local
export SQLITE_PATH="$DATA_DIR/pos-local.db"
export NODE_ENV=production
export PORT=${PORT:-3001}
export LFS_ADMIN_PORT=${LFS_ADMIN_PORT:-3002}

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

echo "Starting Cloud POS Local Failover Server..."
echo "  API Port: $PORT"
echo "  Admin Port: $LFS_ADMIN_PORT"
echo "  Data: $DATA_DIR"
echo "  Logs: $LOG_DIR"

exec node "$SCRIPT_DIR/server.cjs" 2>&1 | tee -a "$LOG_DIR/lfs-$(date +%Y%m%d).log"
STARTUP_SH
chmod +x "$BUILD_DIR/$PACKAGE_NAME/start-lfs.sh"

cat > "$BUILD_DIR/$PACKAGE_NAME/start-lfs.bat" << 'STARTUP_BAT'
@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "DATA_DIR=%SCRIPT_DIR%data"
set "LOG_DIR=%SCRIPT_DIR%logs"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set DB_MODE=local
set SQLITE_PATH=%DATA_DIR%\pos-local.db
set NODE_ENV=production
if not defined PORT set PORT=3001
if not defined LFS_ADMIN_PORT set LFS_ADMIN_PORT=3002

if exist "%SCRIPT_DIR%.env" (
  for /f "usebackq tokens=1,* delims==" %%a in ("%SCRIPT_DIR%.env") do (
    set "%%a=%%b"
  )
)

echo Starting Cloud POS Local Failover Server...
echo   API Port: %PORT%
echo   Admin Port: %LFS_ADMIN_PORT%
echo   Data: %DATA_DIR%
echo   Logs: %LOG_DIR%

node "%SCRIPT_DIR%server.cjs"
STARTUP_BAT

echo "[6/7] Creating environment template..."
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

# Database
DB_MODE=local
SQLITE_PATH=./data/pos-local.db

# Sync interval (milliseconds, default 60000 = 1 minute)
LFS_SYNC_INTERVAL_MS=60000

# Auto-update (set to false to disable)
LFS_AUTO_UPDATE=true
LFS_UPDATE_CHECK_INTERVAL_MS=3600000

# Logging
LFS_LOG_LEVEL=info
ENV_TEMPLATE

echo "[7/7] Creating distribution archive..."
cd "$BUILD_DIR"
tar -czf "${PACKAGE_NAME}-${VERSION}.tar.gz" "$PACKAGE_NAME"

ARCHIVE_SIZE=$(du -sh "${PACKAGE_NAME}-${VERSION}.tar.gz" | cut -f1)
echo ""
echo "=========================================="
echo " Build complete!"
echo " Output: lfs/dist/${PACKAGE_NAME}-${VERSION}.tar.gz"
echo " Size: $ARCHIVE_SIZE"
echo "=========================================="
echo ""
echo "To deploy:"
echo "  1. Extract: tar -xzf ${PACKAGE_NAME}-${VERSION}.tar.gz"
echo "  2. Copy .env.example to .env and configure"
echo "  3. Run: ./start-lfs.sh (Linux/Mac) or start-lfs.bat (Windows)"
