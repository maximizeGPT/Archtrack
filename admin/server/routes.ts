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
  getEmployeeActivityStats,
  // AI functions
  getDatabase
} from './database';
import { detectRepetitivePatterns, getTopAgentOpportunities } from './ai-analytics';
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

  // AI Chat Routes
  setupAIRoutes(app);
}

// AI Chat Routes Setup
function setupAIRoutes(app: Express): void {
  // Natural language query endpoint for AI chat
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { question } = req.body;
      
      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const response = await processNaturalLanguageQuery(question);
      res.json(response);
    } catch (error) {
      console.error('AI chat error:', error);
      res.status(500).json({ 
        answer: 'Sorry, I encountered an error processing your question. Please try again.' 
      });
    }
  });

  // Get repetitive patterns and automation opportunities
  app.get('/api/ai/patterns', async (req, res) => {
    try {
      const { employeeId, days } = req.query;
      const patterns = await detectRepetitivePatterns(
        employeeId as string | undefined,
        days ? parseInt(days as string) : 7
      );
      res.json(patterns);
    } catch (error) {
      console.error('Pattern detection error:', error);
      res.status(500).json({ error: 'Failed to detect patterns' });
    }
  });

  // Get top agent opportunities
  app.get('/api/ai/opportunities', async (req, res) => {
    try {
      const { limit } = req.query;
      const opportunities = await getTopAgentOpportunities(
        limit ? parseInt(limit as string) : 5
      );
      res.json(opportunities);
    } catch (error) {
      console.error('Opportunities error:', error);
      res.status(500).json({ error: 'Failed to get opportunities' });
    }
  });
}

// AI Query Processing
async function processNaturalLanguageQuery(question: string): Promise<{ answer: string; sql?: string; data?: any[]; suggestions?: string[] }> {
  const lowerQuestion = question.toLowerCase();
  const db = getDatabase();

  // Pattern: Personal improvement/advice queries
  if (lowerQuestion.includes('do better') || lowerQuestion.includes('improve') || lowerQuestion.includes('help') || lowerQuestion.includes('advice')) {
    return handleImprovementQuery(lowerQuestion, db);
  }

  // Pattern: Architecture firm owner specific queries
  if (lowerQuestion.includes('slacking') || lowerQuestion.includes('slacker') || (lowerQuestion.includes('not working') && !lowerQuestion.includes('slack'))) {
    return handleSlackingQuery(lowerQuestion, db);
  }

  if (lowerQuestion.includes('overtime') || lowerQuestion.includes('working late') || lowerQuestion.includes('long hours')) {
    return handleOvertimeQuery(lowerQuestion, db);
  }

  if (lowerQuestion.includes('non-work') || lowerQuestion.includes('wasting time') || lowerQuestion.includes('goofing off') || lowerQuestion.includes('personal time')) {
    return handleNonWorkQuery(lowerQuestion, db);
  }

  if (lowerQuestion.includes('burnout') || lowerQuestion.includes('overworked') || lowerQuestion.includes('stressed')) {
    return handleBurnoutQuery(lowerQuestion, db);
  }

  if (lowerQuestion.includes('capacity') || lowerQuestion.includes('bandwidth') || lowerQuestion.includes('who can take') || lowerQuestion.includes('new project')) {
    return handleCapacityQuery(lowerQuestion, db);
  }

  if (lowerQuestion.includes('best') || lowerQuestion.includes('top performer') || lowerQuestion.includes('star employee') || lowerQuestion.includes('most efficient')) {
    return handleTopPerformerQuery(lowerQuestion, db);
  }

  // Pattern: Specific app queries
  if (lowerQuestion.includes('youtube') || lowerQuestion.includes('email') || lowerQuestion.includes('slack') || lowerQuestion.includes('chrome')) {
    return handleSpecificAppQuery(lowerQuestion, db);
  }

  // Pattern: "How is [name] doing" - status check
  if ((lowerQuestion.includes('how is') || lowerQuestion.includes('how\'s')) && lowerQuestion.includes('doing')) {
    return handleStatusQuery(lowerQuestion, db);
  }

  // Pattern: Time spent queries
  if (lowerQuestion.includes('time') && (lowerQuestion.includes('spend') || lowerQuestion.includes('spent'))) {
    return handleTimeSpentQuery(lowerQuestion, db);
  }

  // Pattern: Productivity queries
  if (lowerQuestion.includes('productive') || lowerQuestion.includes('productivity')) {
    return handleProductivityQuery(lowerQuestion, db);
  }

  // Pattern: Repetitive tasks / automation
  if (lowerQuestion.includes('repetitive') || lowerQuestion.includes('automation') || lowerQuestion.includes('automate')) {
    return handleRepetitiveTasksQuery(db);
  }

  // Pattern: Employee-specific queries
  if (lowerQuestion.includes('employee') || lowerQuestion.includes('who')) {
    return handleEmployeeQuery(lowerQuestion, db);
  }

  // Pattern: App/website queries
  if (lowerQuestion.includes('app') || lowerQuestion.includes('website')) {
    return handleAppQuery(lowerQuestion, db);
  }

  // Default: General summary
  return handleGeneralQuery(db);
}

// Helper functions for AI queries
async function extractEmployeeName(question: string, db: any): Promise<{ id: string; name: string } | null> {
  const employees = await db.all('SELECT id, name FROM employees');
  const sorted = employees.sort((a: any, b: any) => b.name.length - a.name.length);
  return sorted.find((e: any) => question.toLowerCase().includes(e.name.toLowerCase())) || null;
}

function extractTimeframe(question: string): { days: number; label: string } {
  const lower = question.toLowerCase();
  if (lower.includes('today')) return { days: 1, label: 'today' };
  if (lower.includes('yesterday')) return { days: 1, label: 'yesterday' };
  if (lower.includes('this week')) return { days: 7, label: 'this week' };
  if (lower.includes('last week')) return { days: 7, label: 'last week' };
  if (lower.includes('this month')) return { days: 30, label: 'this month' };
  if (lower.includes('last month')) return { days: 30, label: 'last month' };
  return { days: 7, label: 'the last 7 days' };
}

// Query handlers
async function handleGeneralQuery(db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const row = await db.get(`
    SELECT 
      COUNT(DISTINCT employee_id) as active_employees,
      SUM(duration_seconds) / 3600 as total_hours,
      AVG(productivity_score) as avg_productivity,
      SUM(CASE WHEN is_suspicious = 1 THEN 1 ELSE 0 END) as suspicious_activities
    FROM activities
    WHERE timestamp > datetime('now', '-7 days')
  `);

  const answer = `**📊 Weekly Team Summary**\n\n` +
    `• **${row.active_employees}** employees actively tracked\n` +
    `• **${Math.round(row.total_hours * 10) / 10}** total hours logged\n` +
    `• **${Math.round(row.avg_productivity)}%** average productivity score\n` +
    `• **${row.suspicious_activities}** activities flagged for review\n\n` +
    `**Try asking:**\n` +
    `• "How is [name] doing today?"\n` +
    `• "What can [name] do better?"\n` +
    `• "Who spent the most time on YouTube?"\n` +
    `• "What are the automation opportunities?"`;

  return { answer, suggestions: ['Show repetitive tasks', 'Who is most productive?', 'Time breakdown by app'] };
}

async function handleImprovementQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  if (!employee) {
    return {
      answer: "I'd be happy to help! To give personalized improvement suggestions, could you tell me which employee you'd like advice for?",
      suggestions: ['What can Mohammed do better?', 'How to improve productivity?', 'Time management tips']
    };
  }

  const stats = await db.get(`
    SELECT 
      AVG(productivity_score) as avg_score,
      SUM(CASE WHEN productivity_level = 'productive' THEN duration_seconds ELSE 0 END) / 3600 as productive_hours,
      SUM(CASE WHEN productivity_level = 'unproductive' THEN duration_seconds ELSE 0 END) / 3600 as unproductive_hours,
      SUM(CASE WHEN productivity_level = 'idle' THEN duration_seconds ELSE 0 END) / 3600 as idle_hours,
      SUM(duration_seconds) / 3600 as total_hours
    FROM activities
    WHERE employee_id = ?
    AND timestamp > datetime('now', '-${timeframe.days} days')
  `, [employee.id]);

  const productivePct = stats.total_hours > 0 ? Math.round((stats.productive_hours / stats.total_hours) * 100) : 0;
  const unproductivePct = stats.total_hours > 0 ? Math.round((stats.unproductive_hours / stats.total_hours) * 100) : 0;
  const idlePct = stats.total_hours > 0 ? Math.round((stats.idle_hours / stats.total_hours) * 100) : 0;

  let answer = `**${employee.name}'s Productivity Analysis (${timeframe.label})**\n\n`;
  answer += `**Current Stats:**\n`;
  answer += `• Productivity Score: ${Math.round(stats.avg_score)}%\n`;
  answer += `• Productive Time: ${productivePct}%\n`;
  answer += `• Unproductive Time: ${unproductivePct}%\n`;
  answer += `• Idle Time: ${idlePct}%\n\n`;

  const recommendations: string[] = [];
  if (stats.avg_score < 50) recommendations.push('**Focus Improvement:** Try using website blockers during work hours');
  if (idlePct > 30) recommendations.push('**High Idle Time:** Consider structured breaks (Pomodoro technique)');
  if (stats.avg_score > 70) recommendations.unshift('**Great work!** Productivity score is above average. 🎉');
  if (recommendations.length === 0) recommendations.push('**Tracking Well:** Data shows balanced activity.');

  answer += `**Recommendations:**\n` + recommendations.join('\n\n');

  return { answer, suggestions: ['Show time breakdown', 'What apps are used most?', 'Compare to team average'] };
}

async function handleSlackingQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const timeframe = extractTimeframe(question);
  
  const data = await db.all(`
    SELECT 
      e.name,
      e.department,
      AVG(a.productivity_score) as avg_score,
      SUM(CASE WHEN a.productivity_level = 'idle' THEN a.duration_seconds ELSE 0 END) / 3600 as idle_hours
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    HAVING avg_score < 40 OR idle_hours > 2
    ORDER BY avg_score ASC
  `);

  if (data.length === 0) {
    return {
      answer: `**Good news!** No one appears to be slacking off ${timeframe.label}.`,
      suggestions: ['Who is most productive?', 'Show overtime workers', 'Team efficiency trends']
    };
  }

  let answer = `**Employees with Low Activity ${timeframe.label}**\n\n`;
  data.forEach((row: any) => {
    const emoji = row.avg_score < 20 ? '🔴' : '🟠';
    answer += `${emoji} **${row.name}**: ${Math.round(row.avg_score)}% productivity\n`;
  });

  return { answer, suggestions: ['What can they improve?', 'Compare to last week', 'Show their app usage'] };
}

async function handleOvertimeQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const timeframe = extractTimeframe(question);
  const data = await db.all(`
    SELECT 
      e.name,
      SUM(a.duration_seconds) / 3600 as total_hours
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    HAVING total_hours > 40
    ORDER BY total_hours DESC
  `);

  if (data.length === 0) {
    return {
      answer: `No one is working excessive overtime ${timeframe.label}.`,
      suggestions: ['Who has capacity for more work?', 'Show burnout risk', 'Team workload balance']
    };
  }

  let answer = `**Employees Working Overtime ${timeframe.label}**\n\n`;
  data.forEach((row: any) => {
    answer += `💪 **${row.name}**: ${Math.round(row.total_hours)}h\n`;
  });

  return { answer, suggestions: ['Check for burnout risk', 'Who has capacity?', 'Workload distribution'] };
}

async function handleNonWorkQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  let sql: string;
  let params: any[];

  if (employee) {
    sql = `
      SELECT app_name, SUM(duration_seconds) / 3600 as hours
      FROM activities
      WHERE employee_id = ?
      AND category_name IN ('entertainment', 'social_media', 'shopping')
      AND timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY app_name
      ORDER BY hours DESC
    `;
    params = [employee.id];
  } else {
    sql = `
      SELECT e.name as employee_name, SUM(a.duration_seconds) / 3600 as hours
      FROM activities a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.category_name IN ('entertainment', 'social_media', 'shopping')
      AND a.timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY a.employee_id
      ORDER BY hours DESC
    `;
    params = [];
  }

  const data = await db.all(sql, params);

  if (data.length === 0) {
    return {
      answer: `Great! No significant non-work activity detected ${timeframe.label}.`,
      suggestions: ['Show productivity leaders', 'Who deserves recognition?', 'Team performance']
    };
  }

  let answer = employee 
    ? `**${employee.name}'s Non-Work Activity**\n\n`
    : `**Non-Work Time by Employee**\n\n`;
  
  data.forEach((row: any, idx: number) => {
    answer += `${idx + 1}. **${row.employee_name || row.app_name}**: ${Math.round(row.hours * 10) / 10}h\n`;
  });

  return { answer, suggestions: ['What can they improve?', 'Show their productive time', 'Compare to team average'] };
}

async function handleBurnoutQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const data = await db.all(`
    SELECT 
      e.name,
      SUM(CASE WHEN a.timestamp > datetime('now', '-7 days') THEN a.duration_seconds ELSE 0 END) / 3600 as recent_hours,
      AVG(CASE WHEN a.timestamp > datetime('now', '-7 days') THEN a.productivity_score END) as recent_score
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-14 days')
    GROUP BY e.id
    HAVING recent_hours > 45 OR recent_score < 50
    ORDER BY recent_hours DESC
  `);

  if (data.length === 0) {
    return {
      answer: `**Good news!** No employees show signs of burnout.`,
      suggestions: ['Show overtime workers', 'Who has capacity?', 'Team wellness check']
    };
  }

  let answer = `**Employees at Risk of Burnout**\n\n`;
  data.forEach((row: any) => {
    const riskLevel = (row.recent_hours > 50 && row.recent_score < 50) ? '🔴 HIGH' : '🟠 MEDIUM';
    answer += `${riskLevel} **${row.name}**: ${Math.round(row.recent_hours)}h, ${Math.round(row.recent_score)}% productivity\n`;
  });

  return { answer, suggestions: ['Redistribute workload', 'Who has capacity?', 'Show overtime trends'] };
}

async function handleCapacityQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const timeframe = extractTimeframe(question);
  const standardHours = timeframe.days * 8;

  const data = await db.all(`
    SELECT 
      e.name,
      SUM(a.duration_seconds) / 3600 as hours_worked
    FROM employees e
    LEFT JOIN activities a ON e.id = a.employee_id 
      AND a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    ORDER BY hours_worked ASC
  `);

  let answer = `**Employee Capacity Analysis**\n\n`;
  const available = data.filter((e: any) => e.hours_worked < standardHours * 0.8);

  if (available.length > 0) {
    answer += `**🟢 Available:**\n`;
    available.forEach((row: any) => {
      const remaining = Math.round((standardHours - row.hours_worked) * 10) / 10;
      answer += `• **${row.name}**: ${remaining}h available\n`;
    });
    answer += `\n**Recommendation:** Give new work to **${available[0].name}**.`;
  } else {
    answer += `No employees with significant capacity available.`;
  }

  return { answer, suggestions: ['Show burnout risk', 'Redistribute workload', 'Who is most efficient?'] };
}

async function handleTopPerformerQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const timeframe = extractTimeframe(question);

  const data = await db.all(`
    SELECT 
      e.name,
      AVG(a.productivity_score) as avg_score,
      SUM(a.duration_seconds) / 3600 as total_hours
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    HAVING avg_score > 60 AND total_hours > 10
    ORDER BY avg_score DESC
    LIMIT 5
  `);

  if (data.length === 0) {
    return {
      answer: `No clear top performers identified ${timeframe.label}.`,
      suggestions: ['Show all employees', 'Who is improving?', 'Team productivity overview']
    };
  }

  let answer = `**🏆 Top Performers ${timeframe.label}**\n\n`;
  data.forEach((row: any, idx: number) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
    answer += `${medal} **${row.name}**: ${Math.round(row.avg_score)}% productivity\n`;
  });

  return { answer, suggestions: ['What makes them successful?', 'Show their work patterns', 'Compare to others'] };
}

async function handleSpecificAppQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  let appName = 'Chrome';
  if (question.includes('youtube')) appName = 'YouTube';
  if (question.includes('slack')) appName = 'Slack';
  if (question.includes('email')) appName = 'Mail';

  let sql: string;
  let params: any[];

  if (employee) {
    sql = `SELECT app_name, SUM(duration_seconds) / 3600 as hours FROM activities WHERE employee_id = ? AND app_name LIKE ? AND timestamp > datetime('now', '-${timeframe.days} days') GROUP BY app_name`;
    params = [employee.id, `%${appName}%`];
  } else {
    sql = `SELECT e.name as employee_name, SUM(a.duration_seconds) / 3600 as hours FROM activities a JOIN employees e ON a.employee_id = e.id WHERE a.app_name LIKE ? AND a.timestamp > datetime('now', '-${timeframe.days} days') GROUP BY a.employee_id ORDER BY hours DESC`;
    params = [`%${appName}%`];
  }

  const data = await db.all(sql, params);

  if (data.length === 0) {
    return { answer: `No ${appName} activity found.`, suggestions: ['Show all apps used', 'Weekly summary'] };
  }

  let answer = employee 
    ? `**${employee.name}'s ${appName} Usage**\n\n`
    : `**${appName} Usage by Employee**\n\n`;
  
  data.forEach((row: any) => {
    answer += `• **${row.employee_name || row.app_name}**: ${Math.round(row.hours * 10) / 10}h\n`;
  });

  return { answer, suggestions: ['Compare to last week', 'What else are they using?', 'Productivity tips'] };
}

async function handleStatusQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const employee = await extractEmployeeName(question, db);
  if (!employee) return handleGeneralQuery(db);

  const today = await db.get(`
    SELECT AVG(productivity_score) as avg_score, SUM(duration_seconds) / 3600 as total_hours
    FROM activities WHERE employee_id = ? AND timestamp > datetime('now', '-1 days')
  `, [employee.id]);

  let answer = `**${employee.name}'s Status**\n\n`;
  if (today.total_hours === 0) {
    answer += `📭 No activity recorded today.`;
  } else {
    answer += `• Productivity Score: ${Math.round(today.avg_score)}%\n`;
    answer += `• Hours Tracked: ${Math.round(today.total_hours * 10) / 10}h`;
  }

  return { answer, suggestions: ['What can they improve?', 'Show weekly trend', 'Compare to team'] };
}

async function handleTimeSpentQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  let sql: string;
  let params: any[];

  if (employee) {
    sql = `SELECT app_name, SUM(duration_seconds) / 3600 as hours FROM activities WHERE employee_id = ? AND timestamp > datetime('now', '-${timeframe.days} days') GROUP BY app_name ORDER BY hours DESC LIMIT 10`;
    params = [employee.id];
  } else {
    sql = `SELECT e.name as employee_name, SUM(a.duration_seconds) / 3600 as hours FROM activities a JOIN employees e ON a.employee_id = e.id WHERE a.timestamp > datetime('now', '-${timeframe.days} days') GROUP BY a.employee_id ORDER BY hours DESC`;
    params = [];
  }

  const data = await db.all(sql, params);

  let answer: string;
  if (employee) {
    const totalHours = data.reduce((sum: number, row: any) => sum + row.hours, 0);
    const topApps = data.slice(0, 3).map((row: any) => `${row.app_name} (${Math.round(row.hours * 10) / 10}h)`).join(', ');
    answer = `${employee.name} spent ${Math.round(totalHours * 10) / 10} hours on the computer ${timeframe.label}. Top apps: ${topApps}.`;
  } else {
    answer = `Time spent by employee ${timeframe.label}:\n\n` +
      data.map((row: any) => `• ${row.employee_name}: ${Math.round(row.hours * 10) / 10} hours`).join('\n');
  }

  return { answer, suggestions: ['Show productivity scores', 'What apps were used most?', 'Any suspicious activity?'] };
}

async function handleProductivityQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const timeframe = extractTimeframe(question);

  const data = await db.all(`
    SELECT e.name as employee_name, AVG(a.productivity_score) as avg_score
    FROM activities a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY a.employee_id
    ORDER BY avg_score DESC
  `);

  const answer = `Productivity rankings ${timeframe.label}:\n\n` +
    data.map((row: any, idx: number) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
      return `${medal} ${row.employee_name}: ${Math.round(row.avg_score)}%`;
    }).join('\n');

  return { answer, suggestions: ['Who was least productive?', 'Show time wasters', 'Repetitive task opportunities'] };
}

async function handleRepetitiveTasksQuery(db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const patterns = await detectRepetitivePatterns(undefined, 14);
  const validPatterns = patterns.filter(p => p.totalTimeHours >= 0.5);
  
  if (validPatterns.length === 0) {
    return {
      answer: "I haven't detected any clear repetitive patterns yet. Check back after more data is collected.",
      suggestions: ['Show productivity summary', 'What apps are used most?', 'Employee time breakdown']
    };
  }

  let answer = `**${validPatterns.length} Automation Opportunities Found**\n\n`;
  validPatterns.slice(0, 5).forEach((pattern, idx) => {
    const emoji = pattern.automationPotential === 'high' ? '🔥' : '⚡';
    answer += `${idx + 1}. ${emoji} **${pattern.description}**\n`;
    answer += `   • Time cost: **${pattern.totalTimeHours} hours/week**\n`;
    answer += `   • 💡 ${pattern.suggestedSolution}\n\n`;
  });

  return { answer, suggestions: ['Show all patterns', 'Which tasks are easiest to automate?', 'Employee-specific opportunities'] };
}

async function handleEmployeeQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const data = await db.all(`
    SELECT e.name, e.department, COUNT(DISTINCT DATE(a.timestamp)) as days_active,
      SUM(a.duration_seconds) / 3600 as total_hours, AVG(a.productivity_score) as avg_productivity
    FROM employees e
    LEFT JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-7 days')
    GROUP BY e.id
    ORDER BY total_hours DESC
  `);

  const answer = `**Employee Activity Summary (Last 7 Days)**\n\n` +
    data.map((row: any) => {
      const hours = Math.round(row.total_hours * 10) / 10;
      const productivity = Math.round(row.avg_productivity);
      return `• **${row.name}** (${row.department})\n   ${hours}h tracked • ${productivity}% productivity`;
    }).join('\n\n');

  return { answer, suggestions: ['Who worked the most hours?', 'Show suspicious activity', 'Department comparison'] };
}

async function handleAppQuery(question: string, db: any): Promise<{ answer: string; suggestions?: string[] }> {
  const timeframe = extractTimeframe(question);

  const data = await db.all(`
    SELECT app_name, SUM(duration_seconds) / 3600 as hours, COUNT(DISTINCT employee_id) as users, AVG(productivity_score) as avg_score
    FROM activities
    WHERE timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY app_name
    ORDER BY hours DESC
    LIMIT 10
  `);

  const answer = `**Top 10 Apps ${timeframe.label}**\n\n` +
    data.map((row: any, idx: number) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
      return `${medal} **${row.app_name}**: ${Math.round(row.hours * 10) / 10}h (${row.users} users)`;
    }).join('\n');

  return { answer, suggestions: ['Show distracting apps', 'Most productive apps', 'App usage trends'] };
}
