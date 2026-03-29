# Genesis AI Test Results - Architecture Firm Owner Questions

**Test Date:** March 16, 2026  
**Test Environment:** ArchTrack Dashboard (http://localhost:3001)  
**AI System:** Genesis AI Chatbot  
**Test Data:** 4,504 activities from 1 employee (Mohammed) over 8 days (Mar 8-16, 2026)

---

## Executive Summary

The Genesis AI system provides **basic productivity analytics** but has **significant gaps** in answering realistic architecture firm owner questions. Many queries fall back to generic responses or fail to understand the business context. The AI excels at simple time-tracking queries but struggles with business intelligence, project management, and employee assessment questions.

**Overall Score: 4/15 (27%)** - Needs substantial improvement for production use.

---

## Detailed Test Results

### 1. "Who's slacking off right now?"

**AI Answer:**
```json
{
  "answer": "No Slack activity found the last 7 days.",
  "suggestions": ["Show all apps used", "What are they doing instead?", "Weekly summary"]
}
```

**Analysis:**
- ❌ **FAIL** - The AI misinterpreted "slacking off" as "Slack" (the app)
- No understanding of the business question about employee productivity
- No identification of low performers or idle time

**Missing Data:**
- Real-time activity status for all employees
- Idle time thresholds and alerts
- Comparative productivity rankings

**Suggested Improvements:**
- Add pattern matching for "slacking", "slacking off", "not working"
- Query for employees with low productivity scores + high idle time
- Show employees with < 20% productive time in last hour

---

### 2. "Is anyone working overtime this week?"

**AI Answer:**
```json
{
  "answer": "Time spent by employee the last 7 days:\n\n• Mohammed: 9 hours"
}
```

**Analysis:**
- ⚠️ **PARTIAL** - Shows hours worked but doesn't interpret "overtime"
- No threshold defined (what counts as overtime? >40h/week? >8h/day?)
- No flagging of excessive hours

**Missing Data:**
- Standard work hours configuration per employee
- Overtime threshold definitions
- Daily hour breakdowns

**Suggested Improvements:**
- Add `standard_hours_per_week` to employee table
- Define overtime as >40 hours/week or >8 hours/day
- Highlight employees exceeding thresholds with warning emoji

---

### 3. "Who spends the most time on non-work stuff?"

**AI Answer:**
```json
{
  "answer": "Time spent by employee the last 7 days:\n\n• Mohammed: 9 hours"
}
```

**Analysis:**
- ❌ **FAIL** - Ignored "non-work stuff" filter completely
- Only shows total hours, not unproductive time breakdown

**Missing Data:**
- Category-based time analysis per employee
- Entertainment + Social Media + Shopping time totals
- Comparison between employees

**Suggested Improvements:**
- Query for `category IN ('entertainment', 'social_media', 'shopping_personal')`
- Rank employees by unproductive time percentage
- Show top time-wasting apps per employee

---

### 4. "Are my employees actually working from home?"

**AI Answer:**
```json
{
  "answer": "**Employee Activity Summary (Last 7 Days)**\n\n⚠️ **Mohammed** (Architecture)\n   9h tracked • 15% productivity • 2673 flags"
}
```

**Analysis:**
- ⚠️ **PARTIAL** - Shows activity data but doesn't answer the WFH question
- No location/IP tracking data
- Cannot distinguish remote vs office work

**Missing Data:**
- IP address geolocation tracking
- Location tags on activities
- VPN vs office network detection

**Suggested Improvements:**
- Track IP addresses from desktop agents
- Flag location changes (home IP vs office IP)
- Add location field to activity records

---

### 5. "Who's the most efficient drafter?"

**AI Answer:**
```json
{
  "answer": "**Employee Activity Summary (Last 7 Days)**\n\n⚠️ **Mohammed** (Architecture)\n   9h tracked • 15% productivity • 2673 flags"
}
```

**Analysis:**
- ❌ **FAIL** - No understanding of "drafter" role or CAD software
- No filtering by department or role
- No CAD-specific productivity metrics

**Missing Data:**
- Role-based filtering (drafters vs architects vs managers)
- CAD software tracking (AutoCAD, Revit, SketchUp)
- Drafting-specific productivity benchmarks

**Suggested Improvements:**
- Add query pattern for "drafter", "draftsman", "CAD"
- Filter employees by department = 'Architecture'
- Look for CAD apps (AutoCAD, Revit, etc.) in activity

---

### 6. "Is anyone looking for another job?" (suspicious patterns)

**AI Answer:**
```json
{
  "answer": "**📊 Weekly Team Summary**\n\n• **1** employees actively tracked\n• **9** total hours logged\n• **15%** average productivity score\n• **2673** activities flagged for review"
}
```

**Analysis:**
- ❌ **FAIL** - No understanding of job-search patterns
- 2,673 "suspicious" flags but no explanation of what they are
- No LinkedIn, Indeed, or job board tracking

**Missing Data:**
- Job site detection (linkedin.com/jobs, indeed.com, etc.)
- Resume editing activity
- Unusual hours patterns (updating resume at midnight)

**Suggested Improvements:**
- Flag visits to job boards and career sites
- Detect resume/CV editing in Word/PDF apps
- Track LinkedIn profile updates
- Add specific query handler for job search detection

---

### 7. "What time do people usually start working?"

**AI Answer:**
```json
{
  "answer": "**📊 Weekly Team Summary**\n\n• **1** employees actively tracked\n• **9** total hours logged\n• **15%** average productivity score\n• **2673** activities flagged for review"
}
```

**Analysis:**
- ❌ **FAIL** - No time-based analysis
- No first-activity-of-day tracking
- No start time patterns

**Missing Data:**
- First activity timestamp per day per employee
- Average start time calculation
- Start time trends over weeks

**Suggested Improvements:**
- Query: `SELECT employee_id, DATE(timestamp), MIN(timestamp) FROM activities GROUP BY employee_id, DATE(timestamp)`
- Calculate average start time per employee
- Show earliest, latest, and median start times

---

### 8. "Who's burning out?" (long hours + low productivity)

**AI Answer:**
```json
{
  "answer": "**Employee Activity Summary (Last 7 Days)**\n\n⚠️ **Mohammed** (Architecture)\n   9h tracked • 15% productivity • 2673 flags"
}
```

**Analysis:**
- ⚠️ **PARTIAL** - Shows data but doesn't calculate burnout risk
- No correlation between hours and productivity
- No burnout threshold logic

**Missing Data:**
- Burnout risk algorithm (high hours + low productivity)
- Trend analysis (declining productivity over time)
- After-hours work tracking

**Suggested Improvements:**
- Burnout score = (hours_worked / 40) * (100 - productivity_score)
- Flag employees with >50 hours AND <50% productivity
- Track weekend/after-hours activity

---

### 9. "Are we on track for the Smith project deadline?"

**AI Answer:**
```json
{
  "answer": "**📊 Weekly Team Summary**\n\n• **1** employees actively tracked\n• **9** total hours logged\n• **15%** average productivity score\n• **2673** flagged for review"
}
```

**Analysis:**
- ❌ **FAIL** - No project-specific query handling
- No connection between tasks and projects
- No deadline tracking

**Missing Data:**
- Project deadline field in database
- Hours logged per project
- Estimated vs actual hours comparison

**Current Database State:**
```sql
Projects: Downtown Office Complex, Residential Tower, Community Center
-- No "Smith project" exists
-- No deadline field in projects table
```

**Suggested Improvements:**
- Add `deadline` field to projects table
- Track hours per project
- Calculate completion percentage: `hours_logged / estimated_hours`
- Add query handler for project-specific questions

---

### 10. "Who should I give the new project to?" (who has capacity)

**AI Answer:**
```json
{
  "answer": "**Employee Activity Summary (Last 7 Days)**\n\n⚠️ **Mohammed** (Architecture)\n   9h tracked • 15% productivity • 2673 flags"
}
```

**Analysis:**
- ❌ **FAIL** - No capacity calculation
- No workload distribution analysis
- No availability scoring

**Missing Data:**
- Current workload per employee
- Available capacity (40h - assigned_hours)
- Skill matching for project types

**Suggested Improvements:**
- Calculate capacity: `40 - SUM(estimated_hours) FROM tasks WHERE assigned_to = ?`
- Rank employees by available hours
- Consider productivity scores in recommendations
- Add query handler for capacity questions

---

### 11. "Is anyone sharing confidential files?"

**AI Answer:**
```json
{
  "answer": "**📊 Weekly Team Summary**\n\n• **1** employees actively tracked\n• **9** total hours logged\n• **15%** average productivity score\n• **2673** activities flagged for review"
}
```

**Analysis:**
- ❌ **FAIL** - No file transfer tracking
- No cloud storage monitoring
- No USB/external drive detection

**Missing Data:**
- File upload/download tracking
- Cloud storage app monitoring (Dropbox, Google Drive, WeTransfer)
- Email attachment tracking

**Suggested Improvements:**
- Track cloud storage app usage
- Flag large file transfers
- Monitor USB device connections
- Add data loss prevention (DLP) patterns

---

### 12. "What's our team's overall efficiency this month?"

**AI Answer:**
```json
{
  "answer": "**📊 Weekly Team Summary**\n\n• **1** employees actively tracked\n• **9** total hours logged\n• **15%** average productivity score\n• **2673** activities flagged for review"
}
```

**Analysis:**
- ⚠️ **PARTIAL** - Shows summary but not monthly view
- Data is for 7 days, not "this month"
- No efficiency trend comparison

**Current Data:**
```
Total Activities: 4,504
Time Period: Mar 8-16, 2026 (8 days)
Break/Idle: 9.3 hours
Core Work: 1.4 hours
Other: 1.7 hours
Entertainment: 0.01 hours
```

**Suggested Improvements:**
- Respect "this month" timeframe (30 days)
- Calculate efficiency: `core_work_hours / total_hours`
- Show month-over-month comparison
- Add efficiency trend graph data

---

### 13. "Who needs more training?" (low productivity on core tools)

**AI Answer:**
```json
{
  "answer": "**Employee Activity Summary (Last 7 Days)**\n\n⚠️ **Mohammed** (Architecture)\n   9h tracked • 15% productivity • 2673 flags"
}
```

**Analysis:**
- ❌ **FAIL** - No training need detection
- No core tool proficiency tracking
- No skill gap identification

**Missing Data:**
- Core tool list per role (AutoCAD, Revit for architects)
- Time spent in help/tutorials
- Error/frustration indicators (rapid app switching)

**Suggested Improvements:**
- Define core tools per department
- Track tutorial/help site visits
- Detect struggle patterns (repeated failed actions)
- Compare tool usage efficiency across employees

---

### 14. "Are people taking too many breaks?"

**AI Answer:**
```json
{
  "answer": "**📊 Weekly Team Summary**\n\n• **1** employees actively tracked\n• **9** total hours logged\n• **15%** average productivity score\n• **2673** activities flagged for review"
}
```

**Analysis:**
- ❌ **FAIL** - No break time analysis
- No break frequency tracking
- No threshold for "too many"

**Current Data:**
```
Break/Idle: 9.3 hours (81% of tracked time)
Core Work: 1.4 hours (12% of tracked time)
```

**Suggested Improvements:**
- Query `category = 'break_idle'` time per employee
- Define break thresholds (>2 hours/day = excessive)
- Count break frequency (number of idle periods)
- Compare to healthy break guidelines

---

### 15. "Who's my best project manager?"

**AI Answer:**
```json
{
  "answer": "**Employee Activity Summary (Last 7 Days)**\n\n⚠️ **Mohammed** (Architecture)\n   9h tracked • 15% productivity • 2673 flags"
}
```

**Analysis:**
- ❌ **FAIL** - No role-based filtering
- Sarah is the only manager but not identified
- No PM-specific metrics (project completion, client communication)

**Current Database State:**
```sql
Employees:
- Mohammed: Architecture, employee
- Ahmed: Architecture, employee  
- Sarah: Design, manager  <-- Only manager
```

**Suggested Improvements:**
- Filter by `role = 'manager'`
- Track PM metrics: projects managed, on-time delivery, client communication time
- Rank by project success rate

---

## Data Availability Analysis

### What Data EXISTS:

| Data Type | Status | Details |
|-----------|--------|---------|
| Employee records | ✅ | 3 employees (Mohammed, Ahmed, Sarah) |
| Activity tracking | ✅ | 4,504 activities, 8 days of data |
| Project records | ✅ | 3 projects ($1.55M total budget) |
| Task records | ✅ | 4 tasks with priorities |
| Time by category | ✅ | Core Work, Break/Idle, Entertainment, etc. |
| Productivity scores | ✅ | Per-activity scoring |
| Suspicious flags | ✅ | 2,673 flagged activities |

### What Data is MISSING:

| Data Type | Impact | Priority |
|-----------|--------|----------|
| Project deadlines | Can't answer deadline questions | HIGH |
| Work hours config | Can't calculate overtime | HIGH |
| Location/IP tracking | Can't verify WFH | MEDIUM |
| Job site detection | Can't detect job searching | MEDIUM |
| File transfer tracking | Can't detect data leaks | HIGH |
| Start time patterns | Can't answer schedule questions | MEDIUM |
| Role-based metrics | Can't compare by role | MEDIUM |
| CAD tool categorization | Can't assess drafting efficiency | MEDIUM |

---

## Recommendations

### Immediate Fixes (Week 1):

1. **Add query handlers for failed questions** (1, 3, 6, 9, 10, 11, 13, 14, 15)
2. **Fix "slacking off" pattern** - don't match to "Slack" app
3. **Add timeframe respect** - "this month" should query 30 days, not 7

### Short-term Improvements (Month 1):

1. **Add project deadline tracking**
   ```sql
   ALTER TABLE projects ADD COLUMN deadline TEXT;
   ALTER TABLE projects ADD COLUMN estimated_hours REAL;
   ```

2. **Add employee work configuration**
   ```sql
   ALTER TABLE employees ADD COLUMN standard_hours_per_week INTEGER DEFAULT 40;
   ALTER TABLE employees ADD COLUMN start_time_preference TEXT;
   ```

3. **Enhance suspicious activity detection**
   - Job site URLs (indeed.com, linkedin.com/jobs)
   - File transfer apps (Dropbox, WeTransfer)
   - After-hours patterns

### Long-term Enhancements (Quarter 1):

1. **Business Intelligence Layer**
   - Burnout risk algorithm
   - Capacity planning calculations
   - Project health scoring

2. **Role-Based Analytics**
   - Drafter efficiency metrics
   - PM project success rates
   - Architect design time benchmarks

3. **Predictive Analytics**
   - Deadline risk prediction
   - Employee retention risk
   - Project overrun forecasting

---

## Appendix: Raw Test Data

### Database Schema:
```sql
-- Employees
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'employee', -- 'employee' or 'manager'
  department TEXT, -- 'Architecture', 'Design'
  hourly_rate REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Activity Categories
- core_work
- communication
- research_learning
- planning_docs
- break_idle
- entertainment
- social_media
- shopping_personal
```

### Activity Summary (Mar 8-16, 2026):
```
Total Activities: 4,504
Unique Employees: 1 (Mohammed)
Time Range: 8 days

Top Apps:
- loginwindow: 2,736 activities
- Finder: 879 activities
- Google Chrome: 812 activities
- Safari: 42 activities
- Terminal: 21 activities

Time by Category:
- Break/Idle: 9.3 hours (81%)
- Other: 1.7 hours (15%)
- Core Work: 1.4 hours (12%)
- Entertainment: 0.01 hours (0.1%)
- Communication: 0.006 hours (0.05%)
- Social Media: 0.003 hours (0.02%)
```

---

*Test completed by: AI Subagent*  
*Report generated: March 16, 2026*
