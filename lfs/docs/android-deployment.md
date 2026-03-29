# Cloud POS LFS — Android Deployment Guide

Run the Local Failover Server on Android using Termux to provide offline POS capability on the same WiFi network.

## Prerequisites

- Android 10+ device (tablet recommended, minimum 4GB RAM)
- Termux app (install from F-Droid, NOT Google Play)
- WiFi network shared with POS terminals
- Cloud POS URL and API key

## Installation

### 1. Install Termux

Download Termux from F-Droid (https://f-droid.org/en/packages/com.termux/).
The Google Play version is outdated and unsupported.

After installing, open Termux and run:
```bash
pkg update && pkg upgrade -y
```

### 2. Install Node.js and Dependencies

```bash
pkg install nodejs-lts -y
pkg install git -y
```

Verify installation:
```bash
node --version   # Should be 18+
npm --version
```

### 3. Install better-sqlite3

better-sqlite3 requires compilation on Android:
```bash
pkg install python make clang -y
npm install -g node-gyp
```

### 4. Set Up LFS

Create a working directory:
```bash
mkdir -p ~/cloud-pos-lfs
cd ~/cloud-pos-lfs
```

Extract the LFS distribution:
```bash
# Transfer the LFS package to the device (via USB, adb, or download)
# Then extract:
tar -xzf cloud-pos-lfs-*.tar.gz
cd cloud-pos-lfs
```

Rebuild native modules for Android:
```bash
cd node_modules/better-sqlite3
npm run build-release
cd ../..
```

### 5. Configure

Copy and edit the environment file:
```bash
cp .env.example .env
nano .env
```

Set the required values:
```
LFS_CLOUD_URL=https://your-cloud-pos.example.com
LFS_API_KEY=your-api-key
LFS_PROPERTY_ID=your-property-id
PORT=3001
LFS_ADMIN_PORT=3002
```

### 6. Start the Server

```bash
./start-lfs.sh
```

Or run directly:
```bash
export DB_MODE=local
export NODE_ENV=production
export SQLITE_PATH=./data/pos-local.db
export PORT=3001
node server.cjs
```

## Auto-Start on Boot

### Using Termux:Boot

1. Install Termux:Boot from F-Droid
2. Create the boot script:
```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-lfs.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd ~/cloud-pos-lfs/cloud-pos-lfs
./start-lfs.sh &
EOF
chmod +x ~/.termux/boot/start-lfs.sh
```

3. Open Termux:Boot once to register it with Android
4. Disable battery optimization for both Termux and Termux:Boot

### Keep Alive

To prevent Android from killing Termux:
```bash
# Acquire a wake lock
termux-wake-lock

# Run in the background
nohup ./start-lfs.sh > logs/lfs-output.log 2>&1 &
```

Also:
- Disable battery optimization for Termux in Android Settings
- Lock Termux in the recent apps tray (long-press → lock icon)

## Network Configuration

### Find Device IP

```bash
ifconfig wlan0 | grep "inet "
```

### Connect POS Terminals

On each POS terminal browser, set the LFS URL:
- Navigate to POS settings or use browser console:
```javascript
localStorage.setItem('lfs_local_server_url', 'http://ANDROID_IP:3001');
```

### Static IP (Recommended)

Set a static IP on the Android device:
1. Settings → WiFi → long-press your network → Modify
2. Show advanced options → IP settings: Static
3. Set IP address (e.g., 192.168.1.100)
4. Gateway: your router IP
5. DNS: 8.8.8.8

## Monitoring

Access the admin dashboard from any browser on the same network:
```
http://ANDROID_IP:3002
```

## Troubleshooting

### "Permission denied" on start script
```bash
chmod +x start-lfs.sh
```

### SQLite build errors
```bash
pkg install build-essential python -y
cd node_modules/better-sqlite3
node-gyp rebuild
```

### Port already in use
```bash
# Find and kill the process
lsof -i :3001
kill -9 <PID>
```

### Server keeps dying
- Check logs: `cat logs/lfs-*.log | tail -50`
- Ensure wake lock: `termux-wake-lock`
- Disable battery optimization
- Check available storage: `df -h`

### Cannot connect from POS terminals
- Verify both devices are on the same WiFi
- Check Android firewall/hotspot settings
- Try: `curl http://localhost:3001/api/health` from Termux
- Verify IP with: `ifconfig wlan0`

## Alternative: UserLAnd

For a more Linux-like experience:

1. Install UserLAnd from Google Play
2. Set up an Ubuntu distribution
3. Follow standard Linux installation steps
4. Note: Performance may be lower than direct Termux

## Performance Notes

- Typical Android tablet can handle 5-10 concurrent POS sessions
- SQLite database should stay under 500MB for optimal performance
- Sync interval of 60s is recommended; increase to 120s on older devices
- Monitor memory usage; restart if app becomes sluggish
