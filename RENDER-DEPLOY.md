# ArchTrack Render Deployment Guide

## Quick Deploy to Render (Free Tier)

### Step 1: Push Code to GitHub
```bash
cd /Users/mohlt/.openclaw/workspace/arch-firm-dashboard
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Deploy on Render
1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repo: `mohltbot/mission-control`
4. Render will auto-detect `render.yaml` and configure everything
5. Click "Create Web Service"

### Step 3: Get Your Render URL
After deployment (~5 minutes), you'll get a URL like:
`https://archtrack-admin.onrender.com`

### Step 4: Update Desktop Apps
Update the desktop tracker to use the new Render URL:

**Option A: Update config file (recommended)**
Edit `desktop/src/main.ts` and change:
```typescript
serverUrl: 'http://165.227.78.107:3001'
```
to:
```typescript
serverUrl: 'https://archtrack-admin.onrender.com'
```

Then rebuild the desktop app:
```bash
cd desktop
npm run build
```

**Option B: Use environment variable**
Set `ARCHTRACK_SERVER_URL` environment variable on employee computers.

### Step 5: Test
1. Open the Render URL in browser
2. Login with admin credentials
3. Check that desktop trackers are syncing

---

## Important Notes

### Free Tier Limitations
- **Sleep after 15 min inactivity** - First request after sleep takes ~30s to wake up
- **512MB RAM limit** - Sufficient for small teams
- **No custom domain** on free tier (use Render subdomain)

### To Upgrade ($7/month)
1. Go to Render dashboard
2. Select your service
3. Change plan from "Free" to "Starter"
4. Benefits: Always-on, more RAM, custom domains

### Data Persistence
- Database is stored on Render disk (1GB included)
- Data persists across deploys
- Backups: Download from Render dashboard or set up automated backups

---

## Troubleshooting

### Desktop app not syncing
1. Check Render URL is correct in desktop config
2. Verify desktop app was rebuilt after config change
3. Check browser console for CORS errors

### Render deploy fails
1. Check `render.yaml` syntax
2. Verify Dockerfile exists at `deployment/Dockerfile`
3. Check Render logs for build errors

### Lost data on DigitalOcean
The 12,344 queued activities on desktop apps will sync once you update the server URL. Data is stored locally until successfully synced.
