// Organization settings + logo upload endpoints.
//
// All endpoints are behind `requireAuth` and always scope to `req.orgId` so
// there is no way to read or write another org's settings, even with a forged
// `id` in the body.
//
// Logo uploads are accepted as base64-encoded strings inside a regular JSON
// POST body — no multer or multipart handling required.

import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth } from '../auth.js';
import { getDatabase } from '../database.js';
import { resolveTimezone } from '../timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// admin/data/uploads — matches the static mount in server/index.ts
const UPLOADS_DIR = path.join(__dirname, '../../../data/uploads');

const MAX_LOGO_BYTES = 1_000_000; // 1 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    default: return 'bin';
  }
}

export function setupOrgRoutes(app: Express): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // GET /api/organization - full settings (tz, logo, default currency, name,
  // daily summary config, screenshots config)
  app.get('/api/organization', requireAuth, async (req, res) => {
    try {
      const db = getDatabase();
      const row = await db.get(
        `SELECT id, name, slug, timezone, logo_url, default_currency,
                daily_summary_enabled, daily_summary_recipient, daily_summary_hour,
                daily_summary_last_sent_date,
                screenshots_enabled, screenshot_interval_minutes, screenshot_retention_days,
                created_at, updated_at
         FROM organizations WHERE id = ?`,
        [req.orgId!]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Organization not found' });
      res.json({
        success: true,
        data: {
          id: row.id,
          name: row.name,
          slug: row.slug,
          timezone: resolveTimezone(row.timezone),
          logoUrl: row.logo_url || null,
          defaultCurrency: row.default_currency || 'USD',
          dailySummaryEnabled: row.daily_summary_enabled === 1,
          dailySummaryRecipient: row.daily_summary_recipient || '',
          dailySummaryHour: typeof row.daily_summary_hour === 'number' ? row.daily_summary_hour : 18,
          dailySummaryLastSentDate: row.daily_summary_last_sent_date || null,
          screenshotsEnabled: row.screenshots_enabled === 1,
          screenshotIntervalMinutes: typeof row.screenshot_interval_minutes === 'number' ? row.screenshot_interval_minutes : 10,
          screenshotRetentionDays: typeof row.screenshot_retention_days === 'number' ? row.screenshot_retention_days : 7,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // PUT /api/organization - update any of the settings (all optional).
  app.put('/api/organization', requireAuth, async (req, res) => {
    try {
      const {
        name, timezone, defaultCurrency,
        dailySummaryEnabled, dailySummaryRecipient, dailySummaryHour,
        screenshotsEnabled, screenshotIntervalMinutes, screenshotRetentionDays
      } = req.body || {};
      const sets: string[] = [];
      const values: any[] = [];

      if (typeof name === 'string' && name.trim().length > 0) {
        sets.push('name = ?'); values.push(name.trim());
      }
      if (typeof timezone === 'string') {
        const resolved = resolveTimezone(timezone);
        sets.push('timezone = ?'); values.push(resolved);
      }
      if (typeof defaultCurrency === 'string' && /^[A-Z]{3}$/.test(defaultCurrency)) {
        sets.push('default_currency = ?'); values.push(defaultCurrency);
      }
      if (typeof dailySummaryEnabled === 'boolean') {
        sets.push('daily_summary_enabled = ?'); values.push(dailySummaryEnabled ? 1 : 0);
      }
      if (typeof dailySummaryRecipient === 'string') {
        const trimmed = dailySummaryRecipient.trim();
        if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return res.status(400).json({ success: false, error: 'dailySummaryRecipient must be a valid email' });
        }
        sets.push('daily_summary_recipient = ?'); values.push(trimmed || null);
      }
      if (typeof dailySummaryHour === 'number' && dailySummaryHour >= 0 && dailySummaryHour <= 23) {
        sets.push('daily_summary_hour = ?'); values.push(Math.floor(dailySummaryHour));
      }
      if (typeof screenshotsEnabled === 'boolean') {
        sets.push('screenshots_enabled = ?'); values.push(screenshotsEnabled ? 1 : 0);
      }
      if (typeof screenshotIntervalMinutes === 'number' && screenshotIntervalMinutes >= 1 && screenshotIntervalMinutes <= 60) {
        sets.push('screenshot_interval_minutes = ?'); values.push(Math.floor(screenshotIntervalMinutes));
      }
      if (typeof screenshotRetentionDays === 'number' && screenshotRetentionDays >= 1 && screenshotRetentionDays <= 365) {
        sets.push('screenshot_retention_days = ?'); values.push(Math.floor(screenshotRetentionDays));
      }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: 'No updatable fields provided' });
      }

      sets.push('updated_at = ?'); values.push(new Date().toISOString());
      values.push(req.orgId!);

      const db = getDatabase();
      await db.run(
        `UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`,
        values
      );

      const row = await db.get(
        `SELECT id, name, slug, timezone, logo_url, default_currency,
                daily_summary_enabled, daily_summary_recipient, daily_summary_hour,
                screenshots_enabled, screenshot_interval_minutes, screenshot_retention_days
         FROM organizations WHERE id = ?`,
        [req.orgId!]
      );
      res.json({
        success: true,
        data: {
          id: row.id,
          name: row.name,
          slug: row.slug,
          timezone: resolveTimezone(row.timezone),
          logoUrl: row.logo_url || null,
          defaultCurrency: row.default_currency || 'USD',
          dailySummaryEnabled: row.daily_summary_enabled === 1,
          dailySummaryRecipient: row.daily_summary_recipient || '',
          dailySummaryHour: typeof row.daily_summary_hour === 'number' ? row.daily_summary_hour : 18,
          screenshotsEnabled: row.screenshots_enabled === 1,
          screenshotIntervalMinutes: typeof row.screenshot_interval_minutes === 'number' ? row.screenshot_interval_minutes : 10,
          screenshotRetentionDays: typeof row.screenshot_retention_days === 'number' ? row.screenshot_retention_days : 7
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // POST /api/organization/logo - body: { mimeType, dataBase64 }
  // Writes the file to admin/data/uploads/logo-<orgId>.<ext> and stores the
  // public URL at organizations.logo_url.
  app.post('/api/organization/logo', requireAuth, async (req, res) => {
    try {
      const { mimeType, dataBase64 } = req.body || {};
      if (typeof mimeType !== 'string' || !ALLOWED_MIME.has(mimeType)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported mimeType. Allowed: ${Array.from(ALLOWED_MIME).join(', ')}`
        });
      }
      if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
        return res.status(400).json({ success: false, error: 'dataBase64 is required' });
      }

      // Strip optional "data:image/png;base64," prefix
      const stripped = dataBase64.replace(/^data:[^;]+;base64,/, '');
      let buffer: Buffer;
      try {
        buffer = Buffer.from(stripped, 'base64');
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid base64 payload' });
      }
      if (buffer.byteLength === 0) {
        return res.status(400).json({ success: false, error: 'Empty logo payload' });
      }
      if (buffer.byteLength > MAX_LOGO_BYTES) {
        return res.status(413).json({
          success: false,
          error: `Logo too large. Max ${MAX_LOGO_BYTES / 1000}kB.`
        });
      }

      const ext = mimeToExt(mimeType);
      // Include a cache-busting token in the filename so the browser refetches
      // when the admin uploads a new logo.
      const cacheBust = Date.now().toString(36);
      const filename = `logo-${req.orgId}-${cacheBust}.${ext}`;
      const fullPath = path.join(UPLOADS_DIR, filename);

      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(fullPath, buffer);

      // Remove older logos for this org.
      try {
        for (const f of fs.readdirSync(UPLOADS_DIR)) {
          if (f.startsWith(`logo-${req.orgId}-`) && f !== filename) {
            try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch {}
          }
        }
      } catch {}

      const publicUrl = `/uploads/${filename}`;
      const db = getDatabase();
      await db.run(
        `UPDATE organizations SET logo_url = ?, updated_at = ? WHERE id = ?`,
        [publicUrl, new Date().toISOString(), req.orgId!]
      );

      res.json({ success: true, data: { logoUrl: publicUrl } });
    } catch (error) {
      console.error('Logo upload failed:', error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // DELETE /api/organization/logo - remove the current logo
  app.delete('/api/organization/logo', requireAuth, async (req, res) => {
    try {
      const db = getDatabase();
      const row = await db.get(`SELECT logo_url FROM organizations WHERE id = ?`, [req.orgId!]);
      if (row?.logo_url) {
        const filename = path.basename(row.logo_url);
        const fullPath = path.join(UPLOADS_DIR, filename);
        try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
      }
      await db.run(
        `UPDATE organizations SET logo_url = NULL, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), req.orgId!]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });
}
