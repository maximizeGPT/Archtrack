# ArchTrack Tracker Fixes - March 28, 2026

## Issues Fixed

### 1. System Processes Flagged as Suspicious
**Problem:** `loginwindow` and other macOS system processes were being recorded and flagged as suspicious activities (16,191 false positives).

**Fix:** 
- Added `SYSTEM_PROCESSES_TO_IGNORE` array in `classifier.ts`
- System processes are now skipped entirely in `tracker.ts` before classification
- System processes are never marked as suspicious even if they slip through

### 2. Excessive Idle Detection
**Problem:** Idle threshold was 2 minutes, causing frequent "away from desk" entries and breaking productivity calculations.

**Fix:**
- Increased idle threshold from 2 minutes to 5 minutes (300 seconds)
- Idle entries are now recorded once per session instead of every 10 seconds
- Prevents spamming the activity log with idle entries

### 3. Overly Aggressive Suspicious Detection
**Problem:** Thresholds were too sensitive:
- 5 minutes of no input = suspicious
- 30 minutes in same window = suspicious

**Fix:**
- `idleThresholdMinutes`: 5 → 15 minutes
- `sameWindowMinutes`: 30 → 60 minutes
- More realistic for focused work like reading documentation or watching tutorials

### 4. "Untitled" Windows
**Problem:** Windows with "Untitled" title were being tracked (system dialogs, lock screens).

**Fix:**
- System processes check now filters out lock screen and system windows
- "Untitled" from actual apps (like new TextEdit documents) will still be tracked correctly

## Files Modified

1. **`desktop/src/tracker.ts`**
   - Added system process filtering before activity recording
   - Increased idle threshold from 120s to 300s
   - Improved idle entry deduplication

2. **`desktop/src/classifier.ts`**
   - Added `SYSTEM_PROCESSES_TO_IGNORE` constant
   - Added system process classification rule
   - Modified suspicious detection to skip system processes
   - Relaxed suspicious thresholds for realistic work patterns

## Testing Recommendations

1. **Restart the tracker** to apply changes
2. **Leave computer idle for 10+ minutes** - should record only 1 idle entry
3. **Lock screen** - should not create any activity entries
4. **Work normally for 30+ minutes** in same window - should not be flagged as suspicious
5. **Check reports** after a day - should see realistic productivity scores

## Expected Behavior After Fix

- **No more `loginwindow` entries** in reports
- **Fewer idle entries** (only when actually away for 5+ minutes)
- **Higher productivity scores** (idle time properly categorized)
- **No false suspicious alerts** for normal work patterns
- **Accurate total hours** (excluding system/lock screen time)
