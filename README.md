# ArchTrack - Employee Time Tracking & Admin Dashboard

An employee time tracking and productivity monitoring system for your uncle's manufacturing business.

## Architecture

```
arch-firm-dashboard/
├── admin/          # Admin dashboard (React + Express + SQLite)
├── desktop/        # Desktop activity tracker (Electron)
└── shared/         # Shared TypeScript types
```

## Quick Start

### 1. Install Dependencies

```bash
cd arch-firm-dashboard
npm run install:all
```

### 2. Start Admin Dashboard

```bash
cd admin
npm run dev
```

This starts:
- Server: http://localhost:3001
- Dashboard: http://localhost:5174

### 3. Build Desktop App (Optional)

```bash
cd desktop
npm install
npm run build
```

## Features

### Admin Dashboard
- **Employee Management**: Add/edit/delete employees
- **Project Tracking**: Create projects, assign tasks
- **Time Tracking**: View hours logged by employee/project
- **Productivity Reports**: See productivity scores and suspicious activity
- **Real-time Updates**: WebSocket connection for live activity feed

### Desktop Tracker
- Automatic activity tracking
- App usage classification
- Idle time detection
- Productivity scoring
- Suspicious activity detection (YouTube idle, rapid switching, etc.)

## API Endpoints

- `GET /api/employees` - List all employees
- `POST /api/employees` - Create employee
- `GET /api/projects` - List all projects
- `GET /api/activities` - Get activity logs
- `GET /api/reports/productivity` - Generate productivity report
- `WS /ws` - WebSocket for real-time updates

## Database

SQLite database stored in `admin/data/admin.db`

Tables:
- `employees` - Employee records
- `projects` - Project information
- `tasks` - Task assignments
- `activities` - Activity tracking data
- `time_entries` - Legacy time entries

## Development

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + WebSocket + SQLite
- **Desktop**: Electron + active-win (window tracking)

### File Structure
```
admin/
├── src/client/     # React frontend
│   ├── pages/      # Dashboard, Employees, Projects, Tasks, Reports
│   └── contexts/   # WebSocket context
├── server/         # Express backend
│   ├── index.ts    # Server entry
│   ├── routes.ts   # API routes
│   ├── database.ts # SQLite operations
│   └── websocket.ts# WebSocket handler
└── data/           # SQLite database
```
