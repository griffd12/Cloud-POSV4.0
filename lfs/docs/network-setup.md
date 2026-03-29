# Cloud POS LFS — Network Configuration Guide

Recommended LAN setup for deploying the Local Failover Server at a property location.

## Architecture Overview

```
                    ┌─────────────┐
                    │   Internet  │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │   Router    │
                    │ (Gateway)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌──────┴──────┐
        │  LFS Host  │ │  POS  │ │  KDS/Print  │
        │ 192.168.1.10│ │  WS   │ │  Devices    │
        │ :3001 API  │ │       │ │             │
        │ /lfs-admin │ │       │ │             │
        └───────────┘ └───────┘ └─────────────┘
```

## IP Address Planning

### Recommended Static IP Assignments

| Device              | IP Address      | Port(s)   | Notes                    |
|---------------------|-----------------|-----------|--------------------------|
| Router/Gateway      | 192.168.1.1     | —         | DHCP server              |
| LFS Server          | 192.168.1.10    | 3001      | Static IP required       |
| POS Workstation 1   | 192.168.1.101   | —         | DHCP or static           |
| POS Workstation 2   | 192.168.1.102   | —         | DHCP or static           |
| KDS Display 1       | 192.168.1.201   | —         | DHCP or static           |
| KDS Display 2       | 192.168.1.202   | —         | DHCP or static           |
| Receipt Printer 1   | 192.168.1.211   | 9100      | Static IP recommended    |
| Receipt Printer 2   | 192.168.1.212   | 9100      | Static IP recommended    |

### DHCP Configuration

Configure router DHCP:
- **Range**: 192.168.1.100 — 192.168.1.250 (for POS/KDS devices)
- **Reserved**: 192.168.1.2 — 192.168.1.99 (for infrastructure)
- **LFS**: DHCP reservation for 192.168.1.10 (bind to MAC address)
- **Lease time**: 24 hours minimum

## LFS Host Static IP Setup

### Windows

1. Control Panel → Network → Change adapter settings
2. Right-click Ethernet → Properties
3. Select "Internet Protocol Version 4" → Properties
4. Select "Use the following IP address":
   - IP: 192.168.1.10
   - Subnet mask: 255.255.255.0
   - Default gateway: 192.168.1.1
   - DNS: 8.8.8.8, 8.8.4.4

### Linux (NUC/Raspberry Pi)

Edit `/etc/netplan/01-network.yaml`:
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses: [192.168.1.10/24]
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```
Apply: `sudo netplan apply`

### Android

Settings → WiFi → network → Advanced → IP settings: Static
- IP: 192.168.1.10
- Gateway: 192.168.1.1
- Subnet: 255.255.255.0
- DNS1: 8.8.8.8

## Firewall Rules

### Required Ports

| Port | Protocol | Direction | Purpose                    |
|------|----------|-----------|----------------------------|
| 3001 | TCP      | Inbound   | LFS API + Admin (/lfs-admin) |
| 443  | TCP      | Outbound  | Cloud server connection    |
| 53   | TCP/UDP  | Outbound  | DNS resolution             |

### Windows Firewall

The installer script creates rules automatically. Manual setup:
```powershell
netsh advfirewall firewall add rule name="CloudPOS-LFS-API" dir=in action=allow protocol=TCP localport=3001
```

### Linux (iptables)

```bash
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### Linux (ufw)

```bash
sudo ufw allow 3001/tcp
```

## DNS / mDNS Configuration

### Option 1: Direct IP (Simplest)

Configure POS browsers with the LFS IP directly:
```javascript
localStorage.setItem('lfs_local_server_url', 'http://192.168.1.10:3001');
```

### Option 2: Local DNS Entry

Add to router DNS or local hosts file:
```
192.168.1.10  lfs.local
```

Then configure POS:
```javascript
localStorage.setItem('lfs_local_server_url', 'http://lfs.local:3001');
```

### Option 3: mDNS (Avahi/Bonjour)

Install Avahi (Linux):
```bash
sudo apt install avahi-daemon
```

The LFS will be discoverable as `lfs-hostname.local`.

## WiFi Considerations

### Dedicated Network (Recommended)

For production environments, use a dedicated WiFi network for POS:
- **SSID**: `POS-Internal` (hidden SSID recommended)
- **Security**: WPA2-Enterprise or WPA3
- **Channel**: Fixed channel (1, 6, or 11 on 2.4GHz)
- **Band**: 5GHz preferred for lower latency

### Band Steering

If using dual-band router:
- Force POS devices to 5GHz for lower latency
- Allow IoT devices (printers) on 2.4GHz for range

### Access Point Placement

- Position AP centrally among POS terminals
- Avoid metal obstacles and microwave ovens
- Signal strength should be -50 dBm or better at each terminal

## Redundancy

### Dual Ethernet (Recommended)

Configure the LFS host with two network interfaces:
- **eth0**: Internet (WAN) — connected to router for cloud sync
- **eth1**: POS LAN — dedicated connection to POS switch

### UPS (Uninterruptible Power Supply)

- Connect LFS host and network switch to UPS
- Minimum 30-minute battery runtime
- Configure automatic shutdown if battery < 10%

## Verification Checklist

After setup, verify:

- [ ] LFS host has static IP: `ping 192.168.1.10`
- [ ] LFS API responds: `curl http://192.168.1.10:3001/api/health`
- [ ] Admin dashboard loads: `http://192.168.1.10:3001/lfs-admin`
- [ ] Cloud sync working: Check admin dashboard sync status
- [ ] POS terminal connects: Open POS in browser, verify offline banner shows LFS URL
- [ ] Each POS workstation can reach LFS: Test from each terminal
- [ ] KDS displays receive orders: Send test order from POS
- [ ] Firewall rules active: Verify from external device on same network
- [ ] DNS/hostname resolves: `ping lfs.local` (if configured)

## Troubleshooting

### POS cannot reach LFS
1. Verify same subnet: both devices on 192.168.1.x/24
2. Ping LFS from POS: `ping 192.168.1.10`
3. Check firewall: temporarily disable to test
4. Verify port: `curl http://192.168.1.10:3001/api/health`

### LFS cannot reach cloud
1. Verify internet: `ping 8.8.8.8`
2. Check DNS: `nslookup your-cloud-pos.example.com`
3. Test cloud URL: `curl https://your-cloud-pos.example.com/api/health`
4. Check LFS_CLOUD_URL in .env

### Slow performance
1. Check WiFi signal strength on each device
2. Reduce sync interval if bandwidth is limited
3. Consider wired Ethernet for LFS host
4. Monitor SQLite database size (admin dashboard)
