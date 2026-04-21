import { powerMonitor, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getServerUrl, ARCHTRACK_CONFIG } from './config.js';
import {
  classifyActivity,
  calculateTrueProductivity,
  detectGamingAttempts,
  generateDailySummary,
  ActivityClassification,
  ActivityCategory,
  SUSPICIOUS_THRESHOLDS
} from './classifier.js';
import { startScreenshotService } from './screenshot.js';

// Dynamic import for active-win (ESM module)
let activeWin: any = null;

interface RawActivity {
  timestamp: string;
  windowTitle: string;
  appName: string;
  idleTimeMs: number;
}

interface TrackedActivity {
  id: string;
  timestamp: string;
  appName: string;
  windowTitle: string;
  category: ActivityCategory;
  categoryName: string;
  productivityScore: number;
  productivityLevel: 'productive' | 'neutral' | 'unproductive' | 'idle';
  isSuspicious: boolean;
  suspiciousReason?: string;
  isIdle: boolean;
  idleTimeSeconds: number;
  durationSeconds: number;
  hasInputActivity: boolean;
}

interface Config {
  employeeId: string;
  employeeName: string;
  serverUrl: string;
  deviceToken?: string;
}

// Activity tracking state
const activities: TrackedActivity[] = [];
const offlineQueue: TrackedActivity[] = [];
let lastActivity: TrackedActivity | null = null;
let lastSyncTime = 0;
let isOnline = true;

// Context for pattern detection
let currentAppStartTime = Date.now();
let lastInputTime = Date.now();
let windowChangeCount = 0;
let lastWindowTitle = '';
let lastAppName = '';
let lastCheckTime = Date.now();
let consecutiveIdleChecks = 0;

// Store config (simple JSON file)
let config: Config = {
  employeeId: ARCHTRACK_CONFIG.defaults.employeeId,
  employeeName: ARCHTRACK_CONFIG.defaults.employeeName,
  serverUrl: getServerUrl(),
  deviceToken: ARCHTRACK_CONFIG.deviceToken || ''
};

export async function startTracking(): Promise<void> {
  console.log('🚀 Starting ArchTrack smart activity tracking...');

  // Load config
  loadConfig();

  // First-run activation: if no device token is saved, look for an
  // activation file in Downloads (dropped by the admin dashboard's
  // "Install on this device" flow) and redeem it for a device JWT.
  if (!config.deviceToken) {
    await activateFromDownloadsIfNeeded();
  }

  console.log(`Auth: token=${config.deviceToken ? 'present (' + config.deviceToken.length + ' chars)' : 'MISSING'}, server=${config.serverUrl}`);

  // Load active-win dynamically
  try {
    const activeWinModule = await import('active-win');
    activeWin = activeWinModule.default || activeWinModule;
    console.log('✓ active-win library loaded');
  } catch (err) {
    console.error('Failed to load active-win:', err);
    console.log('⚠️ Running in mock mode for testing');
  }

  // Load offline queue
  loadOfflineQueue();

  // Check every 10 seconds for activity
  setInterval(checkActivity, 10000);

  // Sync to server every 60 seconds
  setInterval(syncToServer, 60000);

  // Check online status
  setInterval(checkOnlineStatus, 30000);

  // Periodic screenshot capture — controlled by org-level settings on the
  // server. Polls /api/organization to discover the current toggle and
  // interval, and uploads via /api/screenshots when enabled.
  startScreenshotService(
    () => config.deviceToken || '',
    () => ({
      appName: lastActivity?.appName,
      windowTitle: lastActivity?.windowTitle
    })
  );

  console.log('✓ Smart tracking active');
  console.log('✓ Employee:', config.employeeName, `(${config.employeeId})`);
  console.log('✓ Server:', config.serverUrl);
  console.log('');
  console.log('📊 Tracking:');
  console.log('  • Core work activities');
  console.log('  • Communication (Slack, Teams, Email)');
  console.log('  • Idle time detection');
  console.log('  • Suspicious patterns (video idle, ghost presence)');
  console.log('');
}

async function checkActivity(): Promise<void> {
  try {
    const now = Date.now();
    const timeSinceLastCheck = (now - lastCheckTime) / 1000;
    lastCheckTime = now;

    // Detect tracker-suspended gaps (lunch / macOS App Nap / laptop lid).
    // The setInterval normally fires every 10s. Anything bigger than ~2
    // minutes means the process was paused while the user was away, and
    // powerMonitor.getSystemIdleTime() will read near-zero on the very
    // first check after wake (the user just moved the mouse), so the
    // normal AFK-cutoff branch below would never trigger for this gap.
    // Backfill ONE break_idle row covering the gap so the dashboard
    // reconciles with wall-clock time. The lastActivity pointer is set
    // to this row so the next normal sample's gap calc starts fresh.
    if (timeSinceLastCheck > 120) {
      const gapStartMs = now - Math.round(timeSinceLastCheck * 1000);
      const idleGap: TrackedActivity = {
        id: generateId(),
        timestamp: new Date(gapStartMs).toISOString(),
        appName: 'Idle',
        windowTitle: 'Away from desk (tracker suspended)',
        category: 'break_idle',
        categoryName: 'Break/Idle',
        productivityScore: 0,
        productivityLevel: 'idle',
        isSuspicious: false,
        suspiciousReason: undefined,
        isIdle: true,
        idleTimeSeconds: Math.round(timeSinceLastCheck),
        durationSeconds: Math.round(timeSinceLastCheck),
        hasInputActivity: false
      };
      activities.push(idleGap);
      offlineQueue.push(idleGap);
      if (offlineQueue.length > 5000) {
        offlineQueue.splice(0, offlineQueue.length - 5000);
      }
      lastActivity = idleGap;
      console.log(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] 💤 GAP | Backfilled ${Math.round(timeSinceLastCheck / 60)}m of idle (tracker was suspended)`);
    }

    // Get system idle time (in milliseconds, convert to seconds)
    const idleTimeMs = powerMonitor.getSystemIdleTime();
    const idleTimeSec = Math.floor(idleTimeMs / 1000);

    // Detect input activity (no idle for last few seconds = active)
    const hasInputActivity = idleTimeSec < 3;
    if (hasInputActivity) {
      lastInputTime = now;
      consecutiveIdleChecks = 0;
    } else {
      consecutiveIdleChecks++;
    }

    // Get active window info
    let windowTitle = 'Unknown';
    let appName = 'Unknown';

    if (activeWin) {
      try {
        const winInfo = await activeWin();
        if (winInfo) {
          windowTitle = winInfo.title || 'Untitled';
          appName = winInfo.owner?.name || winInfo.owner?.bundleId || 'Unknown';
        }
      } catch (err) {
        // No mock data - just log error and skip this check
        console.error('Failed to get active window:', err);
        return; // Skip recording this cycle
      }
    } else {
      // No active-win library - skip recording
      console.log('active-win not available, skipping tracking');
      return; // Skip recording this cycle
    }

    // FIX: Skip system processes that shouldn't be tracked as employee activity
    const systemProcesses = [
      'loginwindow', 'window server', 'kernel', 'system', 'login window',
      'screen saver', 'screensaver', 'lockscreen', 'lock screen'
    ];
    const isSystemProcess = systemProcesses.some(proc => 
      appName.toLowerCase().includes(proc) || windowTitle.toLowerCase().includes(proc)
    );
    
    if (isSystemProcess) {
      // Don't record system processes at all - they're not employee activity
      return;
    }

    // FIX: Skip recording if user has been idle for more than 5 minutes
    // This prevents tracking background apps when user is away
    // Changed from 2 minutes to 5 minutes to avoid excessive idle entries
    if (idleTimeSec > 300) {
      // Only record an idle entry once per idle session (not every 10 seconds)
      if (!lastActivity || !lastActivity.isIdle || lastActivity.appName !== 'Idle') {
        const idleActivity: TrackedActivity = {
          id: generateId(),
          timestamp: new Date().toISOString(),
          appName: 'Idle',
          windowTitle: 'User away from computer',
          category: 'break_idle',
          categoryName: 'Break/Idle',
          productivityScore: 0,
          productivityLevel: 'idle',
          isSuspicious: false,
          suspiciousReason: undefined,
          isIdle: true,
          idleTimeSeconds: idleTimeSec,
          durationSeconds: Math.round(timeSinceLastCheck),
          hasInputActivity: false
        };
        
        activities.push(idleActivity);
        offlineQueue.push(idleActivity);
        if (offlineQueue.length > 5000) {
          offlineQueue.splice(0, offlineQueue.length - 5000);
        }
        lastActivity = idleActivity;
        
        console.log(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] 💤 IDLE | User away for ${Math.round(idleTimeSec / 60)} minutes`);
      }
      return; // Skip the rest of the tracking
    }

    // Track window changes
    if (windowTitle !== lastWindowTitle) {
      windowChangeCount++;
      lastWindowTitle = windowTitle;
    }

    // Track app changes
    if (appName !== lastAppName) {
      currentAppStartTime = now;
      lastAppName = appName;
      windowChangeCount = 0;
    }

    // Calculate context for classification
    const durationInCurrentApp = (now - currentAppStartTime) / 60000;
    const timeSinceLastInput = (now - lastInputTime) / 60000;

    // Detect if video is likely playing
    const isVideoPlaying = (
      appName.toLowerCase().includes('youtube') ||
      appName.toLowerCase().includes('netflix') ||
      appName.toLowerCase().includes('hulu')
    ) && timeSinceLastInput > 2;

    // Classify the activity
    const classification = classifyActivity(appName, windowTitle, {
      durationMinutes: durationInCurrentApp,
      hasInputActivity,
      windowChangeCount,
      lastInputMinutesAgo: timeSinceLastInput,
      isVideoPlaying,
      isFullscreen: false
    });

    // Duration = time since the previous record's timestamp, capped at 90s.
    // The cap prevents double-counting with the idle backfill above (which
    // already covers gaps > 120s). Using the previous record's timestamp
    // (not its end) ensures no time is lost between rapid window switches.
    const lastTs = lastActivity
      ? new Date(lastActivity.timestamp).getTime()
      : now - timeSinceLastCheck * 1000;
    const gapSec = Math.min(Math.max(Math.round((now - lastTs) / 1000), 1), 90);

    // Create the activity record
    const activity: TrackedActivity = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      appName,
      windowTitle,
      category: classification.category,
      categoryName: classification.categoryName,
      productivityScore: classification.productivityScore,
      productivityLevel: classification.productivityLevel,
      isSuspicious: classification.isSuspicious,
      suspiciousReason: classification.suspiciousReason,
      isIdle: classification.isIdle,
      idleTimeSeconds: idleTimeSec,
      durationSeconds: gapSec,
      hasInputActivity
    };

    // Record activity if:
    // 1. Window/app has changed (user switched apps), OR
    // 2. It's been 60 seconds since last recorded activity (heartbeat), OR
    // 3. The activity is suspicious.
    //
    // The AFK cutoff above (idleTimeSec > 300) already drops snapshots when
    // the user is genuinely away for 5+ minutes. Between 0 and 5 minutes of
    // input inactivity the user is *present* — reading, watching a video, in
    // a meeting — and we MUST keep recording, otherwise an honest 60-minute
    // work session shows up as 15 minutes on the dashboard. (Previously the
    // record gate also AND'd on `idleTimeSec < 30`, which silently dropped
    // every snapshot during a reading session.)
    const windowChanged = !lastActivity ||
      lastActivity.appName !== activity.appName ||
      lastActivity.windowTitle !== activity.windowTitle;
    const significantTimePassed = !lastActivity ||
      (Date.now() - new Date(lastActivity.timestamp).getTime()) >= 60000;

    const shouldRecord = windowChanged || significantTimePassed || classification.isSuspicious;

    if (shouldRecord) {
      activities.push(activity);
      offlineQueue.push(activity);
      if (offlineQueue.length > 5000) {
        offlineQueue.splice(0, offlineQueue.length - 5000);
      }
      lastActivity = activity;

      logActivity(activity);

      if (classification.isSuspicious) {
        console.warn(`⚠️  SUSPICIOUS: ${classification.suspiciousReason}`);
      }
    }

    if (activities.length > 2000) {
      activities.splice(0, activities.length - 1000);
    }

  } catch (err) {
    console.error('Error checking activity:', err);
  }
}

function logActivity(activity: TrackedActivity): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });

  let icon = '⚪';
  if (activity.productivityLevel === 'productive') icon = '🟢';
  else if (activity.productivityLevel === 'idle') icon = '💤';
  else if (activity.productivityLevel === 'unproductive') icon = '🔴';
  else if (activity.productivityLevel === 'neutral') icon = '🟡';

  const idleStr = activity.isIdle ? ' [IDLE]' : '';
  const suspiciousStr = activity.isSuspicious ? ' ⚠️' : '';

  console.log(
    `[${time}] ${icon} ${activity.appName}` +
    ` | ${activity.categoryName}` +
    ` | Score: ${activity.productivityScore}` +
    `${idleStr}${suspiciousStr}`
  );

  if (activity.windowTitle.length > 50) {
    console.log(`     "${activity.windowTitle.substring(0, 50)}..."`);
  } else {
    console.log(`     "${activity.windowTitle}"`);
  }

  if (activity.suspiciousReason) {
    console.log(`     ⚠️ ${activity.suspiciousReason}`);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function syncToServer(): Promise<void> {
  if (offlineQueue.length === 0) return;

  if (!isOnline) {
    console.log(`📴 Offline - ${offlineQueue.length} activities queued for later`);
    saveOfflineQueue();
    return;
  }

  // Process in batches of 50 to avoid payload too large
  const BATCH_SIZE = 50;
  let totalSynced = 0;
  let totalSuspicious = 0;

  while (offlineQueue.length > 0) {
    const batchSize = Math.min(BATCH_SIZE, offlineQueue.length);
    const batch = offlineQueue.splice(0, batchSize);

    try {
      const payload = {
        employeeId: config.employeeId,
        activities: batch.map(a => ({
          id: a.id,
          timestamp: a.timestamp,
          appName: a.appName,
          windowTitle: a.windowTitle,
          category: a.category,
          categoryName: a.categoryName,
          productivityScore: a.productivityScore,
          productivityLevel: a.productivityLevel,
          isSuspicious: a.isSuspicious,
          suspiciousReason: a.suspiciousReason,
          isIdle: a.isIdle,
          idleTimeSeconds: a.idleTimeSeconds,
          durationSeconds: a.durationSeconds
        }))
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.deviceToken) {
        headers['Authorization'] = `Bearer ${config.deviceToken}`;
      }
      console.log(`Sync: token=${config.deviceToken ? 'yes' : 'no'}, url=${config.serverUrl}, authHeader=${headers['Authorization'] ? 'set' : 'MISSING'}`);

      const response = await fetch(`${config.serverUrl}/api/activity`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = await response.text();
        console.log(`Sync response: ${response.status} ${response.statusText} - ${body}`);
      }

      if (response.ok) {
        const result: any = await response.json();
        totalSynced += batch.length;
        totalSuspicious += result.data?.suspiciousCount || 0;
      } else if (response.status === 401) {
        // Token expired or invalid — stop retrying
        console.error('Device token expired. Please re-enroll.');
        isOnline = false;
        offlineQueue.unshift(...batch);
        break;
      } else {
        offlineQueue.unshift(...batch);
        console.error(`Sync failed for batch: ${response.statusText}`);
        break;
      }
    } catch (err) {
      offlineQueue.unshift(...batch);
      isOnline = false;
      console.error('Sync error:', err);
      break;
    }
  }

  if (totalSynced > 0) {
    console.log(`✓ Synced ${totalSynced} activities`);
    if (totalSuspicious > 0) {
      console.warn(`⚠️ Server flagged ${totalSuspicious} suspicious activities`);
    }
    lastSyncTime = Date.now();
    saveOfflineQueue();
  }
}

async function checkOnlineStatus(): Promise<void> {
  try {
    const response = await fetch(`${config.serverUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    const wasOffline = !isOnline;
    isOnline = response.ok;

    if (wasOffline && isOnline && offlineQueue.length > 0) {
      console.log('🌐 Back online - syncing queued activities...');
      syncToServer();
    }
  } catch {
    isOnline = false;
  }
}

function loadConfig(): void {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = { ...config, ...saved };
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

/**
 * First-run activation: look for an `archtrack-activate*.json` file in the
 * user's Downloads folder, redeem the setup token against /api/auth/enroll,
 * and persist the returned device JWT + employee info into config.json.
 *
 * The admin dashboard's "Install on this device" button drops this file so
 * that a non-technical admin can install the tracker on an employee's
 * laptop and have it auto-authenticate without copy-pasting tokens.
 *
 * Safe to call every startup — it only runs if `config.deviceToken` is
 * empty. Returns `true` if activation succeeded, `false` otherwise. Never
 * throws.
 */
async function activateFromDownloadsIfNeeded(): Promise<boolean> {
  // Already have a device token from env var or previous run — skip.
  if (config.deviceToken) return false;

  let downloadsDir: string;
  try {
    downloadsDir = app.getPath('downloads');
  } catch {
    return false; // No downloads path on this platform — bail out silently.
  }

  if (!fs.existsSync(downloadsDir)) return false;

  // Find all archtrack-activate*.json files, pick the newest by mtime.
  let matches: { path: string; mtimeMs: number }[] = [];
  try {
    const entries = fs.readdirSync(downloadsDir);
    for (const name of entries) {
      if (!name.startsWith('archtrack-activate') || !name.endsWith('.json')) continue;
      const full = path.join(downloadsDir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) matches.push({ path: full, mtimeMs: stat.mtimeMs });
      } catch { /* ignore unreadable entries */ }
    }
  } catch (err) {
    console.warn('[activate] could not scan Downloads:', (err as Error).message);
    return false;
  }

  if (matches.length === 0) return false;

  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const target = matches[0].path;

  let payload: { setupToken?: string; token?: string; serverUrl?: string } = {};
  try {
    payload = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (err) {
    console.error('[activate] failed to parse activation file:', (err as Error).message);
    tryDeleteFile(target);
    return false;
  }

  const setupToken = payload.setupToken || payload.token;
  const serverUrl = (payload.serverUrl || config.serverUrl || '').replace(/\/+$/, '');

  if (!setupToken || !serverUrl) {
    console.error('[activate] activation file missing setupToken or serverUrl');
    tryDeleteFile(target);
    return false;
  }

  console.log(`[activate] found activation file, enrolling against ${serverUrl}...`);

  try {
    const resp = await fetch(`${serverUrl}/api/auth/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupToken })
    });
    const data: any = await resp.json().catch(() => ({}));

    if (!resp.ok || !data?.success || !data?.data?.accessToken) {
      const reason = data?.error || `HTTP ${resp.status}`;
      console.error(`[activate] enrollment rejected: ${reason}`);
      tryDeleteFile(target); // Stale/invalid token — don't retry on every launch.
      return false;
    }

    // Success — persist everything.
    config.deviceToken = data.data.accessToken;
    config.employeeId = data.data.employeeId;
    config.employeeName = data.data.employeeName;
    config.serverUrl = serverUrl;
    saveConfig();

    // Clean up ALL activation files so stale ones don't linger.
    for (const m of matches) tryDeleteFile(m.path);

    console.log(`[activate] ✓ activated as ${data.data.employeeName} (${data.data.employeeId})`);
    return true;
  } catch (err) {
    console.error('[activate] network error during enrollment:', (err as Error).message);
    // Leave the file in place — this is likely a transient offline state,
    // user may be trying to install without internet. Next launch will retry.
    return false;
  }
}

function tryDeleteFile(p: string): void {
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

function saveConfig(): void {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

function loadOfflineQueue(): void {
  try {
    const queuePath = path.join(app.getPath('userData'), 'offline-queue.json');
    if (fs.existsSync(queuePath)) {
      const data = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
      if (Array.isArray(data)) {
        offlineQueue.push(...data);
        console.log(`📦 Loaded ${data.length} queued activities from disk`);
      }
    }
  } catch (err) {
    console.error('Failed to load offline queue:', err);
  }
}

function saveOfflineQueue(): void {
  try {
    const queuePath = path.join(app.getPath('userData'), 'offline-queue.json');
    fs.writeFileSync(queuePath, JSON.stringify(offlineQueue, null, 2));
  } catch (err) {
    console.error('Failed to save offline queue:', err);
  }
}

export function setupIpcHandlers(): void {
  ipcMain.handle('tracker:getStatus', () => {
    return {
      isOnline,
      activitiesCount: activities.length,
      queuedCount: offlineQueue.length,
      lastActivity,
      config
    };
  });

  ipcMain.handle('tracker:getStats', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayActivities = activities.filter(a =>
      new Date(a.timestamp) >= today
    ).map(a => ({
      category: a.category,
      duration: a.durationSeconds,
      isIdle: a.isIdle,
      isSuspicious: a.isSuspicious,
      appName: a.appName,
      windowTitle: a.windowTitle
    }));

    return generateDailySummary(config.employeeId, todayActivities);
  });

  ipcMain.handle('tracker:getRecentActivities', () => {
    return activities.slice(-50).reverse();
  });

  ipcMain.handle('tracker:updateConfig', (_, newConfig: Partial<Config>) => {
    config = { ...config, ...newConfig };
    saveConfig();
    return config;
  });
}

export function getTrackingStatus() {
  return {
    activitiesCount: activities.length,
    queuedCount: offlineQueue.length,
    isOnline,
    lastSync: lastSyncTime ? new Date(lastSyncTime).toISOString() : null,
    lastActivity,
    config
  };
}
