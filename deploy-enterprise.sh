#!/bin/bash
# ArchTrack Enterprise Deploy Script
# One-command deployment that handles the nested directory issue

set -e  # Exit on any error

echo "🏢 ArchTrack Enterprise Deployment"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Find the correct directory
if [ -d "/opt/archtrack/arch-firm-dashboard" ]; then
    APP_DIR="/opt/archtrack/arch-firm-dashboard"
    echo -e "${GREEN}✓${NC} Found app at: $APP_DIR"
elif [ -d "/opt/archtrack" ]; then
    APP_DIR="/opt/archtrack"
    echo -e "${GREEN}✓${NC} Found app at: $APP_DIR"
else
    echo -e "${RED}✗${NC} Cannot find ArchTrack directory"
    exit 1
fi

cd "$APP_DIR"

echo ""
echo "📥 Pulling latest code..."
git pull origin main

echo ""
echo "🔨 Building application..."
cd "$APP_DIR/admin"
npm run build

echo ""
echo "🔄 Restarting server..."
pm2 restart archtrack || pm2 start dist/server/index.js --name archtrack

echo ""
echo "⏳ Waiting for server to start..."
sleep 3

echo ""
echo "📊 Checking server status..."
pm2 show archtrack | grep -E "status|uptime" || true

echo ""
echo "🧪 Testing health endpoint..."
curl -s --max-time 5 http://localhost:3001/api/health || echo -e "${YELLOW}!${NC} Health check failed (server may still be starting)"

echo ""
echo "📋 Recent logs:"
pm2 logs archtrack --lines 20

echo ""
echo "=================================="
echo -e "${GREEN}✓ Deployment complete${NC}"
echo "Dashboard: http://165.227.78.107"
echo "=================================="
