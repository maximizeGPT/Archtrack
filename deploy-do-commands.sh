#!/bin/bash
# ArchTrack DigitalOcean Deployment Commands
# Run these on the DigitalOcean server console

echo "🚀 ArchTrack DigitalOcean Deployment"
echo "====================================="
echo ""
echo "Run these commands in the DigitalOcean console:"
echo ""

cat << 'EOF'
# 1. SSH into the server (if not already in console)
# ssh root@165.227.78.107

# 2. Navigate to the app directory
cd /opt/archtrack

# 3. Pull latest changes
git pull origin main

# 4. Rebuild the application
cd admin
npm install
npm run build

# 5. Restart the server with PM2
pm2 restart archtrack

# OR if not using PM2, kill and restart:
# pkill -f "node dist/server"
# NODE_ENV=production PORT=3000 npm start

# 6. Check status
pm2 status
pm2 logs archtrack --lines 20

# 7. Test the fix
curl http://localhost:3000/api/stats/dashboard
EOF

echo ""
echo "✅ Copy the commands above and run in DigitalOcean console"
echo ""
echo "🔗 DigitalOcean Console: https://cloud.digitalocean.com/droplets"
echo "🌐 Server IP: 165.227.78.107"
