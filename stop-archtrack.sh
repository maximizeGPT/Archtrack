#!/bin/bash

# ArchTrack Stop Script
# Usage: ./stop-archtrack.sh [admin|desktop|both]

set -e

MODE=${1:-both}
ARCH_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"

echo "🛑 Stopping ArchTrack..."
echo "======================="
echo ""

stop_admin() {
    echo "📊 Stopping Admin Dashboard..."
    
    # Kill by PID file
    if [ -f "$ARCH_DIR/.server.pid" ]; then
        PID=$(cat "$ARCH_DIR/.server.pid")
        if kill $PID 2>/dev/null; then
            echo "  ✓ Server stopped (PID: $PID)"
        fi
        rm -f "$ARCH_DIR/.server.pid"
    fi
    
    # Kill any process on port 3001
    local pid=$(lsof -ti :3001 2>/dev/null)
    if [ ! -z "$pid" ]; then
        kill $pid 2>/dev/null || true
        echo "  ✓ Killed process on port 3001"
    fi
    
    echo ""
}

stop_desktop() {
    echo "🖥️  Stopping Desktop Tracker..."
    
    # Kill by PID file
    if [ -f "$ARCH_DIR/.desktop.pid" ]; then
        PID=$(cat "$ARCH_DIR/.desktop.pid")
        if kill $PID 2>/dev/null; then
            echo "  ✓ Desktop stopped (PID: $PID)"
        fi
        rm -f "$ARCH_DIR/.desktop.pid"
    fi
    
    # Kill any Electron processes for arch-firm-dashboard
    local count=$(pgrep -f "Electron.*arch-firm-dashboard" | wc -l)
    if [ "$count" -gt 0 ]; then
        pkill -f "Electron.*arch-firm-dashboard"
        echo "  ✓ Killed $count Electron process(es)"
    fi
    
    echo ""
}

# Stop based on mode
case "$MODE" in
    admin)
        stop_admin
        ;;
    desktop)
        stop_desktop
        ;;
    both)
        stop_admin
        stop_desktop
        ;;
    *)
        echo "Usage: $0 [admin|desktop|both]"
        exit 1
        ;;
esac

echo "✅ ArchTrack stopped!"
