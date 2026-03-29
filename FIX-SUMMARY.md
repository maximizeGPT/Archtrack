# ArchTrack DigitalOcean Fix - Deployment Summary

## Problem
The DigitalOcean droplet at `165.227.78.107:3001` is down. Desktop trackers are failing to sync with error:
```
Sync error: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

This means the server is returning an HTML error page instead of JSON.

## Status
✅ **Code updated and pushed** to GitHub (commit f90b86fb)
✅ **Desktop app rebuilt** with new Render URL
⏳ **Render deployment** - Needs to be completed

## What Was Fixed

### 1. Centralized Config (desktop/src/config.ts)
Created a single config file for server URL management:
```typescript
serverUrl: 'https://archtrack-admin.onrender.com'
```

### 2. Updated All Hardcoded URLs
- `desktop/src/main.ts` - Uses config
- `desktop/src/tracker.ts` - Uses config  
- `desktop/simple-tracker.js` - Uses environment variable or default
- `desktop/dist/main.cjs` - Rebuilt with new URL

### 3. Environment Variable Support
Desktop apps now support `ARCHTRACK_SERVER_URL` env var for easy overrides.

## Next Steps to Complete Fix

### Step 1: Deploy to Render (5 minutes)
1. Go to https://dashboard.render.com/
2. Sign in with GitHub
3. Click "New +" → "Web Service"
4. Connect `mohltbot/mission-control` repo
5. Render will auto-detect `render.yaml`
6. Click "Create Web Service"
7. Wait for deployment (~5 minutes)

### Step 2: Update Desktop Apps on Employee Computers
Once Render URL is live, update each desktop tracker:

**Option A: Redistribute rebuilt app**
The desktop app in `desktop/dist/` is already rebuilt with the Render URL.

**Option B: Environment variable (quick fix)**
On each employee computer:
```bash
export ARCHTRACK_SERVER_URL=https://archtrack-admin.onrender.com
# Then restart the tracker
```

**Option C: Edit config file**
Edit `~/.archtrack/config.json` on each computer:
```json
{
  "serverUrl": "https://archtrack-admin.onrender.com"
}
```

### Step 3: Sync Queued Data
The 12,344 queued activities will automatically sync once desktop apps connect to the new server.

## Data Safety
- ✅ All 12,344 activities are stored locally on the desktop app
- ✅ They will sync automatically when server is restored
- ✅ No data loss occurred

## Render Deployment Details

**Service Name:** archtrack-admin  
**URL:** https://archtrack-admin.onrender.com  
**Plan:** Free (sleeps after 15 min, wakes on request)  
**Cost:** $0/month or $7/month for always-on  

**Default Login:**
- Username: `admin`
- Password: Auto-generated (check Render dashboard)

## Files Changed
```
desktop/src/config.ts          (new)
desktop/src/main.ts            (modified)
desktop/src/tracker.ts         (modified)
desktop/simple-tracker.js      (modified)
desktop/dist/main.cjs          (rebuilt)
RENDER-DEPLOY.md               (new)
```

## Rollback Plan
If Render doesn't work:
1. Fix DigitalOcean droplet (SSH in and restart PM2)
2. Or deploy to Fly.io: `./deploy-cloud.sh fly`
3. Or use Tailscale for private network access

## Monitoring After Deploy
1. Check Render dashboard for service status
2. Run `./status.sh` locally to verify sync
3. Check that 12,344 queued activities sync successfully
4. Verify uncle can access dashboard from home
