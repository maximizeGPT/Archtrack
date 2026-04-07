// Daily summary + screenshots HTTP endpoints.
//
// Daily summary:
//   GET  /api/reports/daily-summary?date=YYYY-MM-DD  → JSON summary
//   GET  /api/reports/daily-summary/preview          → HTML preview (rendered email body)
//   POST /api/reports/daily-summary/send             → manually trigger an email send
//
// Screenshots:
//   POST   /api/screenshots             → upload (device-auth: tracker pushes here)
//   GET    /api/screenshots             → list, scoped to org, optional filters
//   GET    /api/screenshots/:id         → metadata (URL is in file_path)
//   DELETE /api/screenshots/:id         → admin removes a single screenshot
//
// Storage: admin/data/uploads/screenshots/<orgId>/<employeeId>/<YYYY-MM-DD>/<id>.jpg
// Served via the /uploads static mount in index.ts.

import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireDeviceAuth } from '../auth.js';
import { getDatabase } from '../database.js';
import { buildDailySummary, renderDailySummaryHtml, sendDailySummaryEmail } from '../daily-summary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// admin/data/uploads/screenshots — co-located with the logo upload dir.
const SCREENSHOTS_ROOT = path.join(__dirname, '../../../data/uploads/screenshots');
const MAX_SCREENSHOT_BYTES = 4_000_000; // 4 MB hard cap per upload

const ALLOWED_SCREENSHOT_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/jpeg':
    default: return 'jpg';
  }
}

export function setupSummaryScreenshotRoutes(app: Express): void {
  if (!fs.existsSync(SCREENSHOTS_ROOT)) {
    fs.mkdirSync(SCREENSHOTS_ROOT, { recursive: true });
  }

  // ----- Daily summary -----------------------------------------------------

  app.get('/api/reports/daily-summary', requireAuth, async (req: Request, res: Response) => {
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const summary = await buildDailySummary(req.orgId!, date);
      res.json({ success: true, data: summary });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  app.get('/api/reports/daily-summary/preview', requireAuth, async (req: Request, res: Response) => {
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const summary = await buildDailySummary(req.orgId!, date);
      const html = renderDailySummaryHtml(summary);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send(`<pre>${String(e)}</pre>`);
    }
  });

  app.post('/api/reports/daily-summary/send', requireAuth, async (req: Request, res: Response) => {
    try {
      const date = typeof req.body?.date === 'string' ? req.body.date : undefined;
      const result = await sendDailySummaryEmail(req.orgId!, date);
      res.json({
        success: true,
        sent: result.sent,
        reason: result.reason,
        recipient: result.recipient
      });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // ----- Screenshots -------------------------------------------------------

  // Tracker uploads screenshots via device JWT auth. Body shape:
  //   { mimeType, dataBase64, capturedAt?, appName?, windowTitle?, width?, height? }
  // Server enforces the org-level screenshots_enabled flag. If disabled, the
  // upload is rejected with 403 so the tracker stops asking.
  app.post('/api/screenshots', requireDeviceAuth, async (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const orgRow = await db.get(
        `SELECT screenshots_enabled FROM organizations WHERE id = ?`,
        [req.orgId!]
      );
      if (!orgRow?.screenshots_enabled) {
        return res.status(403).json({ success: false, error: 'screenshots disabled for this organization' });
      }

      const { mimeType, dataBase64, capturedAt, appName, windowTitle, width, height } = req.body || {};
      if (typeof mimeType !== 'string' || !ALLOWED_SCREENSHOT_MIME.has(mimeType)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported mimeType. Allowed: ${Array.from(ALLOWED_SCREENSHOT_MIME).join(', ')}`
        });
      }
      if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
        return res.status(400).json({ success: false, error: 'dataBase64 is required' });
      }
      const stripped = dataBase64.replace(/^data:[^;]+;base64,/, '');
      let buf: Buffer;
      try {
        buf = Buffer.from(stripped, 'base64');
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid base64 payload' });
      }
      if (buf.byteLength === 0) {
        return res.status(400).json({ success: false, error: 'Empty screenshot payload' });
      }
      if (buf.byteLength > MAX_SCREENSHOT_BYTES) {
        return res.status(413).json({
          success: false,
          error: `Screenshot too large. Max ${MAX_SCREENSHOT_BYTES / 1000}kB.`
        });
      }

      const ts = capturedAt && typeof capturedAt === 'string' ? new Date(capturedAt) : new Date();
      if (isNaN(ts.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid capturedAt timestamp' });
      }
      const ymd = ts.toISOString().slice(0, 10);
      const id = uuidv4();
      const ext = mimeToExt(mimeType);
      const fileName = `${id}.${ext}`;

      const dir = path.join(SCREENSHOTS_ROOT, req.orgId!, req.employeeId!, ymd);
      fs.mkdirSync(dir, { recursive: true });
      const fullPath = path.join(dir, fileName);
      fs.writeFileSync(fullPath, buf);

      const relativePath = `/uploads/screenshots/${req.orgId}/${req.employeeId}/${ymd}/${fileName}`;
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO screenshots
          (id, org_id, employee_id, timestamp, file_path, file_size_bytes, width, height, app_name, window_title, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.orgId!,
          req.employeeId!,
          ts.toISOString(),
          relativePath,
          buf.byteLength,
          typeof width === 'number' ? width : null,
          typeof height === 'number' ? height : null,
          typeof appName === 'string' ? appName : null,
          typeof windowTitle === 'string' ? windowTitle : null,
          now
        ]
      );

      // Best-effort retention cleanup: delete screenshots older than the
      // org's retention window. Cheap query, no need for a separate cron.
      try {
        const retDays = (await db.get(
          `SELECT screenshot_retention_days FROM organizations WHERE id = ?`,
          [req.orgId!]
        ))?.screenshot_retention_days || 7;
        const cutoff = new Date(Date.now() - retDays * 86400000).toISOString();
        const old = await db.all(
          `SELECT id, file_path FROM screenshots WHERE org_id = ? AND timestamp < ?`,
          [req.orgId!, cutoff]
        );
        for (const row of old) {
          try {
            const fp = path.join(__dirname, '../../../data', row.file_path.replace(/^\/uploads\//, 'uploads/'));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
          } catch { /* swallow */ }
        }
        if (old.length > 0) {
          await db.run(
            `DELETE FROM screenshots WHERE org_id = ? AND timestamp < ?`,
            [req.orgId!, cutoff]
          );
        }
      } catch (cleanupErr) {
        console.warn('Screenshot retention cleanup failed:', cleanupErr);
      }

      res.json({ success: true, data: { id, fileUrl: relativePath } });
    } catch (e) {
      console.error('Screenshot upload failed:', e);
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // List screenshots — admin reads via dashboard JWT auth.
  // Filters: ?employeeId=...&date=YYYY-MM-DD&limit=...
  app.get('/api/screenshots', requireAuth, async (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const wheres: string[] = ['org_id = ?'];
      const params: any[] = [req.orgId!];

      if (typeof req.query.employeeId === 'string') {
        wheres.push('employee_id = ?');
        params.push(req.query.employeeId);
      }
      if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
        // Convert the local YYYY-MM-DD into a [startUtc, endUtc) range
        // using either the explicitly-provided ?tz= or the org's timezone
        // (or UTC). Filing by substr(timestamp, 1, 10) was a bug because
        // timestamps are stored in UTC, so a 9 PM PST screenshot lands on
        // the next UTC day and got hidden when the picker showed "today".
        const { resolveTimezone, getLocalDateRangeBounds } = await import('../timezone.js');
        const orgRow = await db.get(
          `SELECT timezone FROM organizations WHERE id = ?`,
          [req.orgId!]
        );
        const tz = resolveTimezone(
          (typeof req.query.tz === 'string' && req.query.tz) || orgRow?.timezone
        );
        const [startUtc, endUtc] = getLocalDateRangeBounds(req.query.date, req.query.date, tz);
        wheres.push('timestamp >= ? AND timestamp < ?');
        params.push(startUtc, endUtc);
      }

      const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);

      const rows = await db.all(
        `SELECT id, employee_id, timestamp, file_path, file_size_bytes, width, height, app_name, window_title, created_at
         FROM screenshots
         WHERE ${wheres.join(' AND ')}
         ORDER BY timestamp DESC
         LIMIT ?`,
        [...params, limit]
      );
      res.json({
        success: true,
        data: rows.map((r: any) => ({
          id: r.id,
          employeeId: r.employee_id,
          timestamp: r.timestamp,
          fileUrl: r.file_path,
          fileSizeBytes: r.file_size_bytes,
          width: r.width,
          height: r.height,
          appName: r.app_name,
          windowTitle: r.window_title,
          createdAt: r.created_at
        }))
      });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  // Manual delete — useful for the admin to clear out a sensitive shot.
  app.delete('/api/screenshots/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const row = await db.get(
        `SELECT file_path FROM screenshots WHERE id = ? AND org_id = ?`,
        [req.params.id, req.orgId!]
      );
      if (!row) {
        return res.status(404).json({ success: false, error: 'Screenshot not found' });
      }
      try {
        const fp = path.join(__dirname, '../../../data', row.file_path.replace(/^\/uploads\//, 'uploads/'));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch { /* swallow */ }
      await db.run(`DELETE FROM screenshots WHERE id = ? AND org_id = ?`, [req.params.id, req.orgId!]);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });
}
