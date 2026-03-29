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
