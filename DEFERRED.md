# ArchTrack — Deferred Work

This file tracks work we deliberately skipped or deferred in prior fix batches so we
don't lose the context. Add new items to the top of the relevant section.

---

## 🧪 Known edge cases — audit findings 2026-04-07

These came out of the pre-handoff critical-thinking pass. Not blockers, but
worth cleaning up before scaling the user base beyond your uncle's shop.

### DST transition day bounds (23h / 25h days)
`getLocalDayBounds` relies on `Intl.DateTimeFormat` math, which should
handle spring-forward / fall-back correctly in principle, but we have no
test covering it. On a 23-hour day, activities near the skipped hour
could theoretically land in the wrong bucket. **Action:** add a unit test
around March / November DST dates for US + EU timezones. Spot-check the
dashboard + daily summary on the next real transition day.

### Offline queue hard cap (5000 entries)
Tracker drops the oldest entry when the offline queue hits 5000. At 60s
poll that's ~83 hours of offline capacity — fine for vacations (most of
which would be `break_idle` anyway) but a user offline for 2+ weeks with
a running tracker loses the beginning of their offline period.
**Action:** persist the queue to disk (SQLite or JSON file in userData)
so it survives restarts AND isn't bounded by RAM. Also add a startup
check that warns if the queue is getting large.

### Tracker clock skew
We trust the laptop's system clock. If an employee's clock is wrong by
hours, their "today" drifts accordingly. No mitigation yet.
**Action:** have the tracker query the server's `/api/time` on boot
(endpoint doesn't exist yet) and log a warning if skew > 5 min. Do NOT
rewrite timestamps — just surface the drift to the admin.

### Email deliverability on Resend free tier
Resend's onboarding sender can't reach arbitrary recipients on free tier,
so the Team-invite flow currently shares credentials out-of-band (documented
in `admin/src/client/pages/Team.tsx`). The daily summary works fine because
the recipient is usually the owner's own email.
**Action:** (a) get a verified custom sending domain on Resend (cheap +
instant), or (b) swap to a transactional SMTP provider with no recipient
whitelist. Either unlocks real invite emails.

### Screenshot retention — per-org override
Currently a single global constant (30 days, tunable via
`SCREENSHOT_RETENTION_DAYS` env var). Fine for MVP. If an org ever needs
longer retention for compliance / audit, add a per-org column and respect
it in `screenshot-retention.ts`.

---

## 🔥 High value, not yet started

### Per-project time rollup (activities → projects/tasks) — schema added, no UI yet
**Status:** Schema is in place (migration 3 added `project_id` and `task_id`
to `activities`), but no consumer populates them yet and Reports doesn't
read them. Needs a design call on the assignment heuristic before wiring
the rest.

**Options to consider when picking this up:**
- Manual: let the employee pick an "active project" in the tracker that stamps
  every sample with `project_id` until they switch.
- Heuristic: match window title against project names / file paths (e.g.
  `"Smith-Residence.rvt"` → project "Smith Residence").
- Rule-based: admin maps `app+title pattern → project` via the
  `classification_overrides` table.

**Touchpoints (still TODO once approach picked):**
- Tracker side: stamp activities with project_id at capture time.
- Reports page: hours-per-project section, project × hourly-rate = $ billable.
- Projects page: total tracked hours per project on the card.

---

### Linux desktop tracker
**Status:** Not supported (explicitly skipped this batch per request)
**Notes:** Current tracker is Mac/Windows (Electron + `active-win`). Linux
would need a different window-title source (X11 `xdotool` / Wayland
`wlr-foreign-toplevel` + `wmctrl` fallback). README already calls this out.

---

### Desktop tracker sample interval
**Status:** Intentional — 10 s samples, 60 s sync. No fix needed; README is
now accurate.

---

## 🟡 Nice to have

### Genesis AI is "blind" outside aggregate app stats
**Status:** Caught during the 2026-04-07 evening audit. Three real
limitations of the system prompt that make Genesis hallucinate:

1. **Hallucinated formula.** Asked "what's the formula behind the
   productivity score?", Genesis answered `productive ÷ total`. The
   real formula is `productive ÷ (productive + unproductive)`. They
   coincide only when neutral + idle are zero. Fix: hard-code the
   formula in the system prompt with a "do NOT restate or invent a
   different formula" instruction.

2. **No window-title visibility.** Asked "how much time on Wix
   today?", Genesis said "I cannot identify any Wix work" even
   though the DB has 100+ snapshots of "Wix Studio | Overflow
   Plumbing & Drain". The system prompt aggregates to app names
   only. Fix: include the top 10-20 window titles per employee for
   today (not just app names) in the prompt.

3. **No timestamp / gap awareness.** Asked "did Mohammed take any
   breaks?", Genesis correctly identified that 297 snapshots × 10s
   ≈ 50m total but admitted it can't see when those snapshots
   happened. The 9h45m work-day gap (laptop slept) is invisible.
   Fix: include first/last activity timestamp + biggest-gap minutes
   in the prompt so Genesis can call out work-day gaps.

### Tracker auto-restart on macOS / Windows boot
**Status:** Live-audit caught this. The user's local Electron
tracker has been running since Friday 1 AM, but today the activity
table has a 9h 45m gap from 9:09 AM PST to 6:54 PM PST (the user's
work day). The Mac was lid-closed / sleeping at the actual job site,
which kills Electron CPU time. There is no auto-restart-on-wake or
launch-on-boot today.

**Fix path:**
- Mac: ship a launchd plist (e.g.
  `/Library/LaunchAgents/com.archtrack.tracker.plist`) with
  `RunAtLoad: true`, `KeepAlive: true`, plus
  `com.apple.launchd.LimitLoadToSessionType: Aqua` so it launches
  with the user's GUI session. Bundle as a one-line install
  command in the README.
- Windows: ship a Scheduled Task (`schtasks /create ...`) or
  HKCU\Run registry entry. Same idea.
- Document the laptop-sleeps-during-work-day pitfall in the
  permissions section of the README so admins know to expect gaps
  on portable machines.

### Local desktop tracker rebuild instructions
**Status:** Caught during the 2026-04-07 audit. The user's running
Electron process was started Fri 01 AM, BEFORE the new screenshot
capture loop and stealth-mode flag were added. Even though
admin/data has the new server-side fixer, the user's LOCAL tracker
is still the old build and:
  - won't capture screenshots until rebuilt
  - won't honor ARCHTRACK_STEALTH=1
  - has the broken x.com social_media classifier (server-side
    rescue path catches the false positives but the desktop
    tracker is still mislabeling at write time)

**Fix:** README needs a "Rebuilding your local tracker after a
ArchTrack update" section:
  ```
  cd Archtrack/desktop
  npm install
  npm run dev   # rebuilds + restarts Electron
  ```
And ideally an in-app banner on the Dashboard when the tracker's
last activity was generated by an old shared/classifier version
(we'd need to ship a tracker-version field on the activity payload
to make that detection possible).

### Per-org / per-employee classification overrides UI
**Status:** Backend table `classification_overrides` exists, no UI.
Caught the need during 2026-04-07 audit: "Overflow Plumbing" is the
user's uncle's actual business name, and the user has been editing
their Wix site all evening. The fixer caught the Wix admin pages
generically, but we couldn't classify the bare "Home | Overflow
Plumbing & Drain" or "the gald - Google Search" pages because they
don't match any generic SaaS pattern. A per-org override
("anything containing 'Overflow Plumbing' = core_work") would
solve this without bloating the global classifier list.

### Activity feed pagination + filters
**Status:** Partially fixed (system-app filter added, sort tie-breaker added)
**Remaining:** "Load more", employee filter, category filter in the UI.

### Classification overrides UI
**Status:** Backend table exists (`classification_overrides`), no UI.
**Scope:** Admin marks a specific app/window title → category mapping org-wide
or per-employee. Genesis can suggest these from suspicious patterns. Pairs
naturally with the per-project rollup heuristic above.

### Multi-admin role management
**Status:** Users table has `role` but no UI to invite a second admin.

### Data export (CSV/PDF)
**Status:** Genesis AI can summarize, daily summary email goes out, but no
raw CSV/PDF export for payroll/invoicing.

### `time_entries` legacy table physical drop
**Status:** Endpoints + helpers now return a `Deprecation` HTTP header with a
`Sunset: 2026-05-01` value. After May 1 we can delete the table, the
helpers in `database.ts`, the routes in `routes.ts`, and the `TimeEntry`
type. Nothing in the current tracker writes to it.

---

## ✅ Completed in the 2026-04-06 / 2026-04-07 fix batches

### 2026-04-07 batch (uncle's feedback + DEFERRED cleanup)
- **Stealth mode** for the desktop tracker (`ARCHTRACK_STEALTH=1` env var or
  store flag) — no tray icon, no dock icon on macOS, silent boot.
- **Periodic screenshots** captured by the tracker (Electron `desktopCapturer`,
  JPEG q=70, ~250 KB each). Stored at
  `data/uploads/screenshots/<orgId>/<employeeId>/<YYYY-MM-DD>/<id>.jpg`,
  served via `/uploads`. New `Screenshots` admin page with grid + lightbox
  + per-screenshot delete + retention auto-cleanup.
- **Daily email summary** — `daily-summary.ts` builds a per-employee summary
  using the unified productivity formula, renders an HTML email body, and
  the 1-minute scheduler dispatches it at each org's configured local hour
  via `nodemailer`. New `DailySummary` admin page mirrors the same data
  for in-app preview + manual "Send now" button. SMTP creds via
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` env vars
  (cron still runs and updates state if SMTP is missing — only the
  actual mail send is gated).
- **Genesis AI formula** unified to use `computeProductivityStats`. The
  4 SQL `AVG(productivity_score)` queries in `ai-routes-llm.ts` were
  replaced with bucket-based productive/unproductive sums, so Genesis
  now quotes the same numbers as Dashboard + Reports.
- **Edit Employee Update-after-BH-toggle** — added `noValidate` on the
  form so HTML5 native validation can't silently block submit, plus the
  loosened `HH:MM:SS` regex from the prior batch.
- **`time_entries` deprecation headers** — `Deprecation: true`,
  `Sunset: 2026-05-01`, `Link: rel="successor-version"`. Schedule for
  full removal logged above.
- **Migration 3** — adds `screenshots` table, `daily_summary_*` and
  `screenshots_*` columns on organizations, `project_id`/`task_id` on
  activities (for the future per-project rollup).
- **Org Settings modal** expanded with toggles for daily summary (recipient
  + hour) and screenshots (interval + retention).
- **Sidebar nav** gets new entries for **📧 Daily Summary** and
  **📷 Screenshots** (desktop and mobile).

### 2026-04-06 batch
- Timezone-aware "today" queries (org + admin browser tz)
- Unified productivity formula via shared `computeProductivityStats`
- Precise duration formatting (`1h 23m` instead of `1.0h`)
- Dashboard % no longer flickers on every sample
- Business hours per employee + outside-hours bucket on Reports
- Currency field per employee (15 common currencies)
- Company logo upload + Org Settings modal
- Admin role override UI in Edit Employee
- Activity feed filters system apps + stable ordering
- Project / Task DELETE endpoints + UI buttons + cascade
- Project budget label respects org default currency
- README: Mac + Windows permission instructions, accurate sync intervals
