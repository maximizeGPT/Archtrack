#!/bin/bash
# ArchTrack VPS Deployment Script
# Run this on a fresh Ubuntu 24.04 server

set -e

ARCHTRACK_IP="104.131.92.182"
REPO_URL="https://github.com/mohltbot/mission-control.git"

echo "🚀 ArchTrack VPS Deployment"
echo "============================"
echo ""

# Update system
echo "📦 Updating system..."
apt-get update
apt-get install -y curl git nginx sqlite3

# Install Node.js 20
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
npm install -g pm2

# Create app directory
echo "📁 Setting up app directory..."
mkdir -p /opt/archtrack
cd /opt/archtrack

# Clone repo
echo "📥 Cloning repository..."
if [ -d ".git" ]; then
  git pull
else
  git clone "$REPO_URL" .
fi

# Build the app
echo "🔨 Building application..."
cd arch-firm-dashboard/admin
npm install
npm run build

# Create data directory
echo "📁 Creating data directory..."
mkdir -p /opt/archtrack/data

# Create PM2 config
echo "⚙️  Creating PM2 config..."
cat > /opt/archtrack/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: "archtrack",
    cwd: "/opt/archtrack/arch-firm-dashboard/admin",
    script: "dist/server/index.js",
    env: {
      NODE_ENV: "production",
      PORT: "3000",
      DATABASE_URL: "sqlite:/opt/archtrack/data/archtrack.db",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "changeme123"
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "512M"
  }]
};
EOF

# Start with PM2
echo "🚀 Starting application..."
pm2 start /opt/archtrack/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

# Setup Nginx
echo "🔧 Configuring Nginx..."
cat > /etc/nginx/sites-available/archtrack << 'EOF'
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/archtrack /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "✅ ArchTrack deployed successfully!"
echo ""
echo "🌐 Dashboard: http://$ARCHTRACK_IP"
echo "👤 Username: admin"
echo "🔑 Password: changeme123"
echo ""
echo "⚠️  IMPORTANT: Change the default password!"
echo ""
echo "Useful commands:"
echo "  pm2 logs archtrack     # View logs"
echo "  pm2 restart archtrack  # Restart app"
echo "  pm2 status             # Check status"
