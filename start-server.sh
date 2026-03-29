#!/bin/bash

# Start ArchTrack Admin Server
cd /Users/mohlt/.openclaw/workspace/arch-firm-dashboard/admin

# Check if already running
if pgrep -f "tsx watch server/index.ts" > /dev/null; then
    echo "ArchTrack server is already running"
    exit 0
fi

# Start the server
npm run dev:server > /Users/mohlt/.openclaw/workspace/arch-firm-dashboard/logs/server.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > /Users/mohlt/.openclaw/workspace/arch-firm-dashboard/.server.pid

echo "ArchTrack server started with PID $SERVER_PID"
echo "Dashboard: http://localhost:3001"
echo "Logs: tail -f /Users/mohlt/.openclaw/workspace/arch-firm-dashboard/logs/server.log"
