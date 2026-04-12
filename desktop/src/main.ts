import { app, Tray, Menu, nativeImage, ipcMain, powerSaveBlocker } from 'electron';
import Store from 'electron-store';
import { startTracking, getTrackingStatus, setupIpcHandlers } from './tracker.js';
import { ARCHTRACK_CONFIG, getServerUrl } from './config.js';

const store = new Store({
  defaults: {
    employeeId: ARCHTRACK_CONFIG.defaults.employeeId,
    employeeName: ARCHTRACK_CONFIG.defaults.employeeName,
    serverUrl: getServerUrl()
  }
});

// Stealth mode is opt-in via env var or store flag. When on:
//   - no tray icon is created
//   - dock icon is hidden on macOS (app.dock.hide)
//   - no startup banner in console (still logs errors)
//   - the tracker still runs and uploads as normal
//
// Employees never see anything in their menubar / dock / Activity Monitor
// (process is named "archtrack-tracker" via package.json productName).
const STEALTH_MODE =
  process.env.ARCHTRACK_STEALTH === '1' ||
  process.env.ARCHTRACK_STEALTH === 'true' ||
  store.get('stealthMode') === true;

let tray: Tray | null = null;
// Hold a reference so the powerSaveBlocker isn't garbage-collected.
// Without this, macOS App Nap throttles background timers (setInterval)
// when the app has no visible window — sync/screenshot loops freeze
// indefinitely. Required for headless / LSUIElement builds.
let powerSaveBlockerId: number | null = null;

app.whenReady().then(async () => {
  // Block App Nap and idle suspension on macOS. Safe no-op on Windows/Linux.
  // 'prevent-app-suspension' lets the screen sleep but keeps the app's
  // timers running, which is exactly what a background tracker needs.
  try {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  } catch (e) {
    console.warn('[main] powerSaveBlocker failed to start:', (e as Error).message);
  }

  if (!STEALTH_MODE) {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     ArchTrack Auto-Tracker v2.1        ║');
    console.log('║  Automatic Activity Tracking System    ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
  }

  // Hide the dock icon on macOS in stealth mode so the user never sees the
  // app at all. On Windows there is no dock; the absence of a tray icon
  // already makes the app invisible.
  if (STEALTH_MODE && process.platform === 'darwin' && app.dock) {
    try { app.dock.hide(); } catch { /* ignore */ }
  }

  if (!STEALTH_MODE) {
    createTray();
  }
  setupIpcHandlers();
  await startTracking();

  if (!STEALTH_MODE) {
    console.log('');
    console.log('✓ Tracker running in background');
    console.log('✓ Detecting active windows every 10 seconds');
    console.log('✓ Syncing to admin dashboard every 60 seconds');
  }
});

function createTray(): void {
  // Simple colored square icon (green for active)
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABWSURBVDiNY2RgYPgPBAzUAIY1QLwKiP9D+Tg1oCkY1gDxw/8pDIOJ41SDa4ZRM7E0w2wYdTMxDcE0o+smhGFG3UxsM8xuRt1MbDOsbsI1jFE3E9sMtxsZ1QAAtg4Xy4eo4TkAAAAASUVORK5CYII=');

  tray = new Tray(icon);
  tray.setToolTip('ArchTrack - Activity Tracker');

  updateTrayMenu();

  // Update menu every 5 seconds to show current status
  setInterval(updateTrayMenu, 5000);
}

function updateTrayMenu(): void {
  if (!tray) return;

  const status = getTrackingStatus();
  const employeeId = store.get('employeeId');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'ArchTrack v2.1', enabled: false },
    { type: 'separator' },
    { label: `Employee: ${employeeId}`, enabled: false },
    { label: `Activities: ${status.activitiesCount}`, enabled: false },
    { label: `Queued: ${status.queuedCount}`, enabled: false },
    { label: `Status: ${status.isOnline ? '🟢 Online' : '🔴 Offline'}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setContextMenu(contextMenu);
}

app.on('window-all-closed', () => {
  // Keep running in background — never quit on window close.
});
