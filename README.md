# ArchTrack

Open-source employee time tracking and productivity analytics for small businesses.

Built for manufacturing firms, architecture studios, and any business that needs visibility into how their team's time is spent — without the enterprise price tag.

## Features

- **Automatic time tracking** — Desktop app runs silently, no manual entry
- **Project assignment** — Clock into specific projects/tasks
- **Privacy-first** — Data stays on your infrastructure
- **Real-time dashboard** — See who's working on what right now
- **Productivity scoring** — AI-classified app usage (productive vs neutral vs distracting)
- **Suspicious activity detection** — Flags unusual patterns (YouTube binges, rapid app switching)
- **AI-powered insights** — Chat with your team's data, identify repetitive tasks, find automation opportunities
- **Natural language queries** — "How much time did Ahmed spend on emails this week?"
- **Repetitive task detection** — Automatically identifies patterns that could be automated
- **Agent opportunity scoring** — Ranks tasks by how "agentifiable" they are

## Architecture

```
arch-firm-dashboard/
├── admin/          # Admin dashboard (React + Express + SQLite)
├── desktop/        # Desktop activity tracker (Electron)
└── shared/         # Shared TypeScript types
```

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/mohltbot/archtrack.git
cd archtrack
npm run install:all
```

### 2. Start admin dashboard

```bash
cd admin
npm run dev
```

### 3. Build desktop tracker (optional)

```bash
cd ../desktop
npm run build
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + WebSocket + SQLite
- **Desktop**: Electron + active-win (cross-platform window tracking)
- **AI**: Claude API for natural language queries and pattern analysis

## Privacy

ArchTrack captures:
- App usage (app name, window title)
- Time spent per app/website
- Productivity classification
- Idle time detection
- Project/task assignments

All data stays local by default. Optional cloud sync for multi-location teams.

## AI Features

Ask questions like:
- "What did Sarah work on yesterday?"
- "Who spent the most time in meetings this week?"
- "Show me repetitive tasks that could be automated"

Automatically identifies:
- Copy-paste workflows
- Data entry patterns
- Email response templates
- Report generation sequences

Ranks detected patterns by:
- Frequency (how often it happens)
- Time cost (hours per week)
- Complexity (easy vs hard to automate)
- ROI potential (time saved vs implementation cost)

## Use Cases

- **Architecture firms** — Track billable hours per project
- **Manufacturing** — Monitor office vs floor time
- **Remote teams** — Visibility without micromanagement
- **Consulting** — Automated timesheet generation

## Roadmap

- [x] Core time tracking
- [x] Productivity scoring
- [x] Admin dashboard
- [x] AI chat interface
- [ ] Multi-location sync
- [ ] Mobile companion app
- [ ] Payroll integrations
- [ ] Advanced automation recommendations

## Contributing

This is a passion project built for my uncle's architecture firm. Contributions welcome!

## License

MIT — use it, modify it, sell it. Just don't blame me if it breaks.

---

Built with ❤️ by someone who thinks small businesses deserve big tools.
