// Database migrations for ArchTrack multi-tenancy
import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';

type DB = Database<sqlite3.Database, sqlite3.Statement>;

export async function runMigrations(db: DB): Promise<void> {
  // Create migrations tracking table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = await db.get('SELECT MAX(version) as v FROM _migrations');
  const currentVersion = applied?.v || 0;

  const migrations: Array<{ version: number; name: string; up: (db: DB) => Promise<void> }> = [
    {
      version: 1,
      name: 'multi-tenancy: add organizations, users, setup_tokens, org_id columns',
      up: async (db: DB) => {
        // New tables
        await db.exec(`
          CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            owner_email TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES organizations(id)
          );

          CREATE TABLE IF NOT EXISTS setup_tokens (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            is_used INTEGER DEFAULT 0,
            used_at TEXT,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES organizations(id),
            FOREIGN KEY (employee_id) REFERENCES employees(id)
          );

          CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            employee_id TEXT,
            token_hash TEXT UNIQUE NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_setup_tokens_token ON setup_tokens(token);
          CREATE INDEX IF NOT EXISTS idx_setup_tokens_org ON setup_tokens(org_id);
          CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
        `);

        // Add org_id to existing tables (SQLite ALTER TABLE only supports ADD COLUMN)
        const tables = ['employees', 'projects', 'tasks', 'activities', 'time_entries', 'role_profiles', 'classification_overrides'];
        for (const table of tables) {
          // Check if column already exists
          const columns = await db.all(`PRAGMA table_info(${table})`);
          const hasOrgId = columns.some((c: any) => c.name === 'org_id');
          if (!hasOrgId) {
            await db.exec(`ALTER TABLE ${table} ADD COLUMN org_id TEXT`);
            await db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_org ON ${table}(org_id)`);
          }
        }

        // Create a default org for existing data
        const now = new Date().toISOString();
        const defaultOrgId = 'org-default';
        const existingOrg = await db.get('SELECT id FROM organizations WHERE id = ?', defaultOrgId);
        if (!existingOrg) {
          await db.run(
            `INSERT INTO organizations (id, name, slug, owner_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [defaultOrgId, 'Default Organization', 'default', 'admin@localhost', now, now]
          );
        }

        // Backfill existing rows with the default org_id
        for (const table of tables) {
          await db.run(`UPDATE ${table} SET org_id = ? WHERE org_id IS NULL`, [defaultOrgId]);
        }

        console.log('  Migration 1: Multi-tenancy schema applied, existing data backfilled to org-default');
      }
    },
    {
      version: 2,
      name: 'branding + internationalization + business hours',
      up: async (db: DB) => {
        // --- organizations: logo + default timezone + default currency
        const orgCols = await db.all(`PRAGMA table_info(organizations)`);
        const orgColNames = new Set(orgCols.map((c: any) => c.name));
        if (!orgColNames.has('timezone')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN timezone TEXT DEFAULT 'UTC'`);
        }
        if (!orgColNames.has('logo_url')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN logo_url TEXT`);
        }
        if (!orgColNames.has('default_currency')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN default_currency TEXT DEFAULT 'USD'`);
        }

        // --- employees: currency + timezone override + business hours
        const empCols = await db.all(`PRAGMA table_info(employees)`);
        const empColNames = new Set(empCols.map((c: any) => c.name));
        if (!empColNames.has('currency')) {
          await db.exec(`ALTER TABLE employees ADD COLUMN currency TEXT`);
        }
        if (!empColNames.has('timezone')) {
          await db.exec(`ALTER TABLE employees ADD COLUMN timezone TEXT`);
        }
        if (!empColNames.has('business_hours_start')) {
          await db.exec(`ALTER TABLE employees ADD COLUMN business_hours_start TEXT`);
        }
        if (!empColNames.has('business_hours_end')) {
          await db.exec(`ALTER TABLE employees ADD COLUMN business_hours_end TEXT`);
        }
        if (!empColNames.has('business_hours_days')) {
          // Comma-separated ISO day-of-week: 1=Mon..7=Sun. e.g. "1,2,3,4,5"
          await db.exec(`ALTER TABLE employees ADD COLUMN business_hours_days TEXT`);
        }

        console.log('  Migration 2: Org branding + currency + timezone + business hours columns added');
      }
    },
    {
      version: 3,
      name: 'screenshots + daily email summary settings + per-project rollup hooks',
      up: async (db: DB) => {
        // --- screenshots table (one row per captured screenshot)
        await db.exec(`
          CREATE TABLE IF NOT EXISTS screenshots (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            file_path TEXT NOT NULL,           -- relative path under data/uploads/screenshots/
            file_size_bytes INTEGER DEFAULT 0,
            width INTEGER,
            height INTEGER,
            app_name TEXT,                     -- foreground app at time of capture (best-effort)
            window_title TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (org_id) REFERENCES organizations(id),
            FOREIGN KEY (employee_id) REFERENCES employees(id)
          );
          CREATE INDEX IF NOT EXISTS idx_screenshots_org_emp ON screenshots(org_id, employee_id);
          CREATE INDEX IF NOT EXISTS idx_screenshots_timestamp ON screenshots(timestamp);
        `);

        // --- daily summary settings + screenshot policy on the organization
        const orgCols = await db.all(`PRAGMA table_info(organizations)`);
        const orgColNames = new Set(orgCols.map((c: any) => c.name));
        if (!orgColNames.has('daily_summary_enabled')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN daily_summary_enabled INTEGER DEFAULT 0`);
        }
        if (!orgColNames.has('daily_summary_recipient')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN daily_summary_recipient TEXT`);
        }
        if (!orgColNames.has('daily_summary_hour')) {
          // Hour-of-day in the org's local timezone, 0-23. Defaults to 18 (6pm).
          await db.exec(`ALTER TABLE organizations ADD COLUMN daily_summary_hour INTEGER DEFAULT 18`);
        }
        if (!orgColNames.has('daily_summary_last_sent_date')) {
          // YYYY-MM-DD in org tz of the last day a summary email was actually sent.
          // Used by the cron to dedupe so a restart doesn't double-send.
          await db.exec(`ALTER TABLE organizations ADD COLUMN daily_summary_last_sent_date TEXT`);
        }
        if (!orgColNames.has('screenshots_enabled')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN screenshots_enabled INTEGER DEFAULT 0`);
        }
        if (!orgColNames.has('screenshot_interval_minutes')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN screenshot_interval_minutes INTEGER DEFAULT 10`);
        }
        if (!orgColNames.has('screenshot_retention_days')) {
          await db.exec(`ALTER TABLE organizations ADD COLUMN screenshot_retention_days INTEGER DEFAULT 7`);
        }

        // --- per-project rollup hooks on activities (nullable, no backfill)
        const actCols = await db.all(`PRAGMA table_info(activities)`);
        const actColNames = new Set(actCols.map((c: any) => c.name));
        if (!actColNames.has('project_id')) {
          await db.exec(`ALTER TABLE activities ADD COLUMN project_id TEXT`);
          await db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id)`);
        }
        if (!actColNames.has('task_id')) {
          await db.exec(`ALTER TABLE activities ADD COLUMN task_id TEXT`);
          await db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_task ON activities(task_id)`);
        }

        console.log('  Migration 3: Screenshots table + daily-summary settings + per-project columns added');
      }
    },
    {
      version: 4,
      name: 'make employee email optional + add job_type column',
      up: async (db: DB) => {
        // SQLite can't ALTER COLUMN, so rebuild the table to drop NOT NULL on email
        await db.exec(`
          CREATE TABLE employees_new (
            id TEXT PRIMARY KEY,
            org_id TEXT,
            name TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL DEFAULT 'employee',
            department TEXT,
            hourly_rate REAL,
            currency TEXT,
            timezone TEXT,
            business_hours_start TEXT,
            business_hours_end TEXT,
            business_hours_days TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            job_type TEXT DEFAULT 'auto-detect'
          );
          INSERT INTO employees_new (
            id, org_id, name, email, role, department, hourly_rate, currency, timezone,
            business_hours_start, business_hours_end, business_hours_days,
            is_active, created_at, updated_at
          )
          SELECT
            id, org_id, name, email, role, department, hourly_rate, currency, timezone,
            business_hours_start, business_hours_end, business_hours_days,
            is_active, created_at, updated_at
          FROM employees;
          DROP TABLE employees;
          ALTER TABLE employees_new RENAME TO employees;
          CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(org_id);
        `);
        console.log('  Migration 4: Employee email is now optional, job_type column added');
      }
    }
  ];

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration ${migration.version}: ${migration.name}`);
      await migration.up(db);
      await db.run('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)', [migration.version, new Date().toISOString()]);
    }
  }
}
