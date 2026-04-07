// Auth routes for ArchTrack multi-tenancy
import { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import {
  hashPassword,
  verifyPassword,
  generateDashboardToken,
  generateDeviceToken,
  generateRefreshToken,
  generateSetupToken,
  hashToken,
  requireAuth
} from '../auth.js';

export function setupAuthRoutes(app: Express): void {
  const db = () => getDatabase();

  // Sign up: create org + owner account
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, name, orgName, timezone } = req.body;

      if (!email || !password || !name || !orgName) {
        return res.status(400).json({ success: false, error: 'email, password, name, and orgName are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      // Check if email already exists
      const existing = await db().get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }

      const now = new Date().toISOString();
      const orgId = uuidv4();
      const userId = uuidv4();
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uuidv4().slice(0, 8);

      // Ensure slug is unique
      const existingSlug = await db().get('SELECT id FROM organizations WHERE slug = ?', [slug]);
      const finalSlug = existingSlug ? `${slug}-${uuidv4().slice(0, 4)}` : slug;

      // Validate + default the org timezone from the signup form.
      let orgTz = 'UTC';
      if (typeof timezone === 'string') {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: timezone });
          orgTz = timezone;
        } catch { /* ignore invalid tz, keep UTC */ }
      }

      // Create org
      await db().run(
        `INSERT INTO organizations (id, name, slug, owner_email, timezone, default_currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, orgName, finalSlug, email, orgTz, 'USD', now, now]
      );

      // Create user
      const passwordHash = await hashPassword(password);
      await db().run(
        `INSERT INTO users (id, org_id, email, password_hash, name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'owner', ?, ?)`,
        [userId, orgId, email, passwordHash, name, now, now]
      );

      // Generate tokens
      const accessToken = generateDashboardToken({ userId, orgId, email });
      const refreshToken = generateRefreshToken();
      const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await db().run(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), userId, hashToken(refreshToken), refreshExpiry, now]
      );

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: { id: userId, email, name, role: 'owner' },
          org: {
            id: orgId,
            name: orgName,
            slug: finalSlug,
            timezone: orgTz,
            logoUrl: null,
            defaultCurrency: 'USD'
          }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'email and password are required' });
      }

      const user = await db().get(
        `SELECT u.*, o.name as org_name, o.slug as org_slug,
                o.timezone as org_timezone, o.logo_url as org_logo_url,
                o.default_currency as org_default_currency
         FROM users u JOIN organizations o ON u.org_id = o.id
         WHERE u.email = ?`,
        [email]
      );

      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const now = new Date().toISOString();
      const accessToken = generateDashboardToken({ userId: user.id, orgId: user.org_id, email });
      const refreshToken = generateRefreshToken();
      const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await db().run(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), user.id, hashToken(refreshToken), refreshExpiry, now]
      );

      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          org: {
            id: user.org_id,
            name: user.org_name,
            slug: user.org_slug,
            timezone: user.org_timezone || 'UTC',
            logoUrl: user.org_logo_url || null,
            defaultCurrency: user.org_default_currency || 'USD'
          }
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Refresh token
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ success: false, error: 'refreshToken required' });
      }

      const tokenHash = hashToken(refreshToken);
      const stored = await db().get(
        `SELECT rt.*, u.email, u.org_id FROM refresh_tokens rt
         JOIN users u ON rt.user_id = u.id
         WHERE rt.token_hash = ? AND rt.expires_at > ?`,
        [tokenHash, new Date().toISOString()]
      );

      if (!stored) {
        return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      }

      // Delete old refresh token
      await db().run('DELETE FROM refresh_tokens WHERE id = ?', [stored.id]);

      // Issue new tokens
      const now = new Date().toISOString();
      const accessToken = generateDashboardToken({ userId: stored.user_id, orgId: stored.org_id, email: stored.email });
      const newRefreshToken = generateRefreshToken();
      const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await db().run(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), stored.user_id, hashToken(newRefreshToken), refreshExpiry, now]
      );

      res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get current user info
  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      if (req.tokenType === 'dashboard') {
        const user = await db().get(
          `SELECT u.id, u.email, u.name, u.role, u.org_id,
                  o.name as org_name, o.slug as org_slug,
                  o.timezone as org_timezone, o.logo_url as org_logo_url,
                  o.default_currency as org_default_currency
           FROM users u JOIN organizations o ON u.org_id = o.id
           WHERE u.id = ?`,
          [req.userId]
        );
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({
          success: true,
          data: {
            type: 'dashboard',
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
            org: {
              id: user.org_id,
              name: user.org_name,
              slug: user.org_slug,
              timezone: user.org_timezone || 'UTC',
              logoUrl: user.org_logo_url || null,
              defaultCurrency: user.org_default_currency || 'USD'
            }
          }
        });
      } else if (req.tokenType === 'device') {
        const employee = await db().get('SELECT * FROM employees WHERE id = ? AND org_id = ?', [req.employeeId, req.orgId]);
        if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
        res.json({ success: true, data: { type: 'device', employee } });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Generate setup token for an employee (admin action)
  app.post('/api/auth/setup-token', requireAuth, async (req, res) => {
    try {
      const { employeeId } = req.body;
      if (!employeeId) {
        return res.status(400).json({ success: false, error: 'employeeId is required' });
      }

      // Verify employee belongs to this org
      const employee = await db().get('SELECT id, name FROM employees WHERE id = ? AND org_id = ?', [employeeId, req.orgId]);
      if (!employee) {
        return res.status(404).json({ success: false, error: 'Employee not found in your organization' });
      }

      const now = new Date().toISOString();
      const token = generateSetupToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

      await db().run(
        `INSERT INTO setup_tokens (id, org_id, employee_id, token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), req.orgId, employeeId, token, expiresAt, now]
      );

      res.json({
        success: true,
        data: {
          token,
          employeeId,
          employeeName: employee.name,
          expiresAt
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Desktop tracker enrollment: redeem setup token for device JWT
  app.post('/api/auth/enroll', async (req, res) => {
    try {
      const { setupToken } = req.body;
      if (!setupToken) {
        return res.status(400).json({ success: false, error: 'setupToken is required' });
      }

      const now = new Date().toISOString();
      const tokenRecord = await db().get(
        `SELECT st.*, e.name as employee_name, o.name as org_name
         FROM setup_tokens st
         JOIN employees e ON st.employee_id = e.id
         JOIN organizations o ON st.org_id = o.id
         WHERE st.token = ? AND st.is_used = 0 AND st.expires_at > ?`,
        [setupToken, now]
      );

      if (!tokenRecord) {
        return res.status(401).json({ success: false, error: 'Invalid, expired, or already used setup token' });
      }

      // Mark token as used
      await db().run(
        `UPDATE setup_tokens SET is_used = 1, used_at = ? WHERE id = ?`,
        [now, tokenRecord.id]
      );

      // Generate device JWT
      const accessToken = generateDeviceToken({
        employeeId: tokenRecord.employee_id,
        orgId: tokenRecord.org_id
      });

      res.json({
        success: true,
        data: {
          accessToken,
          employeeId: tokenRecord.employee_id,
          employeeName: tokenRecord.employee_name,
          orgId: tokenRecord.org_id,
          orgName: tokenRecord.org_name
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Logout: invalidate refresh token
  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await db().run('DELETE FROM refresh_tokens WHERE token_hash = ?', [hashToken(refreshToken)]);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Forgot password: generate reset token
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      const user = await db().get('SELECT id, name, email FROM users WHERE email = ?', [email]);

      // Always return success (don't reveal if email exists)
      if (!user) {
        return res.json({ success: true, message: 'If that email exists, a reset link has been generated.' });
      }

      // Generate reset token
      const token = generateSetupToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      const now = new Date().toISOString();

      // Store in refresh_tokens table (reuse it for password resets)
      await db().run(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), user.id, 'pwreset:' + token, expiresAt, now]
      );

      // In production, you'd email this link. For now, log it to PM2 logs.
      const resetUrl = `/reset-password?token=${token}`;
      console.log(`\n=== PASSWORD RESET ===`);
      console.log(`User: ${user.email}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log(`Expires: ${expiresAt}`);
      console.log(`======================\n`);

      res.json({
        success: true,
        message: 'If that email exists, a reset link has been generated.',
        // Include reset URL in response for MVP (remove this when email is set up)
        resetUrl
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Multi-admin team management
  // ─────────────────────────────────────────────────────────────────────
  // List all admin/owner users in the caller's org. Used by the Org
  // Settings modal "Team" section so the owner can see who else has
  // dashboard access.
  app.get('/api/auth/team', requireAuth, async (req, res) => {
    try {
      const users = await db().all(
        `SELECT id, email, name, role, created_at FROM users
         WHERE org_id = ? ORDER BY created_at ASC`,
        [req.orgId!]
      );
      res.json({ success: true, data: users });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Invite (create) a new admin user. Only an owner or admin can do this.
  // For MVP we accept a password directly rather than emailing an invite
  // link — the owner shares it out-of-band. Roles supported: 'admin' or
  // 'owner'. The created user is scoped to the caller's org.
  app.post('/api/auth/team', requireAuth, async (req, res) => {
    try {
      const { email, password, name, role } = req.body || {};
      if (!email || !password || !name) {
        return res.status(400).json({ success: false, error: 'email, password, and name are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }
      const allowedRoles = new Set(['admin', 'owner']);
      const finalRole = allowedRoles.has(role) ? role : 'admin';

      // Caller must already be an admin/owner to add teammates.
      const caller = await db().get(
        'SELECT role FROM users WHERE id = ? AND org_id = ?',
        [req.userId, req.orgId!]
      );
      if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Only an owner or admin can invite teammates' });
      }

      // Email must be unique across the entire users table (it's the
      // login identifier and the table has UNIQUE on email).
      const existing = await db().get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({ success: false, error: 'A user with that email already exists' });
      }

      const now = new Date().toISOString();
      const userId = uuidv4();
      const passwordHash = await hashPassword(password);
      await db().run(
        `INSERT INTO users (id, org_id, email, password_hash, name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, req.orgId!, email, passwordHash, name, finalRole, now, now]
      );

      res.json({
        success: true,
        data: { id: userId, email, name, role: finalRole, created_at: now }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Remove a teammate. Refuses to delete the last owner of the org so the
  // org doesn't get locked out.
  app.delete('/api/auth/team/:id', requireAuth, async (req, res) => {
    try {
      const caller = await db().get(
        'SELECT role FROM users WHERE id = ? AND org_id = ?',
        [req.userId, req.orgId!]
      );
      if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Only an owner or admin can remove teammates' });
      }

      // Don't let an admin delete themselves accidentally — they should
      // log out and have someone else remove them. Less footgun-y.
      if (req.params.id === req.userId) {
        return res.status(400).json({ success: false, error: 'You cannot remove yourself. Ask another admin to do it.' });
      }

      const target = await db().get(
        'SELECT id, role FROM users WHERE id = ? AND org_id = ?',
        [req.params.id, req.orgId!]
      );
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found in your organization' });
      }

      // Don't allow deleting the last owner — would lock the org out.
      if (target.role === 'owner') {
        const ownerCount: any = await db().get(
          `SELECT COUNT(*) as c FROM users WHERE org_id = ? AND role = 'owner'`,
          [req.orgId!]
        );
        if ((ownerCount?.c || 0) <= 1) {
          return res.status(400).json({ success: false, error: 'Cannot remove the last owner. Promote another user to owner first.' });
        }
      }

      await db().run('DELETE FROM users WHERE id = ? AND org_id = ?', [req.params.id, req.orgId!]);
      // Also nuke their refresh tokens so they're forced out immediately.
      await db().run('DELETE FROM refresh_tokens WHERE user_id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Reset password: validate token and set new password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ success: false, error: 'Token and password are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      const now = new Date().toISOString();
      const record = await db().get(
        `SELECT rt.*, u.email FROM refresh_tokens rt
         JOIN users u ON rt.user_id = u.id
         WHERE rt.token_hash = ? AND rt.expires_at > ?`,
        ['pwreset:' + token, now]
      );

      if (!record) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      }

      // Update password
      const passwordHash = await hashPassword(password);
      await db().run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, record.user_id]);

      // Delete the reset token
      await db().run('DELETE FROM refresh_tokens WHERE id = ?', [record.id]);

      res.json({ success: true, message: 'Password has been reset. You can now log in.' });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });
}
