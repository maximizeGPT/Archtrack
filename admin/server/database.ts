import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Employee, Project, Task, TimeEntry, Activity, ProductivityReport } from '@archtrack/shared';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function initDatabase(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (db) return db;

  const dbDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'admin.db');

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await createTables();
  await seedTestData();

  return db;
}

export function getDatabase(): Database<sqlite3.Database, sqlite3.Statement> {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

async function createTables(): Promise<void> {
  if (!db) return;

  await db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'employee',
      department TEXT,
      hourly_rate REAL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      client_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      start_date TEXT NOT NULL,
      end_date TEXT,
      budget REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      estimated_hours REAL,
      assigned_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (assigned_to) REFERENCES employees(id)
    );

    -- NEW: Activities table for smart tracking
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      app_name TEXT NOT NULL,
      window_title TEXT NOT NULL,
      category TEXT NOT NULL,
      category_name TEXT NOT NULL,
      productivity_score INTEGER NOT NULL,
      productivity_level TEXT NOT NULL,
      is_suspicious INTEGER DEFAULT 0,
      suspicious_reason TEXT,
      is_idle INTEGER DEFAULT 0,
      idle_time_seconds INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- Legacy time_entries table (kept for compatibility)
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      task_id TEXT,
      project_id TEXT,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration INTEGER DEFAULT 0,
      is_billable INTEGER DEFAULT 1,
      idle_time INTEGER DEFAULT 0,
      source TEXT DEFAULT 'desktop',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_activities_employee ON activities(employee_id);
    CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);
    CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
  `);
}

async function seedTestData(): Promise<void> {
  if (!db) return;

  // Check if already seeded
  const count = await db.get('SELECT COUNT(*) as count FROM employees');
  if (count.count > 0) return;

  const now = new Date().toISOString();

  // Seed employees
  const employees = [
    { id: 'emp-001', name: 'Mohammed', email: 'mohammed@archfirm.com', role: 'employee', department: 'Architecture', hourly_rate: 75 },
    { id: 'emp-002', name: 'Ahmed', email: 'ahmed@archfirm.com', role: 'employee', department: 'Architecture', hourly_rate: 65 },
    { id: 'emp-003', name: 'Sarah', email: 'sarah@archfirm.com', role: 'manager', department: 'Design', hourly_rate: 85 },
  ];

  for (const emp of employees) {
    await db.run(
      `INSERT INTO employees (id, name, email, role, department, hourly_rate, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [emp.id, emp.name, emp.email, emp.role, emp.department, emp.hourly_rate, now, now]
    );
  }

  // Seed projects
  const projects = [
    { id: 'proj-001', name: 'Downtown Office Complex', description: 'Modern office building with sustainable design', client_name: 'ABC Corp', budget: 500000 },
    { id: 'proj-002', name: 'Residential Tower', description: 'High-rise residential building', client_name: 'XYZ Developers', budget: 750000 },
    { id: 'proj-003', name: 'Community Center', description: 'Multi-purpose community facility', client_name: 'City Council', budget: 300000 },
  ];

  for (const proj of projects) {
    await db.run(
      `INSERT INTO projects (id, name, description, client_name, status, start_date, budget, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [proj.id, proj.name, proj.description, proj.client_name, now, proj.budget, now, now]
    );
  }

  // Seed tasks
  const tasks = [
    { id: 'task-001', project_id: 'proj-001', name: 'Initial Design Concepts', description: 'Create initial design concepts', priority: 'high', estimated_hours: 40, assigned_to: 'emp-001' },
    { id: 'task-002', project_id: 'proj-001', name: 'Site Analysis', description: 'Analyze site conditions', priority: 'high', estimated_hours: 16, assigned_to: 'emp-002' },
    { id: 'task-003', project_id: 'proj-002', name: 'Floor Plan Development', description: 'Develop detailed floor plans', priority: 'medium', estimated_hours: 60, assigned_to: 'emp-001' },
    { id: 'task-004', project_id: 'proj-003', name: 'Client Meeting Prep', description: 'Prepare presentation materials', priority: 'low', estimated_hours: 8, assigned_to: 'emp-003' },
  ];

  for (const task of tasks) {
    await db.run(
      `INSERT INTO tasks (id, project_id, name, description, status, priority, estimated_hours, assigned_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)`,
      [task.id, task.project_id, task.name, task.description, task.priority, task.estimated_hours, task.assigned_to, now, now]
    );
  }

  console.log('✅ Test data seeded');
}

// Employee operations
export async function getAllEmployees(): Promise<Employee[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM employees WHERE is_active = 1 ORDER BY name');
  return rows.map(mapEmployee);
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM employees WHERE id = ?', id);
  return row ? mapEmployee(row) : null;
}

export async function createEmployee(employee: Employee): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO employees (id, name, email, role, department, hourly_rate, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [employee.id, employee.name, employee.email, employee.role, employee.department, employee.hourlyRate, employee.createdAt, employee.updatedAt]
  );
}

export async function updateEmployee(id: string, updates: Partial<Employee>): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.email) { sets.push('email = ?'); values.push(updates.email); }
  if (updates.role) { sets.push('role = ?'); values.push(updates.role); }
  if (updates.department) { sets.push('department = ?'); values.push(updates.department); }
  if (updates.hourlyRate !== undefined) { sets.push('hourly_rate = ?'); values.push(updates.hourlyRate); }
  
  sets.push('updated_at = ?'); values.push(now);
  values.push(id);
  
  await db.run(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function deleteEmployee(id: string): Promise<void> {
  const db = getDatabase();
  await db.run('UPDATE employees SET is_active = 0 WHERE id = ?', id);
}

function mapEmployee(row: any): Employee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    hourlyRate: row.hourly_rate,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Project operations
export async function getAllProjects(): Promise<Project[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM projects ORDER BY name');
  return rows.map(mapProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM projects WHERE id = ?', id);
  return row ? mapProject(row) : null;
}

export async function createProject(project: Project): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO projects (id, name, description, client_name, status, start_date, end_date, budget, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [project.id, project.name, project.description, project.clientName, project.status, project.startDate, project.endDate, project.budget, project.createdAt, project.updatedAt]
  );
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.description) { sets.push('description = ?'); values.push(updates.description); }
  if (updates.clientName) { sets.push('client_name = ?'); values.push(updates.clientName); }
  if (updates.status) { sets.push('status = ?'); values.push(updates.status); }
  if (updates.budget !== undefined) { sets.push('budget = ?'); values.push(updates.budget); }
  
  sets.push('updated_at = ?'); values.push(now);
  values.push(id);
  
  await db.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, values);
}

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    clientName: row.client_name,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    budget: row.budget,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Task operations
export async function getAllTasks(): Promise<Task[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM tasks ORDER BY updated_at DESC');
  return rows.map(mapTask);
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM tasks WHERE project_id = ?', projectId);
  return rows.map(mapTask);
}

export async function createTask(task: Task): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO tasks (id, project_id, name, description, status, priority, estimated_hours, assigned_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [task.id, task.projectId, task.name, task.description, task.status, task.priority, task.estimatedHours, task.assignedTo, task.createdAt, task.updatedAt]
  );
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.description) { sets.push('description = ?'); values.push(updates.description); }
  if (updates.status) { sets.push('status = ?'); values.push(updates.status); }
  if (updates.priority) { sets.push('priority = ?'); values.push(updates.priority); }
  if (updates.assignedTo) { sets.push('assigned_to = ?'); values.push(updates.assignedTo); }
  
  sets.push('updated_at = ?'); values.push(now);
  values.push(id);
  
  await db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, values);
}

function mapTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    estimatedHours: row.estimated_hours,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// NEW: Activity operations
export async function createActivity(activity: Activity): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO activities (
      id, employee_id, timestamp, app_name, window_title, 
      category, category_name, productivity_score, productivity_level,
      is_suspicious, suspicious_reason, is_idle, idle_time_seconds, duration_seconds, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      activity.id,
      activity.employeeId,
      activity.timestamp,
      activity.appName,
      activity.windowTitle,
      activity.category,
      activity.categoryName,
      activity.productivityScore,
      activity.productivityLevel,
      activity.isSuspicious ? 1 : 0,
      activity.suspiciousReason,
      activity.isIdle ? 1 : 0,
      activity.idleTimeSeconds,
      activity.durationSeconds,
      activity.createdAt
    ]
  );
}

export async function getActivitiesByEmployee(
  employeeId: string, 
  startDate?: string, 
  endDate?: string
): Promise<Activity[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM activities WHERE employee_id = ?';
  const params: any[] = [employeeId];
  
  if (startDate) {
    query += ' AND timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    // FIX: Use end of day (23:59:59) instead of start of day (00:00:00)
    const endOfDay = endDate + 'T23:59:59.999Z';
    query += ' AND timestamp <= ?';
    params.push(endOfDay);
  }
  
  query += ' ORDER BY timestamp DESC';
  
  const rows = await db.all(query, params);
  return rows.map(mapActivity);
}

export async function getAllActivities(startDate?: string, endDate?: string): Promise<Activity[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM activities';
  const params: any[] = [];
  
  if (startDate || endDate) {
    query += ' WHERE';
    if (startDate) {
      query += ' timestamp >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += startDate ? ' AND timestamp <= ?' : ' timestamp <= ?';
      params.push(endDate);
    }
  }
  
  query += ' ORDER BY timestamp DESC';
  
  const rows = await db.all(query, params);
  return rows.map(mapActivity);
}

export async function getSuspiciousActivities(employeeId?: string, limit: number = 50): Promise<Activity[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM activities WHERE is_suspicious = 1';
  const params: any[] = [];
  
  if (employeeId) {
    query += ' AND employee_id = ?';
    params.push(employeeId);
  }
  
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  
  const rows = await db.all(query, params);
  return rows.map(mapActivity);
}

export async function getActivityStats(employeeId?: string, startDate?: string, endDate?: string): Promise<any> {
  const db = getDatabase();
  
  let whereClause = '';
  const params: any[] = [];
  
  if (employeeId || startDate || endDate) {
    const conditions: string[] = [];
    if (employeeId) {
      conditions.push('employee_id = ?');
      params.push(employeeId);
    }
    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(endDate);
    }
    whereClause = 'WHERE ' + conditions.join(' AND ');
  }
  
  // Category breakdown
  const categoryStats = await db.all(
    `SELECT category, category_name, 
            COUNT(*) as count, 
            SUM(duration_seconds) as total_seconds,
            AVG(productivity_score) as avg_productivity
     FROM activities ${whereClause}
     GROUP BY category`,
    params
  );
  
  // Suspicious count
  const suspiciousCount = await db.get(
    `SELECT COUNT(*) as count FROM activities ${whereClause} AND is_suspicious = 1`,
    params
  );
  
  // Average productivity score
  const avgProductivity = await db.get(
    `SELECT AVG(productivity_score) as score FROM activities ${whereClause}`,
    params
  );
  
  return {
    categoryBreakdown: categoryStats,
    suspiciousCount: suspiciousCount.count,
    averageProductivityScore: Math.round(avgProductivity.score || 0)
  };
}

function mapActivity(row: any): Activity {
  return {
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
  };
}

// Legacy Time Entry operations (kept for compatibility)
export async function getAllTimeEntries(startDate?: string, endDate?: string): Promise<TimeEntry[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM time_entries';
  const params: any[] = [];
  
  if (startDate || endDate) {
    query += ' WHERE';
    if (startDate) {
      query += ' start_time >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += startDate ? ' AND start_time <= ?' : ' start_time <= ?';
      params.push(endDate);
    }
  }
  
  query += ' ORDER BY start_time DESC';
  
  const rows = await db.all(query, params);
  return rows.map(mapTimeEntry);
}

export async function getTimeEntriesByEmployee(employeeId: string, startDate?: string, endDate?: string): Promise<TimeEntry[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM time_entries WHERE employee_id = ?';
  const params: any[] = [employeeId];
  
  if (startDate) {
    query += ' AND start_time >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND start_time <= ?';
    params.push(endDate);
  }
  
  query += ' ORDER BY start_time DESC';
  
  const rows = await db.all(query, params);
  return rows.map(mapTimeEntry);
}

export async function createTimeEntry(entry: TimeEntry): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO time_entries (id, employee_id, task_id, project_id, description, start_time, end_time, duration, is_billable, idle_time, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.employeeId, entry.taskId, entry.projectId, entry.description, entry.startTime, entry.endTime, entry.duration, entry.isBillable ? 1 : 0, entry.idleTime, entry.createdAt, entry.updatedAt]
  );
}

export async function updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.endTime) { sets.push('end_time = ?'); values.push(updates.endTime); }
  if (updates.duration !== undefined) { sets.push('duration = ?'); values.push(updates.duration); }
  if (updates.idleTime !== undefined) { sets.push('idle_time = ?'); values.push(updates.idleTime); }
  
  sets.push('updated_at = ?'); values.push(now);
  values.push(id);
  
  await db.run(`UPDATE time_entries SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function getActiveTimeEntries(): Promise<TimeEntry[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM time_entries WHERE end_time IS NULL');
  return rows.map(mapTimeEntry);
}

export async function getTimeEntryById(id: string): Promise<TimeEntry | null> {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM time_entries WHERE id = ?', id);
  return row ? mapTimeEntry(row) : null;
}

function mapTimeEntry(row: any): TimeEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    taskId: row.task_id,
    projectId: row.project_id,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    isBillable: row.is_billable === 1,
    idleTime: row.idle_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Dashboard stats
export async function getDashboardStats(): Promise<any> {
  const db = getDatabase();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();
  
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString();
  
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const monthAgoStr = monthAgo.toISOString();

  const [totalEmployees, activeProjects, todayHours, weekHours, monthHours, recentActivities, suspiciousActivities, productivityStats] = await Promise.all([
    db.get('SELECT COUNT(*) as count FROM employees WHERE is_active = 1'),
    db.get('SELECT COUNT(*) as count FROM projects WHERE status = "active"'),
    db.get('SELECT COALESCE(SUM(duration), 0) as total FROM time_entries WHERE start_time >= ?', todayStr),
    db.get('SELECT COALESCE(SUM(duration), 0) as total FROM time_entries WHERE start_time >= ?', weekAgoStr),
    db.get('SELECT COALESCE(SUM(duration), 0) as total FROM time_entries WHERE start_time >= ?', monthAgoStr),
    db.all('SELECT * FROM activities ORDER BY timestamp DESC LIMIT 20'),
    db.all('SELECT * FROM activities WHERE timestamp >= ? AND is_suspicious = 1 ORDER BY timestamp DESC LIMIT 50', todayStr),
    db.all(`
      SELECT category, SUM(duration_seconds) as total_seconds 
      FROM activities 
      WHERE timestamp >= ? 
      GROUP BY category
    `, todayStr)
  ]);
  
  // FIX: Count ALL suspicious activities including idle time
  // Idle time IS suspicious activity (employee away from desk)
  const uniqueSuspiciousCount = suspiciousActivities.length;

  // FIX: Calculate actual time from unique app switches, not summed duration_seconds
  // Get unique activity periods (when app/window changes)
  const uniqueActivities = await db.all(
    `SELECT * FROM activities 
     WHERE timestamp >= ? 
     ORDER BY timestamp ASC`,
    todayStr
  );

  // Build productivity breakdown with new universal categories
  const productivityBreakdown: Record<string, number> = {
    coreWork: 0,
    communication: 0,
    researchLearning: 0,
    planningDocs: 0,
    breakIdle: 0,
    entertainment: 0,
    socialMedia: 0,
    shoppingPersonal: 0,
    other: 0
  };

  // FIX: Calculate breakdown from uniqueActivities (actual time) not productivityStats
  for (let i = 0; i < uniqueActivities.length; i++) {
    const current = uniqueActivities[i];
    const next = uniqueActivities[i + 1];
    
    // Calculate duration until next activity or cap at 10 minutes
    let durationMinutes = 0.17; // default 10 seconds = 0.17 minutes
    if (next) {
      const currentTime = new Date(current.timestamp).getTime();
      const nextTime = new Date(next.timestamp).getTime();
      durationMinutes = Math.min((nextTime - currentTime) / 1000 / 60, 10); // cap at 10 minutes
    }
    
    switch (current.category) {
      case 'core_work':
        productivityBreakdown.coreWork += durationMinutes;
        break;
      case 'communication':
        productivityBreakdown.communication += durationMinutes;
        break;
      case 'research_learning':
        productivityBreakdown.researchLearning += durationMinutes;
        break;
      case 'planning_docs':
        productivityBreakdown.planningDocs += durationMinutes;
        break;
      case 'break_idle':
        productivityBreakdown.breakIdle += durationMinutes;
        break;
      case 'entertainment':
        productivityBreakdown.entertainment += durationMinutes;
        break;
      case 'social_media':
        productivityBreakdown.socialMedia += durationMinutes;
        break;
      case 'shopping_personal':
        productivityBreakdown.shoppingPersonal += durationMinutes;
        break;
      default:
        productivityBreakdown.other += durationMinutes;
    }
  }
  
  // Calculate actual time by looking at time between unique activity changes
  let actualTotalSeconds = 0;
  let actualProductiveSeconds = 0;
  let actualUnproductiveSeconds = 0;
  let actualIdleSeconds = 0;
  
  for (let i = 0; i < uniqueActivities.length; i++) {
    const current = uniqueActivities[i];
    const next = uniqueActivities[i + 1];
    
    // Calculate duration until next activity or cap at 10 minutes
    let duration = 10; // default 10 seconds
    if (next) {
      const currentTime = new Date(current.timestamp).getTime();
      const nextTime = new Date(next.timestamp).getTime();
      duration = Math.min((nextTime - currentTime) / 1000, 600); // cap at 10 minutes
    }
    
    actualTotalSeconds += duration;
    
    if (current.productivity_level === 'productive' && !current.is_suspicious) {
      actualProductiveSeconds += duration;
    } else if (current.productivity_level === 'unproductive') {
      actualUnproductiveSeconds += duration;
    }
    
    // FIX: Count idle time as wasted time (includes break_idle category)
    if (current.is_idle || current.productivity_level === 'idle') {
      actualIdleSeconds += duration;
    }
  }
  
  // Calculate average productivity score from unique activities only
  const avgScore = uniqueActivities.length > 0 
    ? Math.round(uniqueActivities.reduce((sum: number, a: any) => sum + a.productivity_score, 0) / uniqueActivities.length)
    : 0;

  // Get employee activity stats
  const employeeActivity = await getEmployeeActivityStats();

  // FIX: Include idle time in distracted/wasted time
  const totalWastedMinutes = Math.round((actualUnproductiveSeconds + actualIdleSeconds) / 60);

  return {
    totalEmployees: totalEmployees.count,
    activeProjects: activeProjects.count,
    totalHoursToday: Math.round(actualTotalSeconds / 3600 * 10) / 10,
    totalHoursThisWeek: Math.round(weekHours.total / 3600 * 10) / 10,
    totalHoursThisMonth: Math.round(monthHours.total / 3600 * 10) / 10,
    productivityBreakdown,
    averageProductivityScore: avgScore,
    suspiciousActivityCount: uniqueSuspiciousCount,
    focusTimeMinutes: Math.round(actualProductiveSeconds / 60),
    distractedTimeMinutes: totalWastedMinutes,
    recentActivities: recentActivities.map(mapActivity),
    employeeActivity
  };
}

// Get employee activity with productivity metrics
export async function getEmployeeActivityStats(): Promise<any[]> {
  const db = getDatabase();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();
  
  const employees = await db.all('SELECT id, name FROM employees WHERE is_active = 1');
  
  const results = [];
  for (const emp of employees) {
    // FIX: Get all activities for this employee today to calculate actual time
    const empActivities = await db.all(
      `SELECT * FROM activities 
       WHERE employee_id = ? AND timestamp >= ? 
       ORDER BY timestamp ASC`,
      [emp.id, todayStr]
    );
    
    const latestActivity = empActivities.length > 0 ? empActivities[empActivities.length - 1] : null;
    
    // FIX: Calculate actual time by looking at time between unique activity changes
    let actualTotalSeconds = 0;
    let totalScore = 0;
    let suspiciousCount = 0;
    
    for (let i = 0; i < empActivities.length; i++) {
      const current = empActivities[i];
      const next = empActivities[i + 1];
      
      // Calculate duration until next activity or cap at 10 minutes
      let duration = 10; // default 10 seconds
      if (next) {
        const currentTime = new Date(current.timestamp).getTime();
        const nextTime = new Date(next.timestamp).getTime();
        duration = Math.min((nextTime - currentTime) / 1000, 600); // cap at 10 minutes
      }
      
      actualTotalSeconds += duration;
      totalScore += current.productivity_score;
      
      // FIX: Count ALL suspicious activities including idle time
      if (current.is_suspicious) {
        suspiciousCount++;
      }
    }
    
    const avgScore = empActivities.length > 0 ? Math.round(totalScore / empActivities.length) : 0;
    
    results.push({
      employeeId: emp.id,
      employeeName: emp.name,
      currentActivity: latestActivity?.window_title,
      currentCategory: latestActivity?.category_name,
      productivityScore: avgScore,
      hoursToday: Math.round(actualTotalSeconds / 3600 * 10) / 10,
      suspiciousActivityCount: suspiciousCount
    });
  }
  
  return results;
}
