import { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  getAllTasks,
  getTasksByProject,
  createTask,
  updateTask,
  getAllTimeEntries,
  getTimeEntriesByEmployee,
  createTimeEntry,
  updateTimeEntry,
  getActiveTimeEntries,
  getDashboardStats,
  // Activity tracking functions
  createActivity,
  getActivitiesByEmployee,
  getAllActivities,
  getSuspiciousActivities,
  getActivityStats,
  getEmployeeActivityStats,
  getDatabase
} from './database.js';
import type { Activity } from '../shared-types.js';
import {
  detectEmployeeRole,
  reclassifyForRole,
  applyOverrides,
  getRoleStatus,
  ROLE_PROFILES
} from './role-detector.js';
import { requireAuth, requireDeviceAuth, requireAnyAuth } from './auth.js';

export function setupRoutes(app: Express): void {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Dashboard
  app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
      const tz = typeof req.query.tz === 'string' ? req.query.tz : undefined;
      const stats = await getDashboardStats(req.orgId!, tz);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Employees
  app.get('/api/employees', requireAuth, async (req, res) => {
    try {
      const employees = await getAllEmployees(req.orgId!);
      res.json({ success: true, data: employees });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get('/api/employees/:id', requireAuth, async (req, res) => {
    try {
      const employee = await getEmployeeById(req.orgId!, req.params.id);
      if (!employee) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }
      res.json({ success: true, data: employee });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/employees', requireAuth, async (req, res) => {
    try {
      const now = new Date().toISOString();
      const employee = {
        id: uuidv4(),
        ...req.body,
        orgId: req.orgId!,
        role: req.body.role || 'employee',
        createdAt: now,
        updatedAt: now
      };
      await createEmployee(employee);
      res.json({ success: true, data: employee });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.put('/api/employees/:id', requireAuth, async (req, res) => {
    try {
      await updateEmployee(req.orgId!, req.params.id, req.body);
      const employee = await getEmployeeById(req.orgId!, req.params.id);
      res.json({ success: true, data: employee });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.delete('/api/employees/:id', requireAuth, async (req, res) => {
    try {
      await deleteEmployee(req.orgId!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Projects
  app.get('/api/projects', requireAuth, async (req, res) => {
    try {
      const projects = await getAllProjects(req.orgId!);
      res.json({ success: true, data: projects });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const project = await getProjectById(req.orgId!, req.params.id);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/projects', requireAuth, async (req, res) => {
    try {
      const now = new Date().toISOString();
      const project = {
        id: uuidv4(),
        ...req.body,
        orgId: req.orgId!,
        status: req.body.status || 'active',
        startDate: req.body.startDate || now,
        createdAt: now,
        updatedAt: now
      };
      await createProject(project);
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.put('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      await updateProject(req.orgId!, req.params.id, req.body);
      const project = await getProjectById(req.orgId!, req.params.id);
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Tasks
  app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
      let tasks;
      if (req.query.projectId) {
        tasks = await getTasksByProject(req.orgId!, req.query.projectId as string);
      } else {
        tasks = await getAllTasks(req.orgId!);
      }
      res.json({ success: true, data: tasks });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/tasks', requireAuth, async (req, res) => {
    try {
      const now = new Date().toISOString();
      const task = {
        id: uuidv4(),
        ...req.body,
        orgId: req.orgId!,
        status: req.body.status || 'todo',
        priority: req.body.priority || 'medium',
        createdAt: now,
        updatedAt: now
      };
      await createTask(task);
      res.json({ success: true, data: task });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.put('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
      await updateTask(req.orgId!, req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Legacy Time Entries
  app.get('/api/time-entries', requireAuth, async (req, res) => {
    try {
      let entries;
      if (req.query.employeeId) {
        entries = await getTimeEntriesByEmployee(
          req.orgId!,
          req.query.employeeId as string,
          req.query.startDate as string,
          req.query.endDate as string
        );
      } else {
        entries = await getAllTimeEntries(
          req.orgId!,
          req.query.startDate as string,
          req.query.endDate as string
        );
      }
      res.json({ success: true, data: entries });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get('/api/time-entries/active', requireAuth, async (req, res) => {
    try {
      const entries = await getActiveTimeEntries(req.orgId!);
      res.json({ success: true, data: entries });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/time-entries', requireAuth, async (req, res) => {
    try {
      const now = new Date().toISOString();
      const entry = {
        id: uuidv4(),
        ...req.body,
        createdAt: now,
        updatedAt: now
      };
      await createTimeEntry(req.orgId!, entry);
      res.json({ success: true, data: entry });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.put('/api/time-entries/:id', requireAuth, async (req, res) => {
    try {
      await updateTimeEntry(req.orgId!, req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // NEW: Activity Tracking Endpoints

  // Receive activities from desktop app
  app.post('/api/activity', requireAnyAuth, async (req, res) => {
    try {
      const employeeId = req.tokenType === 'device' ? req.employeeId! : req.body.employeeId;
      const { activities } = req.body;

      if (!employeeId || !Array.isArray(activities)) {
        return res.status(400).json({
          success: false,
          error: 'Missing employeeId or activities array'
        });
      }

      const orgId = req.orgId!;
      let suspiciousCount = 0;
      const savedActivities: Activity[] = [];

      // Get detected role for this employee (for smart reclassification)
      let detectedRole: { roleType: string; status: string } = { roleType: 'unknown', status: 'learning' };
      try {
        const roleStatus = await getRoleStatus(employeeId);
        detectedRole = { roleType: roleStatus.roleType, status: roleStatus.status };
      } catch (e) {
        // Role detection not ready yet — use original classification
      }

      for (const activityData of activities) {
        let category = activityData.category;
        let categoryName = activityData.categoryName;
        let productivityScore = activityData.productivityScore;
        let productivityLevel = activityData.productivityLevel;

        // Apply role-based reclassification if role is detected or overridden
        if (detectedRole.roleType !== 'unknown' && detectedRole.status !== 'learning') {
          const reclassified = reclassifyForRole(
            detectedRole.roleType,
            activityData.appName,
            activityData.windowTitle,
            category,
            productivityScore
          );
          category = reclassified.category;
          categoryName = reclassified.categoryName;
          productivityScore = reclassified.productivityScore;
          productivityLevel = reclassified.productivityLevel as Activity['productivityLevel'];
        }

        // Apply admin overrides (highest priority)
        try {
          const overridden = await applyOverrides(
            employeeId,
            detectedRole.roleType,
            activityData.appName,
            activityData.windowTitle,
            category,
            productivityScore
          );
          category = overridden.category;
          categoryName = overridden.categoryName;
          productivityScore = overridden.productivityScore;
          productivityLevel = overridden.productivityLevel as Activity['productivityLevel'];
        } catch (e) {
          // Override table may not exist yet on first run
        }

        const activity: Activity = {
          id: activityData.id || uuidv4(),
          employeeId,
          timestamp: activityData.timestamp,
          appName: activityData.appName,
          windowTitle: activityData.windowTitle,
          category,
          categoryName,
          productivityScore,
          productivityLevel,
          isSuspicious: activityData.isSuspicious || false,
          suspiciousReason: activityData.suspiciousReason,
          isIdle: activityData.isIdle || false,
          idleTimeSeconds: activityData.idleTimeSeconds || 0,
          durationSeconds: activityData.durationSeconds || 0,
          createdAt: new Date().toISOString()
        };

        await createActivity(orgId, activity);
        savedActivities.push(activity);

        if (activity.isSuspicious) {
          suspiciousCount++;
        }
      }

      // Trigger role detection in background (non-blocking)
      detectEmployeeRole(employeeId).catch(e => {
        console.warn('Role detection failed:', e.message);
      });

      res.json({
        success: true,
        data: {
          syncedCount: savedActivities.length,
          suspiciousCount,
          detectedRole: detectedRole.roleType !== 'unknown' ? detectedRole : undefined
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get activities for an employee
  app.get('/api/activities', requireAuth, async (req, res) => {
    try {
      let activities;
      if (req.query.employeeId) {
        activities = await getActivitiesByEmployee(
          req.orgId!,
          req.query.employeeId as string,
          req.query.startDate as string,
          req.query.endDate as string
        );
      } else {
        activities = await getAllActivities(
          req.orgId!,
          req.query.startDate as string,
          req.query.endDate as string
        );
      }
      res.json({ success: true, data: activities });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get suspicious activities
  app.get('/api/activities/suspicious', requireAuth, async (req, res) => {
    try {
      const activities = await getSuspiciousActivities(
        req.orgId!,
        req.query.employeeId as string | undefined,
        req.query.limit ? parseInt(req.query.limit as string) : 50
      );
      res.json({ success: true, data: activities });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get activity statistics
  app.get('/api/activities/stats', requireAuth, async (req, res) => {
    try {
      const stats = await getActivityStats(
        req.orgId!,
        req.query.employeeId as string | undefined,
        req.query.startDate as string | undefined,
        req.query.endDate as string | undefined
      );
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get employee activity with productivity metrics
  app.get('/api/employees/activity', requireAuth, async (req, res) => {
    try {
      const activities = await getEmployeeActivityStats(req.orgId!);
      res.json({ success: true, data: activities });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Reports
  app.get('/api/reports/summary', requireAuth, async (req, res) => {
    try {
      const { employeeId, projectId, startDate, endDate } = req.query;

      let entries;
      if (employeeId) {
        entries = await getTimeEntriesByEmployee(req.orgId!, employeeId as string, startDate as string, endDate as string);
      } else {
        entries = await getAllTimeEntries(req.orgId!, startDate as string, endDate as string);
      }

      if (projectId) {
        entries = entries.filter(e => e.projectId === projectId);
      }

      const totalSeconds = entries.reduce((sum, e) => sum + (e.duration || 0), 0);
      const billableSeconds = entries.filter(e => e.isBillable).reduce((sum, e) => sum + (e.duration || 0), 0);

      res.json({
        success: true,
        data: {
          entries,
          totalHours: Math.round(totalSeconds / 3600 * 10) / 10,
          billableHours: Math.round(billableSeconds / 3600 * 10) / 10,
          entryCount: entries.length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // NEW: Productivity report — unified formula + timezone-aware + business hours
  app.get('/api/reports/productivity', requireAuth, async (req, res) => {
    try {
      const { employeeId, startDate, endDate } = req.query;
      const viewTz = typeof req.query.tz === 'string' ? req.query.tz : undefined;

      if (!employeeId) {
        return res.status(400).json({ success: false, error: 'employeeId is required' });
      }

      // Load org + employee up front so we can resolve tz + business hours.
      const { getDatabase: _getDb } = await import('./database.js');
      const db = _getDb();
      const orgRow = await db.get('SELECT timezone FROM organizations WHERE id = ?', [req.orgId!]);
      const { resolveTimezone, getLocalDateRangeBounds } = await import('./timezone.js');
      const tz = resolveTimezone(viewTz || orgRow?.timezone);

      // Resolve client-side date range (YYYY-MM-DD) into UTC window using tz.
      const [rangeStartUtc, rangeEndUtc] = getLocalDateRangeBounds(
        (startDate as string) || new Date().toISOString().slice(0, 10),
        (endDate as string) || new Date().toISOString().slice(0, 10),
        tz
      );

      // Pull raw employee row so we get the business-hours columns too.
      const empRow = await db.get(
        `SELECT * FROM employees WHERE id = ? AND org_id = ?`,
        [employeeId, req.orgId!]
      );
      if (!empRow) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }

      // Pull the raw activities window using the tz-aware UTC bounds (strictly <).
      const rawActivities = await db.all(
        `SELECT * FROM activities
          WHERE employee_id = ? AND org_id = ?
            AND timestamp >= ? AND timestamp < ?
          ORDER BY timestamp ASC`,
        [employeeId, req.orgId!, rangeStartUtc, rangeEndUtc]
      );

      // Map to typed objects
      const mapped = (rawActivities as any[]).map((row: any) => ({
        id: row.id,
        employeeId: row.employee_id,
        timestamp: row.timestamp,
        appName: row.app_name,
        windowTitle: row.window_title,
        category: row.category,
        categoryName: row.category_name,
        productivityScore: row.productivity_score,
        productivityLevel: row.productivity_level,
        isSuspicious: row.is_suspicious === 1,
        suspiciousReason: row.suspicious_reason,
        isIdle: row.is_idle === 1,
        idleTimeSeconds: row.idle_time_seconds,
        durationSeconds: row.duration_seconds,
        createdAt: row.created_at
      }));

      // Annotate each activity with `outsideBusinessHours` (true when employee
      // has BH configured AND this timestamp falls outside them). When they
      // don't, everything is counted (24/7 solopreneur mode).
      const { annotateOutsideHours, hasBusinessHours } = await import('./business-hours.js');
      const annotated = hasBusinessHours(empRow)
        ? annotateOutsideHours(mapped, empRow, tz)
        : mapped.map(a => ({ ...a, outsideBusinessHours: false }));

      // Unified stats (single source of truth).
      const { computeProductivityStats } = await import('../shared-types.js');
      const stats = computeProductivityStats(annotated);

      // Per-day trend, also using the unified formula for consistency.
      const dailyBuckets = new Map<string, typeof annotated>();
      for (const a of annotated) {
        // group by local-date (respecting tz)
        const localYmd = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date(a.timestamp));
        if (!dailyBuckets.has(localYmd)) dailyBuckets.set(localYmd, []);
        dailyBuckets.get(localYmd)!.push(a);
      }

      const dailyTrend = Array.from(dailyBuckets.entries())
        .map(([date, list]) => {
          const s = computeProductivityStats(list);
          return {
            date,
            productivityScore: s.productivityScore,
            productiveMinutes: Math.round(s.productiveSeconds / 60),
            unproductiveMinutes: Math.round(s.unproductiveSeconds / 60),
            idleMinutes: Math.round(s.idleSeconds / 60),
            outsideHoursMinutes: Math.round(s.outsideHoursSeconds / 60),
            totalMinutes: Math.round(s.totalSeconds / 60)
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      // Category breakdown keyed by canonical id (client renders via CATEGORY_DISPLAY_NAMES).
      const categoryBreakdownSeconds: Record<string, number> = { ...stats.categorySeconds };

      // Suspicious activities — filter out system apps and cap at 50.
      const systemApps = new Set([
        'loginwindow', 'lockscreen', 'screensaver', 'window server', 'idle',
        'usernotificationcenter', 'controlcenter', 'dock', 'notificationcenter'
      ]);
      const suspiciousList = annotated
        .filter((a: any) => a.isSuspicious && !systemApps.has((a.appName || '').toLowerCase()))
        .slice(0, 50);

      res.json({
        success: true,
        data: {
          employeeId: employeeId as string,
          employeeName: empRow.name,
          dateRange: { start: startDate, end: endDate },
          timezone: tz,
          hasBusinessHours: hasBusinessHours(empRow),
          // SECONDS fields are the source of truth; hours kept for back-compat.
          summary: {
            totalSeconds:        stats.totalSeconds,
            productiveSeconds:   stats.productiveSeconds,
            unproductiveSeconds: stats.unproductiveSeconds,
            neutralSeconds:      stats.neutralSeconds,
            idleSeconds:         stats.idleSeconds,
            outsideHoursSeconds: stats.outsideHoursSeconds,
            totalHours:         Math.round(stats.totalSeconds       / 3600 * 100) / 100,
            productiveHours:    Math.round(stats.productiveSeconds  / 3600 * 100) / 100,
            unproductiveHours:  Math.round(stats.unproductiveSeconds/ 3600 * 100) / 100,
            neutralHours:       Math.round(stats.neutralSeconds     / 3600 * 100) / 100,
            idleHours:          Math.round(stats.idleSeconds        / 3600 * 100) / 100,
            outsideHoursHours:  Math.round(stats.outsideHoursSeconds/ 3600 * 100) / 100,
            averageProductivityScore: stats.productivityScore,
            focusScore: stats.productivityScore // alias
          },
          categoryBreakdownSeconds,
          // Legacy: keep the old minute-valued breakdown keyed by display name
          // so any older UI build that hits this endpoint still renders.
          categoryBreakdown: Object.fromEntries(
            Object.entries(categoryBreakdownSeconds).map(([cat, sec]) => [
              cat, Math.round(sec / 60)
            ])
          ),
          suspiciousActivities: suspiciousList,
          dailyTrend
        }
      });
    } catch (error) {
      console.error('Productivity report failed:', error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // ==========================================
  // Smart Role Detection Endpoints
  // ==========================================

  // Get detected role for an employee
  app.get('/api/roles/:employeeId', requireAuth, async (req, res) => {
    try {
      const role = await detectEmployeeRole(req.params.employeeId);
      const status = await getRoleStatus(req.params.employeeId);
      res.json({ success: true, data: { ...role, learningProgress: status.learningProgress, hoursTracked: status.hoursTracked } });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get role status for all employees (for admin dashboard)
  app.get('/api/roles', requireAuth, async (req, res) => {
    try {
      const employees = await getAllEmployees(req.orgId!);
      const roles = await Promise.all(
        employees.map(async (emp) => {
          const status = await getRoleStatus(emp.id);
          return { employeeId: emp.id, employeeName: emp.name, ...status };
        })
      );
      res.json({ success: true, data: roles });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Admin override: set role for an employee
  app.put('/api/roles/:employeeId', requireAuth, async (req, res) => {
    try {
      const { roleType } = req.body;
      const profile = ROLE_PROFILES.find(p => p.roleType === roleType);

      if (!profile) {
        return res.status(400).json({
          success: false,
          error: `Unknown role type. Valid types: ${ROLE_PROFILES.map(p => p.roleType).join(', ')}`
        });
      }

      const db = getDatabase();
      const now = new Date().toISOString();

      await db.run(
        `INSERT OR REPLACE INTO role_profiles
         (employee_id, role_type, display_name, confidence, status, detected_at, learning_started_at, updated_at)
         VALUES (?, ?, ?, 100, 'admin_override', ?, ?, ?)`,
        [req.params.employeeId, roleType, profile.displayName, now, now, now]
      );

      res.json({ success: true, data: { employeeId: req.params.employeeId, roleType, displayName: profile.displayName, status: 'admin_override' } });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // List available role types
  app.get('/api/role-types', requireAuth, (req, res) => {
    res.json({
      success: true,
      data: ROLE_PROFILES.map(p => ({
        roleType: p.roleType,
        displayName: p.displayName,
        description: p.description,
        coreApps: p.coreApps.slice(0, 10), // Show first 10
        signatureThreshold: p.signatureThreshold
      }))
    });
  });

  // Classification overrides
  app.get('/api/overrides', requireAuth, async (req, res) => {
    try {
      const db = getDatabase();
      const overrides = await db.all('SELECT * FROM classification_overrides ORDER BY created_at DESC');
      res.json({ success: true, data: overrides });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/overrides', requireAuth, async (req, res) => {
    try {
      const { employeeId, roleType, appPattern, category, productivityScore } = req.body;

      if (!appPattern || !category || productivityScore === undefined) {
        return res.status(400).json({ success: false, error: 'appPattern, category, and productivityScore are required' });
      }

      const db = getDatabase();
      const id = uuidv4();
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO classification_overrides (id, employee_id, role_type, app_pattern, category, productivity_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, employeeId || null, roleType || null, appPattern, category, productivityScore, now]
      );

      res.json({ success: true, data: { id, employeeId, roleType, appPattern, category, productivityScore } });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.delete('/api/overrides/:id', requireAuth, async (req, res) => {
    try {
      const db = getDatabase();
      await db.run('DELETE FROM classification_overrides WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });
}
