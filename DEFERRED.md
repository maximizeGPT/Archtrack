# ArchTrack — Deferred Work

This file tracks work we deliberately skipped or deferred in prior fix batches so we
don't lose the context. Add new items to the top of the relevant section.

---

## 🔥 High value, not yet started

### Per-project time rollup (activities → projects/tasks)
**Status:** Deferred (design discussion needed)
**Why:** Right now `activities` has no `project_id` / `task_id` column, so Reports has
zero connection to Projects or Tasks. The pitch "track time per client" is therefore
unfulfilled — no billable report, no $/hours-per-project.

**Options to consider when picking this up:**
- Manual: let the employee pick an "active project" in the tracker that stamps
  every sample with `project_id` until they switch.
- Heuristic: match window title against project names / file paths (e.g.
  `"Smith-Residence.rvt"` → project "Smith Residence").
- Rule-based: admin maps `app+title pattern → project`.

**Touchpoints:**
- Add `project_id` and `task_id` columns to `activities` (nullable).
- New Reports section: hours-per-project, project × hourly-rate = $ billable.
- Projects page: show total hours tracked per project.

---

### Linux desktop tracker
**Status:** Not supported today
**Notes:** Current tracker is Mac/Windows (Electron + `get-windows`). Linux would
need a different window-title source (X11 `xdotool` / Wayland `wlr-foreign-toplevel`
+ a `wmctrl`-based fallback). Callout in README already.

---

### time_entries legacy table cleanup
**Status:** Deferred
**Notes:** `time_entries` table is still in the schema with write helpers in
`database.ts:625-662`, but nothing actively writes to it — `activities` is the
source of truth. Safe to drop after one release cycle once we're sure nothing
imports it.

---

### Desktop tracker sample interval
**Status:** Intentional — 10 s samples, 60 s sync
**Notes:** Was flagged in the README audit as a "bug" because README said 30 s.
Fix was to update the README; code is correct. If battery/network cost becomes
an issue we can bump to 15 s, but it would reduce granularity.

---

## 🟡 Nice to have

### Activity feed pagination + filters
**Status:** Partially fixed (system-app filter added, sort tie-breaker added)
**Remaining:** "Load more", employee filter, category filter in the UI.

### Classification overrides UI
**Status:** Backend table exists (`classification_overrides`), no UI.
**Scope:** Admin marks a specific app/window title → category mapping org-wide or
per-employee. Genesis can suggest these from suspicious patterns.

### Multi-admin role management
**Status:** Users table has `role` but no UI to invite a second admin.

### Data export (CSV/PDF)
**Status:** Genesis AI can summarize, but no raw export for payroll/invoicing.

---

## ✅ Completed in the 2026-04-06 fix batch

See `git log --grep="fix batch 2026-04-06"` for the commits. Summary:
- Timezone-aware "today" queries (org + admin browser tz)
- Unified productivity formula via shared `computeProductivityStats`
- Precise duration formatting (`1h 23m` instead of `1.0h`)
- Dashboard % no longer flickers on every sample
- Business hours per employee + outside-hours bucket on Reports
- Currency field per employee (15 common currencies)
- Company logo upload + Org Settings modal
- Admin role override UI in Edit Employee
- Activity feed filters system apps + stable ordering
- README: Mac + Windows permission instructions, accurate sync intervals
