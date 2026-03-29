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
