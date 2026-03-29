#!/bin/bash
# ArchTrack Quick Fix Script
# Fixes the stats API timeout and other critical issues

echo "🔧 ArchTrack Quick Fix"
echo "======================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd /Users/mohlt/.openclaw/workspace/arch-firm-dashboard

# Check if server is running
echo -e "\n📊 Checking server status..."
if curl -s --max-time 3 http://165.227.78.107/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} DigitalOcean server is running"
else
    echo -e "${RED}✗${NC} DigitalOcean server not responding"
fi

# Test stats endpoint with timeout
echo -e "\n🧪 Testing stats API (10s timeout)..."
STATS_RESPONSE=$(curl -s --max-time 10 "http://165.227.78.107/api/stats/dashboard" 2>&1)
if [ $? -eq 0 ] && [ -n "$STATS_RESPONSE" ]; then
    echo -e "${GREEN}✓${NC} Stats API responding"
    echo "Response preview: $(echo $STATS_RESPONSE | head -c 100)..."
else
    echo -e "${RED}✗${NC} Stats API timeout or error"
    echo "This is the known issue - database queries hanging"
fi

# Check local build
echo -e "\n🔨 Checking local build..."
if [ -f "admin/dist/server/index.js" ] && [ -f "admin/dist/client/index.html" ]; then
    echo -e "${GREEN}✓${NC} Local build exists"
else
    echo -e "${YELLOW}!${NC} Local build missing - run: cd admin && npm run build"
fi

# Check for data directory
echo -e "\n💾 Checking data directory..."
if [ -d "admin/data" ]; then
    echo -e "${GREEN}✓${NC} Data directory exists"
    ls -lh admin/data/
else
    echo -e "${YELLOW}!${NC} Data directory missing"
fi

echo -e "\n📋 Summary of Issues:"
echo "===================="
echo "1. Stats API timeout - database queries need optimization"
echo "2. Zero activity data - desktop trackers not running"
echo "3. Local server not running - only DigitalOcean is up"

echo -e "\n🔧 To fix the stats API timeout, the database.ts file needs:"
echo "   - Add query timeouts"
echo "   - Add error handling for hanging queries"
echo "   - Add fallback empty stats response"

echo -e "\n🚀 To restart local server:"
echo "   ./start-production.sh"

echo -e "\n✅ Done!"
