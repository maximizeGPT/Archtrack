#!/bin/bash

# ArchTrack Startup Script
# Usage: ./start-archtrack.sh [admin|desktop|both]

set -e

MODE=${1:-both}
ARCH_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"

echo "🚀 ArchTrack Startup"
echo "===================="
echo ""

# Function to check if port is in use
check_port() {
    lsof -i :$1 2>/dev/null | grep LISTEN > /dev/null && echo "in-use" || echo "free"
}

# Function to kill process on port
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo "  Stopping process on port $port (PID: $pid)..."
        kill $pid 2>/dev/null || true
        sleep 2
    fi
}

start_admin() {
    echo "📊 Starting Admin Dashboard..."
    
    # Check if port 3001 is in use
    if [ "$(check_port 3001)" = "in-use" ]; then
        echo "  Port 3001 is in use. Restarting..."
        kill_port 3001
    fi
    
    cd "$ARCH_DIR/admin"
    
    # Start server in background
    echo "  Starting server on http://localhost:3001..."
    npm run dev:server > "$ARCH_DIR/logs/server.log" 2>&1 &
    SERVER_PID=$!
    echo $SERVER_PID > "$ARCH_DIR/.server.pid"
    
    # Wait for server to be ready
    for i in {1..30}; do
        if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
            echo "  ✓ Server is ready!"
            break
        fi
        sleep 1
    done
    
    echo ""
    echo "  Admin Dashboard URLs:"
    echo "    - API: http://localhost:3001"
    echo "    - WebSocket: ws://localhost:3001/ws"
    echo ""
}

start_desktop() {
    echo "🖥️  Starting Desktop Tracker..."
    
    # Check if Electron is already running
    if pgrep -f "Electron.*arch-firm-dashboard" > /dev/null; then
        echo "  Desktop tracker is already running."
        return
    fi
    
    cd "$ARCH_DIR/desktop"
    
    # Build if needed
    if [ ! -d "$ARCH_DIR/desktop/dist" ]; then
        echo "  Building desktop app..."
        npm run build
    fi
    
    # Start Electron
    echo "  Starting Electron tracker..."
    npm run electron > "$ARCH_DIR/logs/desktop.log" 2>&1 &
    DESKTOP_PID=$!
    echo $DESKTOP_PID > "$ARCH_DIR/.desktop.pid"
    
    echo "  ✓ Desktop tracker started!"
    echo ""
}

# Create logs directory
mkdir -p "$ARCH_DIR/logs"

# Start based on mode
case "$MODE" in
    admin)
        start_admin
        ;;
    desktop)
        start_desktop
        ;;
    both)
        start_admin
        start_desktop
        ;;
    *)
        echo "Usage: $0 [admin|desktop|both]"
        exit 1
        ;;
esac

echo ""
echo "✅ ArchTrack is running!"
echo ""
echo "Logs:"
echo "  Server:  $ARCH_DIR/logs/server.log"
echo "  Desktop: $ARCH_DIR/logs/desktop.log"
echo ""
echo "To stop: ./stop-archtrack.sh"
