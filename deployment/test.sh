#!/bin/bash
#
# ArchTrack Pre-Deployment Test Script
# Tests the build and basic functionality before deploying
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🧪 ArchTrack Pre-Deployment Tests${NC}"
echo "===================================="
echo ""

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# Test 1: Check Node.js version
echo -e "${YELLOW}📋 Test 1: Checking Node.js version...${NC}"
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    echo -e "${GREEN}✅ Node.js $NODE_VERSION is compatible${NC}"
else
    echo -e "${RED}❌ Node.js $NODE_VERSION is too old. Need >= $REQUIRED_VERSION${NC}"
    exit 1
fi
echo ""

# Test 2: Clean install dependencies
echo -e "${YELLOW}📋 Test 2: Installing dependencies...${NC}"
cd "$PROJECT_DIR/admin"
rm -rf node_modules dist
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi
echo ""

# Test 3: Build the application
echo -e "${YELLOW}📋 Test 3: Building application...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo ""

# Test 4: Check build output structure
echo -e "${YELLOW}📋 Test 4: Checking build output...${NC}"
if [ -f "$PROJECT_DIR/admin/dist/server/index.js" ]; then
    echo -e "${GREEN}✅ Server build exists${NC}"
else
    echo -e "${RED}❌ Server build missing at dist/server/index.js${NC}"
    exit 1
fi

if [ -f "$PROJECT_DIR/admin/dist/client/index.html" ]; then
    echo -e "${GREEN}✅ Client build exists${NC}"
else
    echo -e "${RED}❌ Client build missing at dist/client/index.html${NC}"
    exit 1
fi
echo ""

# Test 5: Start server and test health endpoint
echo -e "${YELLOW}📋 Test 5: Testing server startup...${NC}"

# Kill any existing server on port 3999
pkill -f "node dist/server/index.js" 2>/dev/null || true
sleep 1

# Create test .env file
export PORT=3999
export NODE_ENV=production
export DATABASE_URL=sqlite::memory:
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=test123

# Start server in background
node dist/server/index.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test health endpoint
HEALTH_OK=false
if curl -s http://localhost:3999/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server started and health check passed${NC}"
    HEALTH_OK=true
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

# Test root endpoint
ROOT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3999/)
if [ "$ROOT_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Dashboard serving correctly (HTTP $ROOT_STATUS)${NC}"
else
    echo -e "${RED}❌ Dashboard returned HTTP $ROOT_STATUS${NC}"
    HEALTH_OK=false
fi

# Kill server
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

if [ "$HEALTH_OK" = false ]; then
    exit 1
fi
echo ""

echo -e "${GREEN}🎉 All tests passed! Ready for deployment.${NC}"
echo ""
echo "Deployment options:"
echo "  1. Docker:     ./deployment/deploy.sh docker"
echo "  2. Local:      ./deployment/deploy.sh local"
echo "  3. Render:     git push (uses render.yaml)"
echo ""
echo "To deploy manually:"
echo "  cd admin && npm run build && NODE_ENV=production npm start"
