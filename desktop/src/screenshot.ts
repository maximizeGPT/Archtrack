// Periodic screenshot capture for the desktop tracker.
//
// Uses Electron's `desktopCapturer` API which works on macOS, Windows, and
// Linux without spawning a child process or showing any UI flash. The
// capture happens in-memory, gets converted to JPEG @ 70% quality, and is
// uploaded as base64 to the server's POST /api/screenshots endpoint with
// the device JWT.
//
// The interval and the on/off switch come from the server's
// /api/organization endpoint, polled once on startup and every hour after.
// Employees never need to configure anything.

import { desktopCapturer, screen } from 'electron';
import { ARCHTRACK_CONFIG, getServerUrl } from './config.js';

interface ScreenshotConfig {
  enabled: boolean;
  intervalMinutes: number;
}

interface PolledOrgSettings {
  screenshotsEnabled: boolean;
  screenshotIntervalMinutes: number;
}

let currentConfig: ScreenshotConfig = { enabled: false, intervalMinutes: 10 };
let captureTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;

/**
 * Read the current device token from the tracker config (we don't have a
 * cleaner shared accessor in this module, so we re-read it from the same
 * userData file the tracker uses).
 */
function readDeviceToken(getCurrentToken: () => string): string {
  return getCurrentToken();
}

/**
 * Capture the primary display, encode as JPEG, and upload to the server.
 */
async function captureAndUpload(getCurrentToken: () => string, getCurrentContext: () => { appName?: string; windowTitle?: string }): Promise<void> {
  try {
    const primary = screen.getPrimaryDisplay();
    const { width, height } = primary.size;
    // 1280px max width keeps each screenshot under ~250 KB at JPEG q=70.
    const targetWidth = Math.min(width, 1280);
    const targetHeight = Math.round((height / width) * targetWidth);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: targetWidth, height: targetHeight }
    });
    if (sources.length === 0) return;

    const thumb = sources[0].thumbnail;
    if (thumb.isEmpty()) return;

    const jpegBuffer = thumb.toJPEG(70);
    const dataBase64 = jpegBuffer.toString('base64');

    const token = readDeviceToken(getCurrentToken);
    if (!token) {
      console.warn('[screenshot] no device token, skipping upload');
      return;
    }

    const ctx = getCurrentContext();
    const serverUrl = getServerUrl();
    const res = await fetch(`${serverUrl}/api/screenshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        dataBase64,
        capturedAt: new Date().toISOString(),
        appName: ctx.appName || null,
        windowTitle: ctx.windowTitle || null,
        width: targetWidth,
        height: targetHeight
      })
    });

    if (res.status === 403) {
      // Org disabled screenshots — stop the capture loop until the next
      // poll re-enables it.
      console.log('[screenshot] org disabled screenshots, pausing capture loop');
      stopCaptureLoop();
      return;
    }

    if (!res.ok) {
      console.warn('[screenshot] upload failed:', res.status, res.statusText);
    }
  } catch (e) {
    console.warn('[screenshot] capture failed:', (e as Error).message);
  }
}

/**
 * Poll the server for the current screenshot policy. The org admin can
 * change the toggle / interval at any time and we want the running tracker
 * to pick it up without a restart.
 */
async function fetchSettings(getCurrentToken: () => string): Promise<PolledOrgSettings | null> {
  try {
    const token = getCurrentToken();
    if (!token) return null;
    const serverUrl = getServerUrl();
    const res = await fetch(`${serverUrl}/api/organization`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const json = await res.json() as { success: boolean; data?: PolledOrgSettings };
    if (!json.success || !json.data) return null;
    return {
      screenshotsEnabled: !!json.data.screenshotsEnabled,
      screenshotIntervalMinutes: typeof json.data.screenshotIntervalMinutes === 'number'
        ? json.data.screenshotIntervalMinutes
        : 10
    };
  } catch {
    return null;
  }
}

function startCaptureLoop(intervalMs: number, getCurrentToken: () => string, getCurrentContext: () => { appName?: string; windowTitle?: string }): void {
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = setInterval(() => captureAndUpload(getCurrentToken, getCurrentContext), intervalMs);
  // Fire one immediately so the admin sees activity right away after enabling.
  setTimeout(() => captureAndUpload(getCurrentToken, getCurrentContext), 5000);
  console.log(`[screenshot] capture loop started, every ${intervalMs / 60000} minutes`);
}

function stopCaptureLoop(): void {
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
    console.log('[screenshot] capture loop stopped');
  }
}

/**
 * Public entry point — starts the polling loop and (if enabled) the
 * capture loop. Re-checks org settings every hour.
 */
export function startScreenshotService(
  getCurrentToken: () => string,
  getCurrentContext: () => { appName?: string; windowTitle?: string }
): void {
  const reconcile = async () => {
    const settings = await fetchSettings(getCurrentToken);
    if (!settings) return;

    const intervalChanged = settings.screenshotIntervalMinutes !== currentConfig.intervalMinutes;
    const enabledChanged = settings.screenshotsEnabled !== currentConfig.enabled;
    currentConfig = {
      enabled: settings.screenshotsEnabled,
      intervalMinutes: settings.screenshotIntervalMinutes
    };

    if (settings.screenshotsEnabled) {
      if (enabledChanged || intervalChanged || !captureTimer) {
        startCaptureLoop(settings.screenshotIntervalMinutes * 60 * 1000, getCurrentToken, getCurrentContext);
      }
    } else {
      if (captureTimer) stopCaptureLoop();
    }
  };

  // Reconcile shortly after boot, then every hour.
  setTimeout(reconcile, 7000);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(reconcile, 60 * 60 * 1000);
}
