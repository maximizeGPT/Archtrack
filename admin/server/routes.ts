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
  // NEW: Activity tracking functions
  createActivity,
  getActivitiesByEmployee,
  getAllActivities,
  getSuspiciousActivities,
  getActivityStats,
  getEmployeeActivityStats
} from './database';
import type { Activity } from '@archtrack/shared';

export function setupRoutes(app: Express): void {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Dashboard
  app.get('/api/dashboard/stats', async (req, res) => {
    try {
      const stats = await getDashboardStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Employees
  app.get('/api/employees', async (req, res) => {
    try {
      const employees = await getAllEmployees();
      res.json({ success: true, data: employees });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get('/api/employees/:id', async (req, res) => {
    try {
      const employee = await getEmployeeById(req.params.id);
      if (!employee) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }
      res.json({ success: true, data: employee });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/employees', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const employee = {
        id: uuidv4(),
        ...req.body,
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

  app.put('/api/employees/:id', async (req, res) => {
    try {
      await updateEmployee(req.params.id, req.body);
      const employee = await getEmployeeById(req.params.id);
      res.json({ success: true, data: employee });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.delete('/api/employees/:id', async (req, res) => {
    try {
      await deleteEmployee(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Projects
  app.get('/api/projects', async (req, res) => {
    try {
      const projects = await getAllProjects();
      res.json({ success: true, data: projects });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await getProjectById(req.params.id);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const project = {
        id: uuidv4(),
        ...req.body,
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

  app.put('/api/projects/:id', async (req, res) => {
    try {
      await updateProject(req.params.id, req.body);
      const project = await getProjectById(req.params.id);
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Tasks
  app.get('/api/tasks', async (req, res) => {
    try {
      let tasks;
      if (req.query.projectId) {
        tasks = await getTasksByProject(req.query.projectId as string);
      } else {
        tasks = await getAllTasks();
      }
      res.json({ success: true, data: tasks });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const task = {
        id: uuidv4(),
        ...req.body,
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

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      await updateTask(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Legacy Time Entries
  app.get('/api/time-entries', async (req, res) => {
    try {
      let entries;
      if (req.query.employeeId) {
        entries = await getTimeEntriesByEmployee(
          req.query.employeeId as string,
          req.query.startDate as string,
          req.query.endDate as string
        );
      } else {
        entries = await getAllTimeEntries(
          req.query.startDate as string,
          req.query.endDate as string
        );
      }
      res.json({ success: true, data: entries });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get('/api/time-entries/active', async (req, res) => {
    try {
      const entries = await getActiveTimeEntries();
      res.json({ success: true, data: entries });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.post('/api/time-entries', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const entry = {
        id: uuidv4(),
        ...req.body,
        createdAt: now,
        updatedAt: now
      };
      await createTimeEntry(entry);
      res.json({ success: true, data: entry });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.put('/api/time-entries/:id', async (req, res) => {
    try {
      await updateTimeEntry(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // NEW: Activity Tracking Endpoints
  
  // Receive activities from desktop app
  app.post('/api/activity', async (req, res) => {
    try {
      const { employeeId, activities } = req.body;
      
      if (!employeeId || !Array.isArray(activities)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing employeeId or activities array' 
        });
      }

      let suspiciousCount = 0;
      const savedActivities: Activity[] = [];

      for (const activityData of activities) {
        const activity: Activity = {
          id: activityData.id || uuidv4(),
          employeeId,
          timestamp: activityData.timestamp,
          appName: activityData.appName,
          windowTitle: activityData.windowTitle,
          category: activityData.category,
          categoryName: activityData.categoryName,
          productivityScore: activityData.productivityScore,
          productivityLevel: activityData.productivityLevel,
          isSuspicious: activityData.isSuspicious || false,
          suspiciousReason: activityData.suspiciousReason,
          isIdle: activityData.isIdle || false,
          idleTimeSeconds: activityData.idleTimeSeconds || 0,
          durationSeconds: activityData.durationSeconds || 0,
          createdAt: new Date().toISOString()
        };

        await createActivity(activity);
        savedActivities.push(activity);

        if (activity.isSuspicious) {
          suspiciousCount++;
        }
      }

      res.json({ 
        success: true, 
        data: { 
          syncedCount: savedActivities.length,
          suspiciousCount 
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get activities for an employee
  app.get('/api/activities', async (req, res) => {
    try {
      let activities;
      if (req.query.employeeId) {
        activities = await getActivitiesByEmployee(
          req.query.employeeId as string,
          req.query.startDate as string,
          req.query.endDate as string
        );
      } else {
        activities = await getAllActivities(
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
  app.get('/api/activities/suspicious', async (req, res) => {
    try {
      const activities = await getSuspiciousActivities(
        req.query.employeeId as string | undefined,
        req.query.limit ? parseInt(req.query.limit as string) : 50
      );
      res.json({ success: true, data: activities });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Get activity statistics
  app.get('/api/activities/stats', async (req, res) => {
    try {
      const stats = await getActivityStats(
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
  app.get('/api/employees/activity', async (req, res) => {
    try {
      const activities = await getEmployeeActivityStats();
      res.json({ success: true, data: activities });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Reports
  app.get('/api/reports/summary', async (req, res) => {
    try {
      const { employeeId, projectId, startDate, endDate } = req.query;
      
      let entries;
      if (employeeId) {
        entries = await getTimeEntriesByEmployee(employeeId as string, startDate as string, endDate as string);
      } else {
        entries = await getAllTimeEntries(startDate as string, endDate as string);
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

  // NEW: Productivity report
  app.get('/api/reports/productivity', async (req, res) => {
    try {
      const { employeeId, startDate, endDate } = req.query;
      
      if (!employeeId) {
        return res.status(400).json({ success: false, error: 'employeeId is required' });
      }

      const activities = await getActivitiesByEmployee(
        employeeId as string,
        startDate as string,
        endDate as string
      );

      const employee = await getEmployeeById(employeeId as string);

      // FIX: Sort activities by timestamp ASCENDING (oldest first) for correct duration calculation
      const sortedActivities = [...activities].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // FIX: Calculate actual time between activities, not summed durationSeconds
      const categoryBreakdown: Record<string, number> = {};
      let productiveSeconds = 0;
      let unproductiveSeconds = 0;
      let neutralSeconds = 0;
      let totalScore = 0;

      for (let i = 0; i < sortedActivities.length; i++) {
        const current = sortedActivities[i];
        const next = sortedActivities[i + 1];
        
        // Calculate duration until next activity or cap at 10 minutes
        let durationSeconds = 10; // default 10 seconds
        if (next) {
          const currentTime = new Date(current.timestamp).getTime();
          const nextTime = new Date(next.timestamp).getTime();
          durationSeconds = Math.min((nextTime - currentTime) / 1000, 600); // cap at 10 minutes
        }
        
        const minutes = durationSeconds / 60;
        categoryBreakdown[current.categoryName] = (categoryBreakdown[current.categoryName] || 0) + minutes;

        if (current.productivityLevel === 'productive') {
          productiveSeconds += durationSeconds;
        } else if (current.productivityLevel === 'unproductive') {
          unproductiveSeconds += durationSeconds;
        } else {
          neutralSeconds += durationSeconds;
        }

        totalScore += current.productivityScore;
      }

      const avgScore = sortedActivities.length > 0 ? Math.round(totalScore / sortedActivities.length) : 0;

      // Group by day for trend
      const dailyMap = new Map<string, { productive: number; unproductive: number; totalScore: number; count: number }>();
      
      for (let i = 0; i < sortedActivities.length; i++) {
        const current = sortedActivities[i];
        const next = sortedActivities[i + 1];
        const date = current.timestamp.split('T')[0];
        const existing = dailyMap.get(date) || { productive: 0, unproductive: 0, totalScore: 0, count: 0 };
        
        // Calculate duration until next activity or cap at 10 minutes
        let durationSeconds = 10; // default 10 seconds
        if (next) {
          const currentTime = new Date(current.timestamp).getTime();
          const nextTime = new Date(next.timestamp).getTime();
          durationSeconds = Math.min((nextTime - currentTime) / 1000, 600); // cap at 10 minutes
        }
        
        if (current.productivityLevel === 'productive') {
          existing.productive += durationSeconds;
        } else if (current.productivityLevel === 'unproductive') {
          existing.unproductive += durationSeconds;
        }
        existing.totalScore += current.productivityScore;
        existing.count++;
        
        dailyMap.set(date, existing);
      }

      const dailyTrend = Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        productivityScore: data.count > 0 ? Math.round(data.totalScore / data.count) : 0,
        productiveMinutes: Math.round(data.productive / 60),
        unproductiveMinutes: Math.round(data.unproductive / 60)
      })).sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        success: true,
        data: {
          employeeId,
          employeeName: employee?.name || 'Unknown',
          dateRange: { start: startDate, end: endDate },
          summary: {
            totalHours: Math.round((productiveSeconds + unproductiveSeconds + neutralSeconds) / 3600 * 10) / 10,
            productiveHours: Math.round(productiveSeconds / 3600 * 10) / 10,
            unproductiveHours: Math.round(unproductiveSeconds / 3600 * 10) / 10,
            neutralHours: Math.round(neutralSeconds / 3600 * 10) / 10,
            averageProductivityScore: avgScore,
            focusScore: avgScore // Alias for consistency
          },
          categoryBreakdown,
          suspiciousActivities: sortedActivities.filter(a => a.isSuspicious),
          dailyTrend
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });
}
