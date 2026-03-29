# Genesis AI Chatbot - Technical Documentation

## Overview
Genesis AI is a floating chatbot widget for the ArchTrack dashboard that provides natural language analytics and productivity insights.

## Features
- Floating bubble button (bottom-right corner)
- Expandable chat window with gradient header
- Natural language query processing
- Productivity analytics and insights
- Repetitive task detection with automation suggestions
- Back/reset navigation
- Suggestion chips for common queries

## Files

### Frontend
- `admin/src/client/components/GenesisAIChat.tsx` - Main React component
- `admin/src/client/pages/Dashboard.tsx` - Integration point

### Backend
- `admin/server/routes/ai-routes.ts` - API endpoints (/api/ai/chat, /api/ai/patterns, /api/ai/opportunities)
- `admin/server/ai-analytics.ts` - Pattern detection and analytics logic
- `admin/server/index.ts` - Route registration

## API Endpoints

### POST /api/ai/chat
Process natural language queries about productivity data.

**Request:**
```json
{
  "question": "Who was most productive today?"
}
```

**Response:**
```json
{
  "answer": "Productivity rankings for the last 1 day(s):\n\n1. John: 85% score, 78% productive time",
  "sql": "SELECT ...",
  "data": [...],
  "suggestions": ["Show time wasters", "Repetitive task opportunities"]
}
```

### GET /api/ai/patterns
Detect repetitive patterns and automation opportunities.

**Query params:**
- `employeeId` (optional) - Filter by employee
- `days` (default: 7) - Lookback period

### GET /api/ai/opportunities
Get top automation opportunities.

**Query params:**
- `limit` (default: 5) - Number of opportunities

## Query Patterns Supported

1. **Time spent queries**
   - "How much time did [name] spend on [app]?"
   - "Time spent on YouTube this week"

2. **Productivity queries**
   - "Who was most productive today?"
   - "Show productivity rankings"

3. **Repetitive tasks**
   - "Show repetitive tasks"
   - "What can be automated?"

4. **Employee queries**
   - "Show employee summary"
   - "Who worked the most hours?"

5. **App queries**
   - "Time spent on email"
   - "Most used apps"

6. **General**
   - "Weekly summary"
   - "Dashboard overview"

## Pattern Detection

The system detects three types of repetitive patterns:

1. **App Sequences** - Repeated workflows (e.g., Excel → Email → Excel)
2. **Data Entry** - Long periods in spreadsheets/forms
3. **Report Generation** - Regular report creation activities

Each pattern includes:
- Frequency (times per day)
- Time cost (hours per week)
- Automation potential (high/medium/low)
- Suggested solution

## Styling

Uses inline CSS (not Tailwind) to match Dashboard styling approach:
- Fixed positioning for floating button
- Gradient header (blue to indigo)
- Rounded message bubbles
- Responsive suggestion chips

## Deployment

```bash
cd /opt/archtrack
git pull origin main
cd arch-firm-dashboard/admin
npm install
npm run build
pm2 restart archtrack
```

## Future Enhancements

- [ ] Multi-turn conversations with context
- [ ] Chart/graph generation for data visualization
- [ ] Export reports to PDF
- [ ] Slack/Discord integration
- [ ] Custom query training

---
Created: March 16, 2026
