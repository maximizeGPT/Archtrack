#!/bin/bash
# ArchTrack Quick Start
# Run this after installing to start the dashboard

echo "🚀 Starting ArchTrack..."
echo ""

cd "$(dirname "$0")/admin"

# Check if already running
if lsof -ti:3001 > /dev/null 2>&1; then
    echo "⚠️  ArchTrack is already running on http://localhost:3001"
    echo "   To restart, run: ./stop-archtrack.sh first"
    exit 0
fi

# Start the server
echo "📊 Starting dashboard on http://localhost:3001..."
npm start &

echo ""
echo "✅ ArchTrack is starting up!"
echo ""
echo "🌐 Open http://localhost:3001 in your browser"
echo ""
echo "To stop: ./stop-archtrack.sh"
