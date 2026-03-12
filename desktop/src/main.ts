import { app, Tray, Menu, nativeImage, ipcMain } from 'electron';
import Store from 'electron-store';
import { startTracking, getTrackingStatus, setupIpcHandlers } from './tracker.js';

const store = new Store({
  defaults: { 
    employeeId: 'emp-001', 
    employeeName: 'Mohammed', 
    serverUrl: 'http://localhost:3001' 
  }
});

let tray: Tray | null = null;

app.whenReady().then(async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     ArchTrack Auto-Tracker v2.0        ║');
  console.log('║  Automatic Activity Tracking System    ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');

  createTray();
  setupIpcHandlers();
  await startTracking();

  console.log('');
  console.log('✓ Tracker running in background');
  console.log('✓ Detecting active windows every 5 seconds');
  console.log('✓ Syncing to admin dashboard every 30 seconds');
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
    { label: 'ArchTrack v2.0', enabled: false },
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
  // Keep running in background
});
