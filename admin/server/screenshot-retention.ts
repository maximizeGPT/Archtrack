// Screenshot retention cleanup.
//
// Prunes screenshots (both files on disk and rows in the screenshots table)
// older than SCREENSHOT_RETENTION_DAYS. Runs once on boot and then once
// per hour — there's no need for minute-granularity since retention is
// measured in days.
//
// Storage layout: admin/data/uploads/screenshots/<orgId>/<employeeId>/<YYYY-MM-DD>/<id>.jpg
// After deleting files we sweep empty date folders so `ls` on the upload
// dir stays tidy. Empty employee/org folders are left alone (cheap, and
// they'll get reused the next time that employee syncs a screenshot).

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Co-located with the upload handler in routes/summary-screenshot-routes.ts
const SCREENSHOTS_ROOT = path.join(__dirname, '../../data/uploads/screenshots');

// Default 30 days — covers two full bi-weekly payroll cycles + buffer for
// late disputes. Overridable via env var without a code change if an org
// ever needs longer retention (compliance, audit, etc.).
const SCREENSHOT_RETENTION_DAYS = (() => {
  const raw = parseInt(process.env.SCREENSHOT_RETENTION_DAYS || '', 10);
  if (Number.isFinite(raw) && raw > 0 && raw < 3650) return raw;
  return 30;
})();

async function pruneOnce(): Promise<void> {
  const cutoff = new Date(Date.now() - SCREENSHOT_RETENTION_DAYS * 86400000);
  const cutoffIso = cutoff.toISOString();
  const db = getDatabase();

  // 1) Fetch all DB rows older than cutoff so we can delete their files
  //    precisely (not by directory date — the file_path is the source of
  //    truth in case anything ever drifts).
  const stale = await db.all(
    `SELECT id, file_path FROM screenshots WHERE timestamp < ?`,
    [cutoffIso]
  );

  if (stale.length === 0) return;

  let deletedFiles = 0;
  let missingFiles = 0;

  for (const row of stale) {
    // file_path is stored as "/uploads/screenshots/<org>/<emp>/<ymd>/<id>.jpg"
    // Strip the leading "/uploads/screenshots/" to get the path relative
    // to SCREENSHOTS_ROOT.
    const relative = (row.file_path || '').replace(/^\/?uploads\/screenshots\//, '');
    if (!relative) continue;
    const abs = path.join(SCREENSHOTS_ROOT, relative);
    try {
      await fs.unlink(abs);
      deletedFiles++;
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        missingFiles++;
      } else {
        console.warn(`[retention] failed to delete ${abs}: ${e.message}`);
      }
    }
  }

  // 2) Delete DB rows in one shot
  const deletedRows = await db.run(
    `DELETE FROM screenshots WHERE timestamp < ?`,
    [cutoffIso]
  );

  // 3) Sweep empty date folders so the tree doesn't accumulate dead dirs.
  try {
    const orgs = await fs.readdir(SCREENSHOTS_ROOT).catch(() => []);
    for (const org of orgs) {
      const orgDir = path.join(SCREENSHOTS_ROOT, org);
      const emps = await fs.readdir(orgDir).catch(() => []);
      for (const emp of emps) {
        const empDir = path.join(orgDir, emp);
        const days = await fs.readdir(empDir).catch(() => []);
        for (const day of days) {
          const dayDir = path.join(empDir, day);
          try {
            const contents = await fs.readdir(dayDir);
            if (contents.length === 0) await fs.rmdir(dayDir);
          } catch { /* not a dir or race — ignore */ }
        }
      }
    }
  } catch (e) {
    console.warn('[retention] empty-folder sweep failed:', e);
  }

  console.log(
    `🗑️  Pruned ${deletedFiles} screenshots older than ${SCREENSHOT_RETENTION_DAYS}d` +
    ` (${(deletedRows as any)?.changes ?? stale.length} rows, ${missingFiles} files already gone)`
  );
}

export function startScreenshotRetentionScheduler(): void {
  const tick = async () => {
    try {
      await pruneOnce();
    } catch (e) {
      console.error('Screenshot retention tick failed:', e);
    }
  };

  // Run once on boot (after a short delay so DB + uploads dir are ready)
  // then every hour. Day-level retention doesn't need tighter cadence.
  setTimeout(tick, 30_000);
  setInterval(tick, 60 * 60 * 1000);
  console.log(`🗑️  Screenshot retention scheduler started (${SCREENSHOT_RETENTION_DAYS}d retention, hourly tick)`);
}
