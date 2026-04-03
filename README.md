# ArchTrack — Employee Time Tracking for Small Businesses

**Know where your team's time goes. Without the enterprise price tag.**

ArchTrack is a self-hosted employee tracking system. See who's working, what they're working on, and where time gets wasted — all in real-time from any device.

---

## What You Get

- **Real-time dashboard** — see who's online, what app they're using, productivity scores
- **AI assistant** — ask "Who was most productive today?" in plain English
- **Automatic tracking** — silent desktop app, no timesheets, no manual entry
- **Smart role detection** — auto-detects if someone is a developer, designer, manager, etc. and adjusts scoring
- **Multi-tenant** — multiple businesses on one server, completely isolated data
- **Mobile friendly** — check your dashboard from your phone

---

## Quick Start (5 minutes)

### 1. Get a Server

Create a [DigitalOcean](https://www.digitalocean.com) account and spin up a Droplet:
- **Image:** Ubuntu 24.04
- **Plan:** Basic, $6/month (1 CPU, 1GB RAM is fine)
- **Region:** Whatever's closest to you

### 2. Deploy

Open the **Droplet Console** (in DigitalOcean dashboard, click your droplet > "Console") and paste this one command:

```bash
curl -sSL https://raw.githubusercontent.com/maximizeGPT/Archtrack/main/deploy.sh | bash
```

Wait about 2 minutes. When you see `ArchTrack is LIVE!`, you're done.

### 3. Sign Up

Open `http://YOUR_DROPLET_IP` in your browser (the IP is shown in your DigitalOcean dashboard).

Click **Create Account**. Enter your company name, your name, email, and a password. You're in.

### 4. Add Employees

Go to **Employees** > **+ Add Employee**. Add each team member with their name, email, and department.

### 5. Set Up Desktop Trackers

For each employee, click the **Setup Token** button next to their name. This generates a one-time code.

On the employee's computer (Mac or Windows), you need Node.js installed, then:

```bash
git clone https://github.com/maximizeGPT/Archtrack.git
cd Archtrack/desktop
npm install
npm run build
```

Create the config file with the setup token:
```bash
# Mac:
mkdir -p ~/Library/Application\ Support/@archtrack/desktop

# Write config (replace YOUR_TOKEN and YOUR_SERVER_IP):
echo '{"deviceToken":"YOUR_DEVICE_TOKEN","serverUrl":"http://YOUR_SERVER_IP"}' > ~/Library/Application\ Support/@archtrack/desktop/config.json
```

To get the device token, call the enrollment API with the setup token:
```bash
curl -X POST http://YOUR_SERVER_IP/api/auth/enroll \
  -H "Content-Type: application/json" \
  -d '{"setupToken":"THE_SETUP_TOKEN_FROM_DASHBOARD"}'
```

This returns a `deviceToken` — put that in the config file above.

Then start the tracker:
```bash
npx electron .
```

The tracker runs silently and syncs activity every 30 seconds.

> **Note:** On Mac, you'll need to grant **Screen Recording** permission in System Settings > Privacy & Security > Screen Recording for Electron.

### 6. Watch It Work

Go back to your dashboard. Within a minute, you'll see employee activity appearing — what apps they're using, productivity scores, time breakdowns.

Check it from your phone too — just open the same URL in your mobile browser.

---

## Optional: Custom Domain + HTTPS

Instead of `http://165.227.78.107`, you can use `https://track.yourcompany.com`:

1. Buy a domain (Namecheap, Cloudflare, Google Domains — ~$10/year)
2. Add an **A record** pointing to your droplet's IP address
3. SSH into your droplet and run:
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d track.yourcompany.com
```
4. That's it — HTTPS is live, auto-renews

---

## Features

### Dashboard
- Team productivity score (0-100%)
- Focus time vs idle/wasted time
- Per-employee activity breakdown
- Suspicious activity alerts (YouTube while Slack shows "active", etc.)
- Time breakdown by category (Core Work, Communication, Research, etc.)

### AI Assistant (Genesis)
Ask questions in plain English:
- "Who was most productive today?"
- "How much time did Ahmed spend on emails?"
- "Who's at risk of burnout?"
- "Show me non-work activity this week"

### Smart Role Detection
The system watches what apps an employee uses and auto-detects their job type:
- **Developer** — VSCode, Terminal, Claude get scored as "Core Work"
- **Designer** — Figma, Photoshop, Sketch
- **Architect** — AutoCAD, Revit, SketchUp
- **Manager** — Jira, Zoom, Slack
- **Sales** — Salesforce, LinkedIn, CRM tools
- **Data Analyst** — Jupyter, Tableau, Excel

Admins can override if the auto-detection is wrong.

### Multi-Tenant
- Each business is completely isolated
- One server handles unlimited companies
- JWT auth for dashboard and desktop tracker
- Setup tokens for easy employee onboarding

---

## Architecture

```
[Employee Mac/PC]          [Your Server]              [Your Phone/Laptop]
  Desktop Tracker  --->  Node.js + SQLite  <---   Dashboard (any browser)
  (Electron app)         (port 3001)               (React SPA)
                         nginx (port 80)
```

- **Admin dashboard:** React SPA served by Express
- **API:** Express + SQLite (upgradeable to Postgres)
- **Desktop tracker:** Electron app, syncs every 30 seconds
- **Auth:** JWT tokens (24h dashboard, 90d device)
- **Process manager:** PM2 (auto-restart on crash)
- **Reverse proxy:** nginx (port 80 -> 3001, WebSocket support)

---

## Updating

SSH into your server (or use DigitalOcean Console) and run:

```bash
cd /opt/archtrack && git pull && cd admin && npm install --no-package-lock && npx tsc -p tsconfig.server.json && npx vite build && pm2 restart archtrack
```

---

## API Reference

All endpoints require `Authorization: Bearer <token>` header (except auth endpoints).

### Auth
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/signup` | POST | Public | Create account + org |
| `/api/auth/login` | POST | Public | Login, get JWT |
| `/api/auth/forgot-password` | POST | Public | Generate reset link |
| `/api/auth/reset-password` | POST | Public | Reset password with token |
| `/api/auth/setup-token` | POST | Dashboard | Generate employee setup token |
| `/api/auth/enroll` | POST | Public | Redeem setup token for device JWT |
| `/api/auth/me` | GET | Any | Get current user info |

### Employees & Activities
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/employees` | GET/POST | List or create employees |
| `/api/activities` | GET | Get tracked activities |
| `/api/activity` | POST | Desktop tracker syncs here |
| `/api/dashboard/stats` | GET | Dashboard overview data |
| `/api/roles` | GET | Smart role detection status |
| `/api/roles/:id` | PUT | Override detected role |

---

## System Requirements

**Server:** Ubuntu 20.04+, 1GB RAM, 1 CPU ($6/month on DigitalOcean)

**Desktop tracker:** Mac or Windows, Node.js 18+, Screen Recording permission (Mac)

**Dashboard:** Any modern browser (phone or computer)

---

## License

MIT License — free to use, modify, and sell.

Built for small business owners who deserve big tools.
