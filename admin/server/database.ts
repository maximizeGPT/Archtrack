import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Employee, Project, Task, TimeEntry, Activity, ProductivityReport } from '../shared-types.js';
import { runMigrations } from './migrations.js';

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
  await runMigrations(db);
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

    -- Smart Role Detection: stores detected/overridden role per employee
    CREATE TABLE IF NOT EXISTS role_profiles (
      employee_id TEXT PRIMARY KEY,
      role_type TEXT NOT NULL DEFAULT 'unknown',
      display_name TEXT NOT NULL DEFAULT 'Not yet detected',
      confidence INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'learning',
      detected_at TEXT,
      learning_started_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- Classification overrides: admin can override app categorization per employee or role
    CREATE TABLE IF NOT EXISTS classification_overrides (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      role_type TEXT,
      app_pattern TEXT NOT NULL,
      category TEXT NOT NULL,
      productivity_score INTEGER NOT NULL,
      created_by TEXT DEFAULT 'admin',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activities_employee ON activities(employee_id);
    CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);
    CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_overrides_employee ON classification_overrides(employee_id);
    CREATE INDEX IF NOT EXISTS idx_overrides_role ON classification_overrides(role_type);
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
export async function getAllEmployees(orgId: string): Promise<Employee[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM employees WHERE is_active = 1 AND org_id = ? ORDER BY name', [orgId]);
  return rows.map(mapEmployee);
}

export async function getEmployeeById(orgId: string, id: string): Promise<Employee | null> {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM employees WHERE id = ? AND org_id = ?', [id, orgId]);
  return row ? mapEmployee(row) : null;
}

export async function createEmployee(employee: Employee): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO employees (id, org_id, name, email, role, department, hourly_rate, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [employee.id, employee.orgId, employee.name, employee.email, employee.role, employee.department, employee.hourlyRate, employee.createdAt, employee.updatedAt]
  );
}

export async function updateEmployee(orgId: string, id: string, updates: Partial<Employee>): Promise<void> {
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
  values.push(orgId);

  await db.run(`UPDATE employees SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

export async function deleteEmployee(orgId: string, id: string): Promise<void> {
  const db = getDatabase();
  await db.run('UPDATE employees SET is_active = 0 WHERE id = ? AND org_id = ?', [id, orgId]);
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
export async function getAllProjects(orgId: string): Promise<Project[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM projects WHERE org_id = ? ORDER BY name', [orgId]);
  return rows.map(mapProject);
}

export async function getProjectById(orgId: string, id: string): Promise<Project | null> {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM projects WHERE id = ? AND org_id = ?', [id, orgId]);
  return row ? mapProject(row) : null;
}

export async function createProject(project: Project): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO projects (id, org_id, name, description, client_name, status, start_date, end_date, budget, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [project.id, project.orgId, project.name, project.description, project.clientName, project.status, project.startDate, project.endDate, project.budget, project.createdAt, project.updatedAt]
  );
}

export async function updateProject(orgId: string, id: string, updates: Partial<Project>): Promise<void> {
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

  values.push(orgId);
  await db.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, values);
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
export async function getAllTasks(orgId: string): Promise<Task[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM tasks WHERE org_id = ? ORDER BY updated_at DESC', [orgId]);
  return rows.map(mapTask);
}

export async function getTasksByProject(orgId: string, projectId: string): Promise<Task[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM tasks WHERE project_id = ? AND org_id = ?', [projectId, orgId]);
  return rows.map(mapTask);
}

export async function createTask(task: Task): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO tasks (id, org_id, project_id, name, description, status, priority, estimated_hours, assigned_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [task.id, task.orgId, task.projectId, task.name, task.description, task.status, task.priority, task.estimatedHours, task.assignedTo, task.createdAt, task.updatedAt]
  );
}

export async function updateTask(orgId: string, id: string, updates: Partial<Task>): Promise<void> {
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

  values.push(orgId);
  await db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, values);
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

// Activity operations
export async function createActivity(orgId: string, activity: Activity): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO activities (
      id, org_id, employee_id, timestamp, app_name, window_title,
      category, category_name, productivity_score, productivity_level,
      is_suspicious, suspicious_reason, is_idle, idle_time_seconds, duration_seconds, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      activity.id,
      orgId,
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

export async function getActivityById(orgId: string, id: string): Promise<Activity | null> {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM activities WHERE id = ? AND org_id = ?', [id, orgId]);
  return row ? mapActivity(row) : null;
}

export async function updateActivity(orgId: string, id: string, updates: Partial<Activity>): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  const sets: string[] = [];
  const values: any[] = [];

  if (updates.appName) { sets.push('app_name = ?'); values.push(updates.appName); }
  if (updates.windowTitle) { sets.push('window_title = ?'); values.push(updates.windowTitle); }
  if (updates.category) { sets.push('category = ?'); values.push(updates.category); }
  if (updates.categoryName) { sets.push('category_name = ?'); values.push(updates.categoryName); }
  if (updates.productivityScore !== undefined) { sets.push('productivity_score = ?'); values.push(updates.productivityScore); }
  if (updates.productivityLevel) { sets.push('productivity_level = ?'); values.push(updates.productivityLevel); }
  if (updates.isSuspicious !== undefined) { sets.push('is_suspicious = ?'); values.push(updates.isSuspicious ? 1 : 0); }
  if (updates.suspiciousReason) { sets.push('suspicious_reason = ?'); values.push(updates.suspiciousReason); }
  if (updates.isIdle !== undefined) { sets.push('is_idle = ?'); values.push(updates.isIdle ? 1 : 0); }
  if (updates.idleTimeSeconds !== undefined) { sets.push('idle_time_seconds = ?'); values.push(updates.idleTimeSeconds); }
  if (updates.durationSeconds !== undefined) { sets.push('duration_seconds = ?'); values.push(updates.durationSeconds); }

  sets.push('updated_at = ?'); values.push(now);
  values.push(id);
  values.push(orgId);

  await db.run(`UPDATE activities SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

export async function getActivitiesByEmployee(
  orgId: string,
  employeeId: string,
  startDate?: string,
  endDate?: string
): Promise<Activity[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM activities WHERE employee_id = ? AND org_id = ?';
  const params: any[] = [employeeId, orgId];
  
  if (startDate) {
    query += ' AND timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND timestamp <= ?';
    params.push(endDate);
  }
  
  query += ' ORDER BY timestamp DESC';
  
  const rows = await db.all(query, params);
  return rows.map(mapActivity);
}

export async function getAllActivities(orgId: string, startDate?: string, endDate?: string): Promise<Activity[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM activities';
  const params: any[] = [];
  const conditions: string[] = [];

  conditions.push('org_id = ?'); params.push(orgId);
  if (startDate) { conditions.push('timestamp >= ?'); params.push(startDate); }
  if (endDate) { conditions.push('timestamp <= ?'); params.push(endDate); }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY timestamp DESC';
  
  const rows = await db.all(query, params);
  return rows.map(mapActivity);
}

export async function getSuspiciousActivities(orgId: string, employeeId?: string, limit: number = 50): Promise<Activity[]> {
  const db = getDatabase();
  const systemApps = ['loginwindow', 'lockscreen', 'screensaver', 'window server', 'idle'];
  const appExclusions = systemApps.map(app => `LOWER(app_name) != '${app}'`).join(' AND ');

  let query = `SELECT * FROM activities WHERE is_suspicious = 1 AND ${appExclusions} AND org_id = ?`;
  const params: any[] = [orgId];

  if (employeeId) { query += ' AND employee_id = ?'; params.push(employeeId); }
  
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  
  const rows = await db.all(query, params);
  return rows.map(mapActivity);
}

export async function getActivityStats(orgId: string, employeeId?: string, startDate?: string, endDate?: string): Promise<any> {
  const db = getDatabase();

  const conditions: string[] = [];
  const params: any[] = [];

  conditions.push('org_id = ?'); params.push(orgId);
  if (employeeId) { conditions.push('employee_id = ?'); params.push(employeeId); }
  if (startDate) { conditions.push('timestamp >= ?'); params.push(startDate); }
  if (endDate) { conditions.push('timestamp <= ?'); params.push(endDate); }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  
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
  const suspiciousWhere = whereClause ? `${whereClause} AND is_suspicious = 1` : 'WHERE is_suspicious = 1';
  const suspiciousCount = await db.get(
    `SELECT COUNT(*) as count FROM activities ${suspiciousWhere}`,
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
export async function getAllTimeEntries(orgId: string, startDate?: string, endDate?: string): Promise<TimeEntry[]> {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: any[] = [];

  conditions.push('org_id = ?'); params.push(orgId);
  if (startDate) { conditions.push('start_time >= ?'); params.push(startDate); }
  if (endDate) { conditions.push('start_time <= ?'); params.push(endDate); }

  let query = 'SELECT * FROM time_entries';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY start_time DESC';
  
  const rows = await db.all(query, params);
  return rows.map(mapTimeEntry);
}

export async function getTimeEntriesByEmployee(orgId: string, employeeId: string, startDate?: string, endDate?: string): Promise<TimeEntry[]> {
  const db = getDatabase();
  let query = 'SELECT * FROM time_entries WHERE employee_id = ? AND org_id = ?';
  const params: any[] = [employeeId, orgId];
  
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

export async function createTimeEntry(orgId: string, entry: TimeEntry): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO time_entries (id, employee_id, task_id, project_id, description, start_time, end_time, duration, is_billable, idle_time, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.employeeId, entry.taskId, entry.projectId, entry.description, entry.startTime, entry.endTime, entry.duration, entry.isBillable ? 1 : 0, entry.idleTime, entry.createdAt, entry.updatedAt]
  );
}

export async function updateTimeEntry(orgId: string, id: string, updates: Partial<TimeEntry>): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.endTime) { sets.push('end_time = ?'); values.push(updates.endTime); }
  if (updates.duration !== undefined) { sets.push('duration = ?'); values.push(updates.duration); }
  if (updates.idleTime !== undefined) { sets.push('idle_time = ?'); values.push(updates.idleTime); }
  
  sets.push('updated_at = ?'); values.push(now);
  values.push(id);
  values.push(orgId);

  await db.run(`UPDATE time_entries SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

export async function getActiveTimeEntries(orgId: string): Promise<TimeEntry[]> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM time_entries WHERE end_time IS NULL AND org_id = ?', [orgId]);
  return rows.map(mapTimeEntry);
}

export async function getTimeEntryById(orgId: string, id: string): Promise<TimeEntry | null> {
  const db = getDatabase();
  const row = await db.get('SELECT * FROM time_entries WHERE id = ? AND org_id = ?', [id, orgId]);
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

// Dashboard stats with timeout protection
export async function getDashboardStats(orgId: string): Promise<any> {
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

  const withTimeout = <T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms)
      )
    ]).catch(err => {
      console.warn('Dashboard stats query failed:', err.message);
      return defaultValue;
    });
  };

  const [totalEmployees, activeProjects, todayHours, weekHours, monthHours, recentActivities, suspiciousCount, productivityStats] = await Promise.all([
    withTimeout(db.get('SELECT COUNT(*) as count FROM employees WHERE is_active = 1 AND org_id = ?', [orgId]), 5000, { count: 0 }),
    withTimeout(db.get('SELECT COUNT(*) as count FROM projects WHERE status = "active" AND org_id = ?', [orgId]), 5000, { count: 0 }),
    withTimeout(db.get('SELECT COALESCE(SUM(duration_seconds), 0) as total FROM activities WHERE timestamp >= ? AND org_id = ?', [todayStr, orgId]), 5000, { total: 0 }),
    withTimeout(db.get('SELECT COALESCE(SUM(duration_seconds), 0) as total FROM activities WHERE timestamp >= ? AND org_id = ?', [weekAgoStr, orgId]), 5000, { total: 0 }),
    withTimeout(db.get('SELECT COALESCE(SUM(duration_seconds), 0) as total FROM activities WHERE timestamp >= ? AND org_id = ?', [monthAgoStr, orgId]), 5000, { total: 0 }),
    withTimeout(db.all('SELECT * FROM activities WHERE org_id = ? ORDER BY timestamp DESC LIMIT 20', [orgId]), 5000, []),
    withTimeout(db.get('SELECT COUNT(*) as count FROM activities WHERE timestamp >= ? AND is_suspicious = 1 AND org_id = ?', [todayStr, orgId]), 5000, { count: 0 }),
    withTimeout(db.all(`
      SELECT category, SUM(duration_seconds) as total_seconds
      FROM activities
      WHERE timestamp >= ? AND org_id = ?
      GROUP BY category
    `, [todayStr, orgId]), 5000, [])
  ]);

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

  for (const stat of productivityStats) {
    const minutes = Math.round(stat.total_seconds / 60);
    switch (stat.category) {
      case 'core_work':
        productivityBreakdown.coreWork += minutes;
        break;
      case 'communication':
        productivityBreakdown.communication += minutes;
        break;
      case 'research_learning':
        productivityBreakdown.researchLearning += minutes;
        break;
      case 'planning_docs':
        productivityBreakdown.planningDocs += minutes;
        break;
      case 'break_idle':
        productivityBreakdown.breakIdle += minutes;
        break;
      case 'entertainment':
        productivityBreakdown.entertainment += minutes;
        break;
      case 'social_media':
        productivityBreakdown.socialMedia += minutes;
        break;
      case 'shopping_personal':
        productivityBreakdown.shoppingPersonal += minutes;
        break;
      default:
        productivityBreakdown.other += minutes;
    }
  }

  const avgScore = await withTimeout(
    db.get('SELECT AVG(productivity_score) as score FROM activities WHERE timestamp >= ? AND org_id = ?', [todayStr, orgId]),
    5000,
    { score: 0 }
  );

  const focusTime = await withTimeout(
    db.get(`SELECT COALESCE(SUM(duration_seconds), 0) as total
     FROM activities
     WHERE timestamp >= ? AND productivity_level = 'productive' AND is_suspicious = 0 AND org_id = ?`, [todayStr, orgId]),
    5000,
    { total: 0 }
  );

  const distractedTime = await withTimeout(
    db.get(`SELECT COALESCE(SUM(duration_seconds), 0) as total
     FROM activities
     WHERE timestamp >= ? AND (productivity_level = 'unproductive' OR is_suspicious = 1) AND org_id = ?`, [todayStr, orgId]),
    5000,
    { total: 0 }
  );

  const employeeActivity = await withTimeout(
    getEmployeeActivityStats(orgId),
    5000,
    []
  );

  return {
    totalEmployees: totalEmployees.count,
    activeProjects: activeProjects.count,
    totalHoursToday: Math.round(todayHours.total / 3600 * 10) / 10,
    totalHoursThisWeek: Math.round(weekHours.total / 3600 * 10) / 10,
    totalHoursThisMonth: Math.round(monthHours.total / 3600 * 10) / 10,
    productivityBreakdown,
    averageProductivityScore: Math.round(avgScore?.score || 0),
    suspiciousActivityCount: suspiciousCount.count,
    focusTimeMinutes: Math.round(focusTime.total / 60),
    distractedTimeMinutes: Math.round(distractedTime.total / 60),
    recentActivities: recentActivities.map(mapActivity),
    employeeActivity
  };
}

// Get employee activity with productivity metrics
export async function getEmployeeActivityStats(orgId: string): Promise<any[]> {
  const db = getDatabase();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const employees = await db.all('SELECT id, name FROM employees WHERE is_active = 1 AND org_id = ?', [orgId]);
  
  const results = [];
  for (const emp of employees) {
    const [latestActivity, todayStats, suspiciousCount] = await Promise.all([
      db.get(
        'SELECT * FROM activities WHERE employee_id = ? ORDER BY timestamp DESC LIMIT 1',
        emp.id
      ),
      db.get(
        `SELECT 
          COALESCE(SUM(duration_seconds), 0) as total_seconds,
          AVG(productivity_score) as avg_score
         FROM activities 
         WHERE employee_id = ? AND timestamp >= ?`,
        [emp.id, todayStr]
      ),
      db.get(
        'SELECT COUNT(*) as count FROM activities WHERE employee_id = ? AND timestamp >= ? AND is_suspicious = 1',
        [emp.id, todayStr]
      )
    ]);
    
    results.push({
      employeeId: emp.id,
      employeeName: emp.name,
      currentActivity: latestActivity?.window_title,
      currentCategory: latestActivity?.category_name,
      productivityScore: Math.round(todayStats?.avg_score || 0),
      hoursToday: Math.round((todayStats?.total_seconds || 0) / 3600 * 10) / 10,
      suspiciousActivityCount: suspiciousCount?.count || 0
    });
  }
  
  return results;
}
