// Daily summary builder + emailer.
//
// Compiles a per-employee, per-day productivity summary for an organization
// and sends it as a single HTML email to the configured recipient. The same
// summary data is also exposed via /api/reports/daily-summary so the admin
// can view it in the browser even if SMTP is not configured.
//
// Email transport: nodemailer with SMTP creds from env. If creds are missing,
// generation still runs and the result is logged + cached, but no mail is sent.

import nodemailer from 'nodemailer';
import { getDatabase } from './database.js';
import { getLocalDayBounds, resolveTimezone, toLocalDateString, localMidnightUtc } from './timezone.js';
import { computeProductivityStats, formatDurationSeconds } from '../shared-types.js';
import { annotateOutsideHours, hasBusinessHours } from './business-hours.js';

// ─────────────────────────────────────────────────────────────────────────
// Email transports
// ---------------------------------------------------------------------------
// Two ways to send the daily summary, in priority order:
//
//   1. Resend API (preferred for archtrack.live):
//      Set RESEND_API_KEY and (optionally) RESEND_FROM. Lightweight, no
//      app passwords, free 3k emails/month, sender domain doesn't need
//      DNS verification when sending to your own verified email.
//
//   2. Generic SMTP via nodemailer:
//      Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
//      Works for Gmail App Password, Mailgun, your own postfix, etc.
//
// If neither is configured the cron returns
//   { sent: false, reason: 'SMTP/Resend not configured ...' }
// and the in-app preview + manual send buttons still work.
// ─────────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'ArchTrack <onboarding@resend.dev>';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'archtrack@localhost';

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

/**
 * Send via Resend HTTP API. Returns null on success or an error message.
 * Uses fetch directly so we don't pull in another package just for one
 * endpoint.
 */
async function sendViaResend(to: string, subject: string, html: string): Promise<string | null> {
  if (!RESEND_API_KEY) return 'no api key';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html })
    });
    if (res.ok) return null;
    const body = await res.text();
    return `Resend HTTP ${res.status}: ${body.slice(0, 200)}`;
  } catch (e) {
    return `Resend network error: ${(e as Error).message}`;
  }
}

export interface EmployeeDailySummary {
  employeeId: string;
  employeeName: string;
  totalSeconds: number;
  productiveSeconds: number;
  unproductiveSeconds: number;
  neutralSeconds: number;
  idleSeconds: number;
  outsideHoursSeconds: number;
  productivityScore: number;
  topApps: Array<{ app: string; seconds: number; categoryName: string }>;
  suspiciousCount: number;
}

export interface OrgDailySummary {
  orgId: string;
  orgName: string;
  date: string;             // YYYY-MM-DD in org timezone
  timezone: string;
  generatedAt: string;
  employees: EmployeeDailySummary[];
  teamProductivityScore: number;
  teamTotalSeconds: number;
  teamProductiveSeconds: number;
}

/**
 * Compute the daily summary for an org for a specific local-date (YYYY-MM-DD).
 * If date is omitted, defaults to "today" in the org's timezone.
 */
export async function buildDailySummary(orgId: string, date?: string): Promise<OrgDailySummary> {
  const db = getDatabase();
  const orgRow = await db.get(
    `SELECT id, name, timezone FROM organizations WHERE id = ?`,
    [orgId]
  );
  if (!orgRow) throw new Error('Organization not found');

  const tz = resolveTimezone(orgRow.timezone);
  const targetDate = date || toLocalDateString(new Date(), tz);

  // Compute UTC bounds for the target local day. Note: we don't use these
  // values directly here — each employee gets their own bounds via
  // getLocalDayBoundsForDate below — but keeping them around documents the
  // shape and lets future callers reuse the value cheaply.
  const _startUtc = localMidnightUtc(targetDate, tz).toISOString();
  const _endUtc = new Date(localMidnightUtc(targetDate, tz).getTime() + 86400000).toISOString();
  void _startUtc; void _endUtc;

  const employees = await db.all(
    `SELECT id, name, timezone, business_hours_start, business_hours_end, business_hours_days
     FROM employees WHERE org_id = ? AND is_active = 1
     ORDER BY name`,
    [orgId]
  );

  const employeeSummaries: EmployeeDailySummary[] = [];
  let teamTotal = 0;
  let teamProductive = 0;
  let teamUnproductive = 0;

  for (const emp of employees) {
    // Use the employee's tz if set, otherwise the org tz, for consistent
    // bounds when their workday lives in a different zone.
    const empTz = resolveTimezone(emp.timezone || tz);
    const [empStart, empEnd] = getLocalDayBoundsForDate(targetDate, empTz);

    const rawRows = await db.all(
      `SELECT * FROM activities
       WHERE employee_id = ? AND org_id = ?
         AND timestamp >= ? AND timestamp < ?`,
      [emp.id, orgId, empStart, empEnd]
    );

    const mapped = rawRows.map((r: any) => ({
      timestamp: r.timestamp,
      category: r.category,
      categoryName: r.category_name,
      productivityLevel: r.productivity_level,
      isIdle: r.is_idle === 1,
      isSuspicious: r.is_suspicious === 1,
      durationSeconds: r.duration_seconds,
      appName: r.app_name
    }));

    const annotated = hasBusinessHours(emp)
      ? annotateOutsideHours(mapped, emp, tz)
      : mapped.map(a => ({ ...a, outsideBusinessHours: false }));

    const stats = computeProductivityStats(annotated);

    // Top apps by counted (not outside-hours) seconds
    const appBuckets = new Map<string, { seconds: number; categoryName: string }>();
    for (const a of annotated) {
      if (a.outsideBusinessHours) continue;
      const key = a.appName || 'Unknown';
      const existing = appBuckets.get(key) || { seconds: 0, categoryName: a.categoryName || 'Other' };
      existing.seconds += a.durationSeconds || 0;
      appBuckets.set(key, existing);
    }
    const topApps = Array.from(appBuckets.entries())
      .sort((a, b) => b[1].seconds - a[1].seconds)
      .slice(0, 5)
      .map(([app, v]) => ({ app, seconds: v.seconds, categoryName: v.categoryName }));

    const suspiciousCount = annotated.filter(a => !a.outsideBusinessHours && a.isSuspicious).length;

    employeeSummaries.push({
      employeeId: emp.id,
      employeeName: emp.name,
      totalSeconds: stats.totalSeconds,
      productiveSeconds: stats.productiveSeconds,
      unproductiveSeconds: stats.unproductiveSeconds,
      neutralSeconds: stats.neutralSeconds,
      idleSeconds: stats.idleSeconds,
      outsideHoursSeconds: stats.outsideHoursSeconds,
      productivityScore: stats.productivityScore,
      topApps,
      suspiciousCount
    });

    teamTotal += stats.totalSeconds;
    teamProductive += stats.productiveSeconds;
    teamUnproductive += stats.unproductiveSeconds;
  }

  const teamActive = teamProductive + teamUnproductive;
  const teamScore = teamActive > 0 ? Math.round((teamProductive / teamActive) * 100) : 0;

  return {
    orgId,
    orgName: orgRow.name,
    date: targetDate,
    timezone: tz,
    generatedAt: new Date().toISOString(),
    employees: employeeSummaries,
    teamProductivityScore: teamScore,
    teamTotalSeconds: teamTotal,
    teamProductiveSeconds: teamProductive
  };
}

/**
 * Helper used inside buildDailySummary so we don't reach into the timezone
 * helper twice for one date.
 */
function getLocalDayBoundsForDate(dateYmd: string, tz: string): [string, string] {
  const start = localMidnightUtc(dateYmd, tz);
  const next = new Date(start.getTime() + 86400000);
  // Snap next to local midnight too in case of DST gaps.
  const nextYmd = next.toISOString().slice(0, 10);
  const end = localMidnightUtc(nextYmd, tz);
  return [start.toISOString(), end.toISOString()];
}

/**
 * Render the summary as an HTML email body.
 */
export function renderDailySummaryHtml(s: OrgDailySummary): string {
  const fmtSec = (sec: number) => formatDurationSeconds(sec);
  const scoreColor = (n: number) => (n >= 80 ? '#27ae60' : n >= 60 ? '#f39c12' : '#e74c3c');

  const empRows = s.employees.map(e => {
    const apps = e.topApps.length === 0
      ? '<span style="color:#999;">No tracked apps</span>'
      : e.topApps
          .map(a => `<div style="font-size:12px;color:#555;">${escapeHtml(a.app)} <span style="color:#888;">(${escapeHtml(a.categoryName)} · ${fmtSec(a.seconds)})</span></div>`)
          .join('');

    const susBadge = e.suspiciousCount > 0
      ? `<span style="background:#fee2e2;color:#e74c3c;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;margin-left:6px;">⚠️ ${e.suspiciousCount} suspicious</span>`
      : '';

    return `
      <tr style="border-top:1px solid #eee;">
        <td style="padding:12px 16px;vertical-align:top;">
          <div style="font-weight:600;color:#2c3e50;">${escapeHtml(e.employeeName)}${susBadge}</div>
          <div style="font-size:12px;color:#7f8c8d;margin-top:2px;">Total ${fmtSec(e.totalSeconds)} · Productive ${fmtSec(e.productiveSeconds)} · Idle ${fmtSec(e.idleSeconds)}</div>
          ${e.outsideHoursSeconds > 0 ? `<div style="font-size:11px;color:#f39c12;margin-top:2px;">${fmtSec(e.outsideHoursSeconds)} outside business hours (excluded)</div>` : ''}
        </td>
        <td style="padding:12px 16px;vertical-align:top;text-align:right;">
          <div style="font-size:24px;font-weight:700;color:${scoreColor(e.productivityScore)};">${e.productivityScore}%</div>
          <div style="font-size:11px;color:#7f8c8d;">productivity</div>
        </td>
        <td style="padding:12px 16px;vertical-align:top;">${apps}</td>
      </tr>
    `;
  }).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>ArchTrack Daily Summary — ${escapeHtml(s.date)}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f6f8;margin:0;padding:24px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#2c3e50 0%,#3498db 100%);padding:28px 32px;color:#fff;">
      <div style="font-size:13px;text-transform:uppercase;letter-spacing:1px;opacity:.85;">${escapeHtml(s.orgName)}</div>
      <h1 style="margin:6px 0 0;font-size:24px;font-weight:700;">Daily Summary · ${escapeHtml(s.date)}</h1>
      <div style="font-size:13px;margin-top:4px;opacity:.85;">Timezone: ${escapeHtml(s.timezone)}</div>
    </div>
    <div style="padding:24px 32px;display:flex;gap:24px;border-bottom:1px solid #eee;">
      <div>
        <div style="font-size:11px;text-transform:uppercase;color:#95a5a6;letter-spacing:.5px;">Team productivity</div>
        <div style="font-size:32px;font-weight:700;color:${scoreColor(s.teamProductivityScore)};">${s.teamProductivityScore}%</div>
      </div>
      <div>
        <div style="font-size:11px;text-transform:uppercase;color:#95a5a6;letter-spacing:.5px;">Total tracked</div>
        <div style="font-size:32px;font-weight:700;color:#2c3e50;">${fmtSec(s.teamTotalSeconds)}</div>
      </div>
      <div>
        <div style="font-size:11px;text-transform:uppercase;color:#95a5a6;letter-spacing:.5px;">Productive time</div>
        <div style="font-size:32px;font-weight:700;color:#27ae60;">${fmtSec(s.teamProductiveSeconds)}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#fafbfc;">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#7f8c8d;text-transform:uppercase;letter-spacing:.5px;">Employee</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:#7f8c8d;text-transform:uppercase;letter-spacing:.5px;">Score</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#7f8c8d;text-transform:uppercase;letter-spacing:.5px;">Top apps</th>
        </tr>
      </thead>
      <tbody>
        ${empRows || '<tr><td colspan="3" style="padding:24px;text-align:center;color:#95a5a6;">No employees tracked.</td></tr>'}
      </tbody>
    </table>
    <div style="padding:16px 32px;background:#fafbfc;font-size:11px;color:#95a5a6;">
      Generated by ArchTrack at ${escapeHtml(s.generatedAt)}.
      Productivity formula: productive ÷ (productive + unproductive).
      "Outside business hours" time is tracked but excluded from totals and scores.
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send the daily summary email to the org's configured recipient.
 * Returns { sent: true } on success, { sent: false, reason } if SMTP not
 * configured or send fails. Never throws.
 */
export async function sendDailySummaryEmail(orgId: string, date?: string): Promise<{ sent: boolean; reason?: string; html: string; recipient?: string; }> {
  const db = getDatabase();
  const summary = await buildDailySummary(orgId, date);
  const html = renderDailySummaryHtml(summary);

  const orgRow = await db.get(
    `SELECT daily_summary_recipient, daily_summary_enabled FROM organizations WHERE id = ?`,
    [orgId]
  );
  if (!orgRow?.daily_summary_enabled) {
    return { sent: false, reason: 'daily_summary_enabled is off', html };
  }
  const recipient = (orgRow.daily_summary_recipient || '').trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { sent: false, reason: 'no valid recipient configured', html };
  }

  const subject = `ArchTrack Daily Summary — ${summary.orgName} · ${summary.date}`;

  // Try Resend first if RESEND_API_KEY is set, then fall back to SMTP.
  if (RESEND_API_KEY) {
    const err = await sendViaResend(recipient, subject, html);
    if (err === null) {
      await db.run(
        `UPDATE organizations SET daily_summary_last_sent_date = ?, updated_at = ? WHERE id = ?`,
        [summary.date, new Date().toISOString(), orgId]
      );
      return { sent: true, html, recipient };
    }
    console.error(`Daily summary Resend failed for ${orgId}: ${err}`);
    return { sent: false, reason: err, html, recipient };
  }

  const t = getTransporter();
  if (!t) {
    return { sent: false, reason: 'SMTP not configured (set RESEND_API_KEY or SMTP_HOST/USER/PASS env vars)', html, recipient };
  }

  try {
    await t.sendMail({
      from: SMTP_FROM,
      to: recipient,
      subject,
      html
    });

    // Mark this date as sent so the cron doesn't double-send on restart.
    await db.run(
      `UPDATE organizations SET daily_summary_last_sent_date = ?, updated_at = ? WHERE id = ?`,
      [summary.date, new Date().toISOString(), orgId]
    );

    return { sent: true, html, recipient };
  } catch (e) {
    console.error(`Daily summary email failed for ${orgId}:`, e);
    return { sent: false, reason: (e as Error).message, html, recipient };
  }
}

/**
 * Cron-style scheduler that fires once per minute and dispatches the daily
 * summary email for any organization whose local hour now equals their
 * configured `daily_summary_hour` and which hasn't already been sent today.
 */
export function startDailySummaryScheduler(): void {
  // Tracks the last time we logged a "SMTP not configured" warning per
  // org-day so the cron doesn't spam the log every 60 seconds while the
  // admin hasn't wired SMTP yet. Cleared whenever the local date rolls
  // over so each new day still surfaces the warning at least once.
  const smtpWarningLastLoggedKey = new Map<string, string>(); // orgId → "YYYY-MM-DD-HH"

  const tick = async () => {
    try {
      const db = getDatabase();
      const orgs = await db.all(
        `SELECT id, name, timezone, daily_summary_enabled, daily_summary_hour, daily_summary_last_sent_date
         FROM organizations
         WHERE daily_summary_enabled = 1`
      );
      for (const org of orgs) {
        const tz = resolveTimezone(org.timezone);
        const todayLocal = toLocalDateString(new Date(), tz);
        if (org.daily_summary_last_sent_date === todayLocal) continue;

        const localHour = parseInt(
          new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour12: false,
            hour: '2-digit'
          }).format(new Date()),
          10
        );
        const hourTarget = typeof org.daily_summary_hour === 'number' ? org.daily_summary_hour : 18;
        if (localHour < hourTarget) continue;

        // Try to send. If SMTP isn't wired we keep retrying every minute
        // (so the moment the admin sets env vars, the next minute fires)
        // but we only LOG the warning once per org per local hour, to
        // keep pm2 logs clean.
        const result = await sendDailySummaryEmail(org.id, todayLocal);
        if (result.sent) {
          console.log(`✓ Sent daily summary to ${result.recipient}`);
        } else if (result.reason && result.reason.includes('SMTP not configured')) {
          const warnKey = `${todayLocal}-${localHour.toString().padStart(2, '0')}`;
          if (smtpWarningLastLoggedKey.get(org.id) !== warnKey) {
            console.warn(`✗ [${org.name}] Daily summary ready to send but SMTP not configured. Set SMTP_HOST/PORT/USER/PASS/FROM env vars and pm2 will pick it up on the next tick.`);
            smtpWarningLastLoggedKey.set(org.id, warnKey);
          }
          // Don't mark as attempted — we want to retry the moment SMTP
          // becomes available.
        } else {
          console.warn(`✗ Daily summary not sent for ${org.name}: ${result.reason}`);
          // Mark as attempted so a hard failure (bad creds, DNS, etc.)
          // doesn't keep firing every minute for the rest of the day.
          await db.run(
            `UPDATE organizations SET daily_summary_last_sent_date = ? WHERE id = ?`,
            [todayLocal, org.id]
          );
        }
      }
    } catch (e) {
      console.error('Daily summary scheduler tick failed:', e);
    }
  };

  // Run once on boot, then every 60s.
  setTimeout(tick, 5000);
  setInterval(tick, 60000);
  console.log('📅 Daily summary scheduler started (1 min tick)');
}
