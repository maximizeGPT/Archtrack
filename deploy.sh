#!/bin/bash
# ArchTrack One-Command Deploy Script
# Run this ON the DigitalOcean droplet (not your Mac)
# Usage: curl -sSL https://raw.githubusercontent.com/maximizeGPT/Archtrack/main/deploy.sh | bash

set -e

echo ""
echo "========================================="
echo "  ArchTrack SaaS — Production Deploy"
echo "========================================="
echo ""

# Step 1: Install Node.js if missing
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "✅ Node.js $(node -v)"

# Step 2: Install PM2 if missing
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi
echo "✅ PM2 installed"

# Step 3: Clone or update repo
APP_DIR="/opt/archtrack"
if [ -d "$APP_DIR/.git" ]; then
    echo "🔄 Updating existing installation..."
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/main
else
    echo "📥 Fresh install — cloning from GitHub..."
    rm -rf "$APP_DIR"
    git clone https://github.com/maximizeGPT/Archtrack.git "$APP_DIR"
    cd "$APP_DIR"
fi

# Step 4: Install dependencies
echo "📦 Installing admin dependencies..."
cd "$APP_DIR/admin"
npm install --production 2>&1 | tail -3

# Step 5: Build
echo "🔨 Building server..."
npx tsc -p tsconfig.server.json 2>&1 || true
echo "🔨 Building client..."
npx vite build 2>&1 | tail -3

# Step 6: Create .env if not exists
if [ ! -f "$APP_DIR/admin/.env" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    cat > "$APP_DIR/admin/.env" << ENVEOF
# ArchTrack Production Environment
DATABASE_PATH=./data/admin.db
PORT=3001
NODE_ENV=production

# IMPORTANT: This secret signs all auth tokens. Do not change after users sign up.
JWT_SECRET=$JWT_SECRET

# LLM (optional — for Genesis AI chat)
# DEEPSEEK_API_KEY=your_key_here

# WebSocket
WS_HEARTBEAT_INTERVAL=30000
ENVEOF
    echo "✅ Created .env with auto-generated JWT_SECRET"
else
    echo "✅ .env already exists (keeping existing config)"
fi

# Step 7: Create data directory
mkdir -p "$APP_DIR/admin/data"

# Step 8: Setup nginx reverse proxy (port 80 -> 3001)
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    apt-get install -y nginx
fi

cat > /etc/nginx/sites-available/archtrack << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    # Increase body size for activity syncs
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/archtrack /etc/nginx/sites-enabled/archtrack
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
echo "✅ Nginx configured (port 80 -> 3001)"

# Step 9: Start/restart with PM2
cd "$APP_DIR/admin"
pm2 stop archtrack 2>/dev/null || true
pm2 delete archtrack 2>/dev/null || true
pm2 start dist/server/index.js --name archtrack --cwd "$APP_DIR/admin"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "========================================="
echo "  ✅ ArchTrack is LIVE!"
echo "========================================="
echo ""
DROPLET_IP=$(curl -s ifconfig.me 2>/dev/null || echo "your-server-ip")
echo "  Dashboard:  http://$DROPLET_IP"
echo "  Sign up:    http://$DROPLET_IP/signup"
echo "  Health:     http://$DROPLET_IP/api/health"
echo ""
echo "  PM2 status: pm2 status"
echo "  Logs:       pm2 logs archtrack"
echo "  Restart:    pm2 restart archtrack"
echo ""
echo "  Next: Add HTTPS with 'certbot --nginx -d yourdomain.com'"
echo "========================================="
