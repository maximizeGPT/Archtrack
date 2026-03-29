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
