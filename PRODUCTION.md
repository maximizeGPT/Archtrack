# ArchTrack Production Setup

This guide covers running ArchTrack reliably in production.

## Quick Start

```bash
# Start the server
./start-production.sh

# Check status
./status.sh

# Stop the server
./stop-production.sh

# Create backup
./backup.sh
```

## What's Included

### Scripts
- `start-production.sh` - Start server with health checks
- `stop-production.sh` - Stop server gracefully
- `status.sh` - Check server status and stats
- `health-check.sh` - Automated health monitoring
- `backup.sh` - Create database backup

### Features
- ✅ Auto-restart on crash (cron job every 5 min)
- ✅ Health monitoring
- ✅ Automatic backups
- ✅ Log rotation
- ✅ Process management

## Remote Access Options

### Option 1: Cloud Deployment (Recommended for Uncle)
Deploy to Render, Railway, or Fly.io for easy remote access.
See `deploy-cloud.sh` for automated deployment.

### Option 2: Tailscale (Private Network)
Install Tailscale on office computer and uncle's home computer
for secure private access without cloud hosting.

### Option 3: Ngrok (Quick Testing)
Use ngrok for temporary public URL:
```bash
ngrok http 3001
```

## Monitoring

### Logs
```bash
# Server logs
tail -f logs/server.log

# Health check logs
tail -f logs/health.log

# Setup logs
tail -f logs/setup.log
```

### Health Checks
The system automatically checks health every 5 minutes via cron.
If the server is down, it will auto-restart.

### Manual Health Check
```bash
./health-check.sh
```

## Backup & Restore

### Create Backup
```bash
./backup.sh
```

### Restore Backup
```bash
cd /Users/mohlt/.openclaw/workspace/arch-firm-dashboard
tar -xzf backups/archtrack-backup-YYYYMMDD_HHMMSS.tar.gz
```

## Troubleshooting

### Server won't start
```bash
# Check logs
tail -f logs/server.log

# Check for port conflicts
lsof -i :3001

# Kill existing processes
pkill -f "tsx watch server/index.ts"
```

### Database issues
```bash
# Check database
sqlite3 data/admin.db ".tables"

# Repair (backup first!)
cp data/admin.db data/admin.db.backup
sqlite3 data/admin.db ".recover" | sqlite3 data/admin.db.fixed
mv data/admin.db.fixed data/admin.db
```

### Reset everything
```bash
./stop-production.sh
rm -rf data/admin.db
./start-production.sh
```

## Security

1. Change default admin password in `.env`
2. Use HTTPS in production (cloud deployments include this)
3. Keep backups secure
4. Regularly update dependencies

## Support

For issues, check:
1. `logs/server.log` - Server errors
2. `logs/health.log` - Health check history
3. `logs/setup.log` - Setup history
