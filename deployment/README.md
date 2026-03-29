# ArchTrack Deployment Package

Complete deployment automation for ArchTrack Employee Tracking System.

## 📦 What's Included

- `Dockerfile` - Container definition for the admin dashboard
- `docker-compose.yml` - Multi-service orchestration
- `deploy.sh` - One-command deployment script
- `.env.example` - Environment configuration template
- `nginx.conf` - Reverse proxy configuration
- `backup.sh` - Automated backup script

## 🚀 Quick Start

```bash
# 1. Clone and enter directory
cd arch-firm-dashboard

# 2. Copy environment template
cp deployment/.env.example .env
# Edit .env with your settings

# 3. Deploy everything
./deployment/deploy.sh
```

## 📁 File Structure

```
deployment/
├── Dockerfile          # Admin dashboard container
├── docker-compose.yml  # Full stack orchestration
├── deploy.sh           # Deployment automation
├── .env.example        # Config template
├── nginx.conf          # Reverse proxy
└── backup.sh           # Backup automation
```

## 🔧 Configuration

Edit `.env` file with your settings:

```env
# Database
DATABASE_URL=sqlite:/data/archtrack.db

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Server
PORT=3000
HOST=0.0.0.0

# Optional: Discord notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## 🌐 Deployment Options

### Option A: Uncle's Local Server
```bash
# Run on uncle's server directly
./deployment/deploy.sh --local
```

### Option B: Cloud VPS (DigitalOcean, AWS, etc.)
```bash
# Set up cloud server
./deployment/deploy.sh --cloud
```

### Option C: Docker Compose (Recommended)
```bash
docker-compose -f deployment/docker-compose.yml up -d
```

## 📊 Monitoring

After deployment, access:
- Admin Dashboard: http://your-server:3000
- Health Check: http://your-server:3000/api/health
- Metrics: http://your-server:3000/api/metrics

## 🔄 Backup & Restore

```bash
# Create backup
./deployment/backup.sh

# Restore from backup
./deployment/backup.sh --restore backup-2026-03-12.tar.gz
```

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 3000 in use | Change PORT in .env |
| Database locked | Restart container: `docker-compose restart` |
| Desktop tracker can't connect | Check firewall rules for port 3000 |

---

**Created:** March 12, 2026  
**Version:** 1.0.0  
**Status:** Production Ready
