import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Employee, Project, Task, TimeEntry, Activity, ProductivityReport } from '../shared-types.js';
import { computeProductivityStats } from '../shared-types.js';
import { runMigrations } from './migrations.js';
import { getLocalDayBounds, resolveTimezone } from './timezone.js';
import { annotateOutsideHours, hasBusinessHours } from './business-hours.js';

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
      email TEXT,
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
    `INSERT INTO employees (
      id, org_id, name, email, role, department, hourly_rate,
      currency, timezone, business_hours_start, business_hours_end, business_hours_days,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employee.id, employee.orgId, employee.name, employee.email || null, employee.role,
      employee.department || null, employee.hourlyRate ?? null,
      employee.currency || null, employee.timezone || null,
      employee.businessHoursStart || null, employee.businessHoursEnd || null, employee.businessHoursDays || null,
      employee.createdAt, employee.updatedAt
    ]
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
  if (updates.department !== undefined) { sets.push('department = ?'); values.push(updates.department || null); }
  if (updates.hourlyRate !== undefined) { sets.push('hourly_rate = ?'); values.push(updates.hourlyRate); }
  if (updates.currency !== undefined) { sets.push('currency = ?'); values.push(updates.currency || null); }
  if (updates.timezone !== undefined) { sets.push('timezone = ?'); values.push(updates.timezone || null); }
  if (updates.businessHoursStart !== undefined) { sets.push('business_hours_start = ?'); values.push(updates.businessHoursStart || null); }
  if (updates.businessHoursEnd !== undefined) { sets.push('business_hours_end = ?'); values.push(updates.businessHoursEnd || null); }
  if (updates.businessHoursDays !== undefined) { sets.push('business_hours_days = ?'); values.push(updates.businessHoursDays || null); }

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
    currency: row.currency || undefined,
    timezone: row.timezone || undefined,
    businessHoursStart: row.business_hours_start || undefined,
    businessHoursEnd: row.business_hours_end || undefined,
    businessHoursDays: row.business_hours_days || undefined,
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

/**
 * Hard-delete a project. Any tasks under it are also deleted first so
 * we don't leave orphaned task rows with a dangling project_id FK.
 * Scoped to `orgId` so one org can never delete another's data.
 */
export async function deleteProject(orgId: string, id: string): Promise<void> {
  const db = getDatabase();
  await db.run('DELETE FROM tasks WHERE project_id = ? AND org_id = ?', [id, orgId]);
  await db.run('DELETE FROM projects WHERE id = ? AND org_id = ?', [id, orgId]);
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

export async function deleteTask(orgId: string, id: string): Promise<void> {
  const db = getDatabase();
  await db.run('DELETE FROM tasks WHERE id = ? AND org_id = ?', [id, orgId]);
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

// ---------------------------------------------------------------------------
// Dashboard stats — unified productivity formula + timezone-aware "today".
// ---------------------------------------------------------------------------
// The caller may pass an explicit `viewTimezone` (usually the admin browser's
// IANA zone, detected with `Intl.DateTimeFormat().resolvedOptions().timeZone`).
// When absent we fall back to the organization's stored timezone, and if that
// is also unset we fall back to UTC.
//
// All "today" queries use `[startUtc, endUtc)` day boundaries computed in the
// resolved tz so that a PST admin refreshing at 11:55pm still sees *their*
// day, not UTC's.

const SYSTEM_APP_BLACKLIST = [
  'loginwindow',
  'lockscreen',
  'screensaver',
  'window server',
  'idle',
  'usernotificationcenter',
  'controlcenter',
  'dock',
  'notificationcenter'
];

export async function getDashboardStats(
  orgId: string,
  viewTimezone?: string,
  scope: 'today' | 'week' | 'all' = 'today'
): Promise<any> {
  const db = getDatabase();

  // Resolve the timezone the admin wants to see "today" in.
  const orgRow = await db.get('SELECT timezone FROM organizations WHERE id = ?', [orgId]);
  const tz = resolveTimezone(viewTimezone || orgRow?.timezone);

  // Window bounds for the requested scope. The dashboard tiles ("focus
  // today", productivity, breakdown) all read from this same window so the
  // toggle is just one switch in one place.
  let startTodayUtc: string;
  let endTodayUtc: string;
  if (scope === 'week') {
    const { getLocalWindowBounds } = await import('./timezone.js');
    [startTodayUtc, endTodayUtc] = getLocalWindowBounds(tz, 7);
  } else if (scope === 'all') {
    // Cap at "year ago" so SQLite doesn't have to scan billions of rows on
    // a long-running install. Adjust upward when needed.
    const { getLocalWindowBounds } = await import('./timezone.js');
    [startTodayUtc, endTodayUtc] = getLocalWindowBounds(tz, 365);
  } else {
    [startTodayUtc, endTodayUtc] = getLocalDayBounds(tz, 0);
  }

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

  // Build the system-app exclusion fragment for the activity feed.
  const feedExclusion = SYSTEM_APP_BLACKLIST.map(() => 'LOWER(app_name) != ?').join(' AND ');
  const feedParams: any[] = [orgId, ...SYSTEM_APP_BLACKLIST];

  const [
    totalEmployees,
    activeProjects,
    todayActivities,
    recentActivities,
    suspiciousCount
  ] = await Promise.all([
    withTimeout(db.get('SELECT COUNT(*) as count FROM employees WHERE is_active = 1 AND org_id = ?', [orgId]), 5000, { count: 0 }),
    withTimeout(db.get('SELECT COUNT(*) as count FROM projects WHERE status = "active" AND org_id = ?', [orgId]), 5000, { count: 0 }),
    withTimeout(
      db.all(
        `SELECT * FROM activities
          WHERE org_id = ? AND timestamp >= ? AND timestamp < ?`,
        [orgId, startTodayUtc, endTodayUtc]
      ),
      5000,
      []
    ),
    withTimeout(
      db.all(
        `SELECT * FROM activities
          WHERE org_id = ? AND ${feedExclusion}
          ORDER BY timestamp DESC, created_at DESC
          LIMIT 20`,
        feedParams
      ),
      5000,
      []
    ),
    withTimeout(
      db.get(
        `SELECT COUNT(*) as count FROM activities
          WHERE timestamp >= ? AND timestamp < ?
            AND is_suspicious = 1 AND org_id = ?`,
        [startTodayUtc, endTodayUtc, orgId]
      ),
      5000,
      { count: 0 }
    )
  ]);

  // Compute unified stats across the whole org for today.
  const mappedToday = (todayActivities as any[]).map(mapActivity);
  const stats = computeProductivityStats(mappedToday);

  // Minutes per bucket for the dashboard's "Time Breakdown (Today)" grid.
  const minutes = (sec: number) => Math.round(sec / 60);
  const productivityBreakdown = {
    coreWork:         minutes(stats.categorySeconds.core_work || 0),
    communication:    minutes(stats.categorySeconds.communication || 0),
    researchLearning: minutes(stats.categorySeconds.research_learning || 0),
    planningDocs:     minutes(stats.categorySeconds.planning_docs || 0),
    breakIdle:        minutes(stats.categorySeconds.break_idle || 0),
    entertainment:    minutes(stats.categorySeconds.entertainment || 0),
    socialMedia:      minutes(stats.categorySeconds.social_media || 0),
    shoppingPersonal: minutes(stats.categorySeconds.shopping_personal || 0),
    other:            minutes(stats.categorySeconds.other || 0)
  };

  const employeeActivity = await withTimeout(
    getEmployeeActivityStats(orgId, tz),
    5000,
    []
  );

  return {
    timezone: tz,
    scope,
    dayStart: startTodayUtc,
    dayEnd: endTodayUtc,
    totalEmployees: totalEmployees.count,
    activeProjects: activeProjects.count,
    // All duration-carrying fields exposed as both seconds (source of truth)
    // and the legacy hours/minutes values (kept so older clients still work).
    totalSecondsToday:       stats.totalSeconds,
    focusSecondsToday:       stats.productiveSeconds,
    distractedSecondsToday:  stats.unproductiveSeconds + stats.idleSeconds,
    productiveSecondsToday:  stats.productiveSeconds,
    unproductiveSecondsToday: stats.unproductiveSeconds,
    neutralSecondsToday:     stats.neutralSeconds,
    idleSecondsToday:        stats.idleSeconds,
    totalHoursToday:         Math.round(stats.totalSeconds / 3600 * 10) / 10,
    focusTimeMinutes:        Math.round(stats.productiveSeconds / 60),
    distractedTimeMinutes:   Math.round((stats.unproductiveSeconds + stats.idleSeconds) / 60),
    productivityBreakdown,
    averageProductivityScore: stats.productivityScore,
    suspiciousActivityCount: suspiciousCount.count,
    recentActivities: (recentActivities as any[]).map(mapActivity),
    employeeActivity
  };
}

// Get employee activity with unified productivity metrics.
// Uses the same formula as Reports so the dashboard card and the report agree.
export async function getEmployeeActivityStats(orgId: string, tz?: string): Promise<any[]> {
  const db = getDatabase();

  const orgRow = await db.get('SELECT timezone FROM organizations WHERE id = ?', [orgId]);
  const resolvedTz = resolveTimezone(tz || orgRow?.timezone);
  const [startTodayUtc, endTodayUtc] = getLocalDayBounds(resolvedTz, 0);

  const employees = await db.all(
    `SELECT id, name, timezone, business_hours_start, business_hours_end, business_hours_days
     FROM employees
     WHERE is_active = 1 AND org_id = ?`,
    [orgId]
  );

  const results = [];
  for (const emp of employees) {
    // Use the employee's own timezone for their "today" if set, else org tz.
    const empTz = resolveTimezone(emp.timezone || resolvedTz);
    const [empStart, empEnd] = getLocalDayBounds(empTz, 0);

    const [latestActivity, todayRows, suspiciousCount] = await Promise.all([
      db.get(
        'SELECT * FROM activities WHERE employee_id = ? ORDER BY timestamp DESC, created_at DESC LIMIT 1',
        emp.id
      ),
      db.all(
        `SELECT * FROM activities
          WHERE employee_id = ? AND timestamp >= ? AND timestamp < ?`,
        [emp.id, empStart, empEnd]
      ),
      db.get(
        `SELECT COUNT(*) as count FROM activities
          WHERE employee_id = ? AND timestamp >= ? AND timestamp < ? AND is_suspicious = 1`,
        [emp.id, empStart, empEnd]
      )
    ]);

    const mapped = (todayRows as any[]).map(mapActivity);
    const annotated = hasBusinessHours(emp)
      ? annotateOutsideHours(mapped, emp, resolvedTz)
      : mapped.map(a => ({ ...a, outsideBusinessHours: false }));
    const stats = computeProductivityStats(annotated);

    results.push({
      employeeId: emp.id,
      employeeName: emp.name,
      currentActivity: latestActivity?.window_title,
      currentCategory: latestActivity?.category_name,
      productivityScore: stats.productivityScore,
      hoursToday: Math.round(stats.totalSeconds / 3600 * 10) / 10,
      secondsToday: stats.totalSeconds,
      suspiciousActivityCount: suspiciousCount?.count || 0,
      isIdle: latestActivity?.is_idle === 1,
      hasBusinessHours: hasBusinessHours(emp),
      outsideHoursSeconds: stats.outsideHoursSeconds
    });
  }

  return results;
}
