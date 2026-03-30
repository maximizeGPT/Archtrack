#!/bin/bash
# ArchTrack Stop
# Stops the running ArchTrack server

echo "🛑 Stopping ArchTrack..."

# Find and kill the server process
PID=$(lsof -ti:3001 2>/dev/null)
if [ ! -z "$PID" ]; then
    kill $PID 2>/dev/null
    echo "✅ Server stopped"
else
    echo "ℹ️  Server was not running"
fi
