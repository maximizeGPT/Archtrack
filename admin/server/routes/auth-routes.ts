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
      const { email, password, name, orgName } = req.body;

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

      // Create org
      await db().run(
        `INSERT INTO organizations (id, name, slug, owner_email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orgId, orgName, finalSlug, email, now, now]
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
          org: { id: orgId, name: orgName, slug: finalSlug }
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
        `SELECT u.*, o.name as org_name, o.slug as org_slug
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
          org: { id: user.org_id, name: user.org_name, slug: user.org_slug }
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
          `SELECT u.id, u.email, u.name, u.role, u.org_id, o.name as org_name, o.slug as org_slug
           FROM users u JOIN organizations o ON u.org_id = o.id
           WHERE u.id = ?`,
          [req.userId]
        );
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({ success: true, data: { type: 'dashboard', user, org: { id: user.org_id, name: user.org_name, slug: user.org_slug } } });
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
}
