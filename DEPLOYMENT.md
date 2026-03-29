# ArchTrack Deployment Guide

## Quick Start (Recommended)

The easiest way to deploy ArchTrack is using the test script first, then deploying:

```bash
# 1. Run pre-deployment tests
./deployment/test.sh

# 2. If tests pass, deploy locally
./deployment/deploy.sh local

# Or deploy with Docker
./deployment/deploy.sh docker
```

## What Was Fixed

The deployment had 3 critical bugs:

1. **Dockerfile was broken**: It installed dependencies, then copied source code which overwrote node_modules
2. **Build script was incomplete**: `npm run build` only type-checked but never compiled the server
3. **Static file paths were wrong**: Server looked for client files in `client/` instead of `dist/client/`

## Deployment Options

### Option 1: Local Deployment (Simplest)

Best for: Testing, development, small teams

```bash
cd arch-firm-dashboard/admin
npm install
npm run build
NODE_ENV=production PORT=3000 npm start
```

**Pros:**
- No Docker needed
- Fastest to set up
- Easy to debug

**Cons:**
- Manual process management
- No automatic restarts
- Single machine only

### Option 2: Docker Compose (Recommended for Production)

Best for: Production, multiple instances, easy updates

```bash
cd arch-firm-dashboard
./deployment/deploy.sh docker
```

**Pros:**
- One-command deployment
- Automatic restarts
- Nginx reverse proxy included
- Health checks

**Cons:**
- Requires Docker knowledge
- More complex for simple setups

### Option 3: Render.com (Easiest Cloud)

Best for: No server management, automatic deploys

1. Push code to GitHub
2. Connect Render.com to your repo
3. Render uses `render.yaml` automatically

**Pros:**
- Zero server management
- Automatic deploys on git push
- Free tier available
- SSL included

**Cons:**
- Vendor lock-in
- Limited customization

### Option 4: PM2 (Reliable Process Management)

Best for: Production on VPS without Docker

```bash
# Install PM2
npm install -g pm2

# Build the app
cd arch-firm-dashboard/admin
npm install
npm run build

# Start with PM2
pm2 start dist/server/index.js --name archtrack --env production

# Save PM2 config
pm2 save
pm2 startup
```

**Pros:**
- Automatic restarts
- Log management
- Cluster mode support
- Process monitoring

**Cons:**
- Requires PM2 knowledge
- Manual setup

## Environment Variables

Copy `deployment/.env.example` to `.env` and configure:

```env
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
DATABASE_URL=sqlite:/data/archtrack.db
DISCORD_WEBHOOK_URL=optional
```

## Troubleshooting

### "Cannot find module" errors
- Run `npm install` in `admin/` directory
- Run `npm run build` to compile

### "Port already in use"
- Change `PORT` in `.env`
- Or kill existing process: `pkill -f "node dist/server"`

### "Client files not found"
- Make sure you ran `npm run build`
- Check `dist/client/index.html` exists

### Docker build fails
- Check Docker daemon is running
- Run `./deployment/test.sh` first to verify local build works

## Testing Before Deploying

Always run the test script before deploying:

```bash
./deployment/test.sh
```

This checks:
- Node.js version compatibility
- Dependencies install correctly
- Build completes without errors
- Server starts and responds to health checks
- Dashboard serves correctly

## Migration from Broken Deploy

If you had a previous broken deployment:

```bash
# Stop any running containers
docker-compose -f deployment/docker-compose.yml down

# Remove old volumes (WARNING: deletes data)
docker volume rm arch-firm-dashboard_archtrack-data

# Rebuild from scratch
./deployment/deploy.sh docker
```

## Support

If deployment still fails:
1. Run `./deployment/test.sh` and share output
2. Check logs: `docker-compose -f deployment/docker-compose.yml logs`
3. Verify `.env` file exists and is configured
