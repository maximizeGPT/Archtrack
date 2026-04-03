# ArchTrack — Employee Time Tracking for Small Businesses

**Live demo: [archtrack.live](https://archtrack.live)**

**Know where your team's time goes. Without the enterprise price tag.**

ArchTrack is an open-source employee tracking SaaS. See who's working, what they're working on, and where time gets wasted — all in real-time from any device.

---

## What You Get

- **Real-time dashboard** — see who's online, what app they're using, productivity scores
- **AI assistant** — ask "Who was most productive today?" in plain English
- **Automatic tracking** — silent desktop app, no timesheets, no manual entry
- **Smart role detection** — auto-detects if someone is a developer, designer, manager, etc. and adjusts scoring
- **Multi-tenant** — multiple businesses on one server, completely isolated data
- **Mobile friendly** — check your dashboard from your phone

---

## Getting Started (2 minutes)

### 1. Sign Up

Go to **[archtrack.live/signup](https://archtrack.live/signup)**. Enter your company name, your name, email, and a password. You're in.

### 2. Add Employees

Go to **Employees** > **+ Add Employee**. Add each team member with their name, email, and department.

### 3. Install the Desktop Tracker

For each employee, click the **Setup Token** button next to their name. This generates a one-time setup code.

On the employee's computer (Mac), install [Node.js](https://nodejs.org) if they don't have it, then run:

```bash
git clone https://github.com/maximizeGPT/Archtrack.git
cd Archtrack/desktop
npm install
```

Enroll the tracker with the setup token from the dashboard:
```bash
# Get the device token (replace SETUP_TOKEN with the code from the dashboard)
curl -X POST https://archtrack.live/api/auth/enroll \
  -H "Content-Type: application/json" \
  -d '{"setupToken":"PASTE_SETUP_TOKEN_HERE"}'
```

Save the returned `accessToken` to the config file:
```bash
mkdir -p ~/Library/Application\ Support/@archtrack/desktop
echo '{"deviceToken":"PASTE_ACCESS_TOKEN_HERE","serverUrl":"https://archtrack.live"}' > ~/Library/Application\ Support/@archtrack/desktop/config.json
```

Start the tracker:
```bash
npx electron .
```

> **Mac users:** Grant **Screen Recording** permission when prompted (System Settings > Privacy & Security > Screen Recording > Electron).

### 4. Watch It Work

Go back to your dashboard at [archtrack.live](https://archtrack.live). Within a minute, you'll see employee activity — what apps they're using, productivity scores, time breakdowns. Check it from your phone too.

---

## Self-Hosting (Optional)

Want to run your own instance instead of using archtrack.live? Deploy to any Ubuntu server:

```bash
curl -sSL https://raw.githubusercontent.com/maximizeGPT/Archtrack/main/deploy.sh | bash
```

Works on DigitalOcean ($6/month droplet), AWS, or any VPS. Add a custom domain + HTTPS with:
```bash
certbot --nginx -d yourdomain.com
```

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
