#!/bin/bash
# ArchTrack Packaging Script
# Creates distributable Electron app for uncle's architecture firm

set -e

echo "🏗️ ArchTrack Packager"
echo "======================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ArchTrack"
APP_VERSION="1.0.0"
OUTPUT_DIR="./dist-packages"
DESKTOP_DIR="./desktop"

cd "$(dirname "$0")"
cd ..

# Check if electron-builder is installed
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ npx not found. Please install Node.js${NC}"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "$DESKTOP_DIR/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    cd "$DESKTOP_DIR"
    npm install
    cd ..
fi

echo -e "${GREEN}✓ Dependencies ready${NC}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build for current platform
echo -e "${YELLOW}🔨 Building Electron app...${NC}"
cd "$DESKTOP_DIR"

# Build TypeScript first
echo "Compiling TypeScript..."
npx tsc

# Package with electron-builder
echo "Packaging with electron-builder..."
npx electron-builder --dir

cd ..

# Create deployment package
echo -e "${YELLOW}📦 Creating deployment package...${NC}"

# Copy necessary files to dist-packages
DEPLOY_DIR="$OUTPUT_DIR/archtrack-v$APP_VERSION"
mkdir -p "$DEPLOY_DIR"

cp -r "$DESKTOP_DIR/dist" "$DEPLOY_DIR/"
cp "$DESKTOP_DIR/package.json" "$DEPLOY_DIR/"
cp -r "$DESKTOP_DIR/node_modules" "$DEPLOY_DIR/" 2>/dev/null || true

# Create README for deployment
cat > "$DEPLOY_DIR/README.txt" << 'EOF'
ArchTrack Employee Tracking System
==================================
Version: 1.0.0

INSTALLATION INSTRUCTIONS
-------------------------

1. EXTRACT this folder to a location on the employee's computer
   (e.g., C:\Program Files\ArchTrack\ or ~/Applications/ArchTrack/)

2. INSTALL the admin dashboard on your server:
   - See admin-dashboard-setup.md for server setup

3. CONFIGURE the tracker:
   - Edit config.json to point to your admin dashboard URL
   - Default: http://localhost:3000

4. RUN the tracker:
   - Windows: Double-click ArchTrack.exe
   - Mac: Double-click ArchTrack.app
   - Linux: ./ArchTrack

5. GRANT PERMISSIONS when prompted:
   - Screen Recording (to detect active window)
   - Accessibility (to read window titles)

6. VERIFY connection in the admin dashboard

SUPPORT
-------
For technical support, contact: [your-support-email]

EOF

# Create config template
cat > "$DEPLOY_DIR/config.template.json" << EOF
{
  "serverUrl": "http://localhost:3000",
  "employeeId": "EMPLOYEE_ID_HERE",
  "employeeName": "EMPLOYEE_NAME_HERE",
  "checkInterval": 10,
  "idleThreshold": 300,
  "version": "$APP_VERSION"
}
EOF

echo -e "${GREEN}✓ Deployment package created at: $DEPLOY_DIR${NC}"

# Create platform-specific packages
echo -e "${YELLOW}🎯 Building platform-specific installers...${NC}"

cd "$DESKTOP_DIR"

# Build for all platforms (or current platform if cross-compilation not available)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Building for macOS..."
    npx electron-builder --mac --publish=never || echo "macOS build requires macOS"
    
    if [ -d "dist/mac" ]; then
        cp -r "dist/mac" "../$OUTPUT_DIR/archtrack-mac"
        echo -e "${GREEN}✓ macOS build ready${NC}"
    fi
    
    if [ -d "dist/mac-arm64" ]; then
        cp -r "dist/mac-arm64" "../$OUTPUT_DIR/archtrack-mac-arm64"
        echo -e "${GREEN}✓ macOS ARM64 build ready${NC}"
    fi
fi

if [[ "$OSTYPE" == "linux"* ]]; then
    echo "Building for Linux..."
    npx electron-builder --linux --publish=never || echo "Linux build requires Linux"
    
    if [ -d "dist/linux-unpacked" ]; then
        cp -r "dist/linux-unpacked" "../$OUTPUT_DIR/archtrack-linux"
        echo -e "${GREEN}✓ Linux build ready${NC}"
    fi
fi

# Windows build requires Wine on non-Windows platforms
echo "Building for Windows (requires Wine on Mac/Linux)..."
npx electron-builder --win --publish=never 2>/dev/null || echo "Windows build skipped (requires Windows or Wine)"

if [ -d "dist/win-unpacked" ]; then
    cp -r "dist/win-unpacked" "../$OUTPUT_DIR/archtrack-windows"
    echo -e "${GREEN}✓ Windows build ready${NC}"
fi

cd ..

# Create summary
echo ""
echo "======================"
echo -e "${GREEN}✅ Packaging Complete!${NC}"
echo "======================"
echo ""
echo "Output location: $OUTPUT_DIR/"
echo ""
echo "Available builds:"
ls -la "$OUTPUT_DIR/"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Test the build on a target machine"
echo "2. Deploy the admin dashboard to your server"
echo "3. Distribute the desktop tracker to employees"
echo "4. Configure employee IDs in config.json"
