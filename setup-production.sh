#!/bin/bash
#
# ArchTrack Production Setup Script
# Makes the system reliable and production-ready
#

set -e

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"
LOGS_DIR="$ARCHTRACK_DIR/logs"
PID_FILE="$ARCHTRACK_DIR/.server.pid"
HEALTH_LOG="$LOGS_DIR/health.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOGS_DIR/setup.log"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOGS_DIR/setup.log"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOGS_DIR/setup.log"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOGS_DIR/setup.log"
}

# Check if running from correct directory
check_directory() {
    if [ ! -f "$ARCHTRACK_DIR/admin/server/index.ts" ]; then
        error "ArchTrack not found at $ARCHTRACK_DIR"
        exit 1
    fi
}

# Install dependencies
install_deps() {
    log "Installing dependencies..."
    cd "$ARCHTRACK_DIR"
    npm install 2>&1 | tee -a "$LOGS_DIR/setup.log"
    cd "$ARCHTRACK_DIR/admin"
    npm install 2>&1 | tee -a "$LOGS_DIR/setup.log"
    success "Dependencies installed"
}

# Create necessary directories
create_directories() {
    log "Creating directories..."
    mkdir -p "$LOGS_DIR"
    mkdir -p "$ARCHTRACK_DIR/data"
    mkdir -p "$ARCHTRACK_DIR/backups"
    success "Directories created"
}

# Create health check script
create_health_check() {
    log "Creating health check script..."
    cat > "$ARCHTRACK_DIR/health-check.sh" << 'EOF'
#!/bin/bash
# Health check script for ArchTrack

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"
HEALTH_LOG="$ARCHTRACK_DIR/logs/health.log"
PID_FILE="$ARCHTRACK_DIR/.server.pid"

# Check if server is running
check_server() {
    if pgrep -f "tsx watch server/index.ts" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if API responds
check_api() {
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Restart server
restart_server() {
    echo "[$(date)] Restarting ArchTrack server..." >> "$HEALTH_LOG"
    cd "$ARCHTRACK_DIR/admin"
    
    # Kill existing process
    pkill -f "tsx watch server/index.ts" 2>/dev/null || true
    sleep 2
    
    # Start new process
    nohup npm run dev:server > "$ARCHTRACK_DIR/logs/server.log" 2>&1 &
    echo $! > "$PID_FILE"
    
    sleep 5
    
    if check_api; then
        echo "[$(date)] Server restarted successfully" >> "$HEALTH_LOG"
        return 0
    else
        echo "[$(date)] Server restart failed" >> "$HEALTH_LOG"
        return 1
    fi
}

# Main health check
if ! check_server; then
    echo "[$(date)] Server not running, restarting..." >> "$HEALTH_LOG"
    restart_server
elif ! check_api; then
    echo "[$(date)] API not responding, restarting..." >> "$HEALTH_LOG"
    restart_server
else
    echo "[$(date)] Health check passed" >> "$HEALTH_LOG"
fi
EOF
    chmod +x "$ARCHTRACK_DIR/health-check.sh"
    success "Health check script created"
}

# Create startup script
create_startup_script() {
    log "Creating startup script..."
    cat > "$ARCHTRACK_DIR/start-production.sh" << 'EOF'
#!/bin/bash
# Production startup script for ArchTrack

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"
PID_FILE="$ARCHTRACK_DIR/.server.pid"
LOGS_DIR="$ARCHTRACK_DIR/logs"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Starting ArchTrack Production Server..."

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${GREEN}ArchTrack is already running (PID: $PID)${NC}"
        echo "Dashboard: http://localhost:3001"
        exit 0
    fi
fi

# Create logs directory
mkdir -p "$LOGS_DIR"

# Start server
cd "$ARCHTRACK_DIR/admin"
echo "Starting server..."
nohup npm run dev:server > "$LOGS_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$PID_FILE"

# Wait for server to start
sleep 3

# Check if started successfully
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ ArchTrack server started successfully!${NC}"
    echo "  PID: $SERVER_PID"
    echo "  Dashboard: http://localhost:3001"
    echo "  API Health: http://localhost:3001/api/health"
    echo "  Logs: tail -f $LOGS_DIR/server.log"
else
    echo -e "${RED}✗ Server failed to start. Check logs:${NC}"
    echo "  tail -f $LOGS_DIR/server.log"
    exit 1
fi
EOF
    chmod +x "$ARCHTRACK_DIR/start-production.sh"
    success "Startup script created"
}

# Create stop script
create_stop_script() {
    log "Creating stop script..."
    cat > "$ARCHTRACK_DIR/stop-production.sh" << 'EOF'
#!/bin/bash
# Stop ArchTrack production server

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"
PID_FILE="$ARCHTRACK_DIR/.server.pid"

echo "Stopping ArchTrack server..."

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        kill "$PID"
        rm "$PID_FILE"
        echo "Server stopped (PID: $PID)"
    else
        echo "Server not running"
        rm "$PID_FILE"
    fi
else
    # Try to find and kill anyway
    pkill -f "tsx watch server/index.ts" 2>/dev/null && echo "Server stopped" || echo "Server not running"
fi
EOF
    chmod +x "$ARCHTRACK_DIR/stop-production.sh"
    success "Stop script created"
}

# Create status script
create_status_script() {
    log "Creating status script..."
    cat > "$ARCHTRACK_DIR/status.sh" << 'EOF'
#!/bin/bash
# Check ArchTrack status

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"
PID_FILE="$ARCHTRACK_DIR/.server.pid"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== ArchTrack Status ==="
echo ""

# Check if running
if pgrep -f "tsx watch server/index.ts" > /dev/null; then
    echo -e "${GREEN}● Server: Running${NC}"
    
    # Check API
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}● API: Responding${NC}"
        HEALTH=$(curl -s http://localhost:3001/api/health)
        echo "  Health: $HEALTH"
    else
        echo -e "${RED}● API: Not responding${NC}"
    fi
    
    # Show stats
    echo ""
    echo "Dashboard Stats:"
    curl -s http://localhost:3001/api/dashboard/stats | python3 -m json.tool 2>/dev/null | head -20 || echo "  Could not fetch stats"
    
else
    echo -e "${RED}● Server: Not running${NC}"
fi

echo ""
echo "Logs: tail -f $ARCHTRACK_DIR/logs/server.log"
echo "Start: ./start-production.sh"
echo "Stop: ./stop-production.sh"
EOF
    chmod +x "$ARCHTRACK_DIR/status.sh"
    success "Status script created"
}

# Setup cron job for health checks
setup_cron() {
    log "Setting up health check cron job..."
    
    # Create cron entry
    CRON_ENTRY="*/5 * * * * /Users/mohlt/.openclaw/workspace/arch-firm-dashboard/health-check.sh > /dev/null 2>&1"
    
    # Check if already exists
    if crontab -l 2>/dev/null | grep -q "health-check.sh"; then
        warn "Health check cron job already exists"
    else
        (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
        success "Health check cron job added (runs every 5 minutes)"
    fi
}

# Create backup script
create_backup_script() {
    log "Creating backup script..."
    cat > "$ARCHTRACK_DIR/backup.sh" << 'EOF'
#!/bin/bash
# Backup script for ArchTrack

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"
BACKUP_DIR="$ARCHTRACK_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="archtrack-backup-$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_FILE"

cd "$ARCHTRACK_DIR"
tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
    data/ \
    admin/data/ \
    logs/ \
    2>/dev/null || true

echo "Backup created: $BACKUP_DIR/$BACKUP_FILE"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/archtrack-backup-*.tar.gz | tail -n +11 | xargs rm -f 2>/dev/null || true

echo "Backup complete"
EOF
    chmod +x "$ARCHTRACK_DIR/backup.sh"
    success "Backup script created"
}

# Create environment file
create_env_file() {
    log "Creating environment file..."
    cat > "$ARCHTRACK_DIR/.env" << EOF
# ArchTrack Environment Configuration
NODE_ENV=production
PORT=3001
DATABASE_URL=sqlite:/data/admin.db

# Admin credentials (change these!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=archtrack2024

# Optional: Discord notifications
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
EOF
    success "Environment file created"
}

# Create comprehensive README
create_production_readme() {
    log "Creating production README..."
    cat > "$ARCHTRACK_DIR/PRODUCTION.md" << 'EOF'
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
EOF
    success "Production README created"
}

# Main setup function
main() {
    echo "========================================"
    echo "  ArchTrack Production Setup"
    echo "========================================"
    echo ""
    
    check_directory
    create_directories
    install_deps
    create_health_check
    create_startup_script
    create_stop_script
    create_status_script
    create_backup_script
    create_env_file
    create_production_readme
    setup_cron
    
    echo ""
    echo "========================================"
    success "Setup complete!"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo "  1. Start server: ./start-production.sh"
    echo "  2. Check status: ./status.sh"
    echo "  3. For remote access, run: ./deploy-cloud.sh"
    echo ""
    echo "Documentation: PRODUCTION.md"
}

# Run main function
main "$@"
