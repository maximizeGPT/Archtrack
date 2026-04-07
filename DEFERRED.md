# ArchTrack — Deferred Work

This file tracks work we deliberately skipped or deferred in prior fix batches so we
don't lose the context. Add new items to the top of the relevant section.

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
