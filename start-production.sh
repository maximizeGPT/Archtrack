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
