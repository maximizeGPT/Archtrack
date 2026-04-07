// Smart Role Detection for ArchTrack
// Analyzes employee activity patterns to auto-detect job type
// and reclassify apps accordingly

import { getDatabase } from './database.js';

// Detectable job types with their signature app patterns
export interface RoleProfile {
  roleType: string;
  displayName: string;
  description: string;
  // Apps that become "core_work" for this role
  coreApps: string[];
  // Apps that become "research_learning" for this role
  researchApps: string[];
  // Minimum % of time in signature apps to trigger detection
  signatureThreshold: number;
}

export const ROLE_PROFILES: RoleProfile[] = [
  {
    roleType: 'developer',
    displayName: 'Software Developer',
    description: 'Writes code, uses IDEs, terminals, and AI coding tools',
    coreApps: [
      'vscode', 'visual studio code', 'cursor', 'intellij', 'webstorm', 'pycharm',
      'terminal', 'iterm', 'warp', 'alacritty', 'hyper',
      'claude', 'chatgpt', 'copilot', 'codewhisperer',
      'docker', 'postman', 'insomnia',
      'xcode', 'android studio', 'sublime text', 'vim', 'neovim', 'emacs',
    ],
    researchApps: [
      'stackoverflow', 'github', 'gitlab', 'npm', 'pypi', 'crates.io',
      'mdn web docs', 'devdocs', 'docs.rs',
    ],
    signatureThreshold: 25,
  },
  {
    roleType: 'designer',
    displayName: 'Designer',
    description: 'Creates visual designs, UI/UX, and graphics',
    coreApps: [
      'figma', 'sketch', 'adobe xd', 'invision',
      'adobe photoshop', 'photoshop', 'adobe illustrator', 'illustrator',
      'adobe indesign', 'indesign', 'canva',
      'affinity designer', 'affinity photo', 'procreate',
      'blender', 'cinema 4d', 'after effects',
    ],
    researchApps: [
      'dribbble', 'behance', 'pinterest', 'awwwards', 'unsplash',
    ],
    signatureThreshold: 25,
  },
  {
    roleType: 'architect',
    displayName: 'Architect / Engineer',
    description: 'Uses CAD, 3D modeling, and engineering tools',
    coreApps: [
      'autocad', 'cad', 'revit', 'sketchup', 'solidworks', 'catia',
      'rhinoceros', 'rhino', 'archicad', 'vectorworks',
      'civil 3d', 'lumion', 'enscape', 'twinmotion',
      'navisworks', 'bim',
    ],
    researchApps: [
      'archdaily', 'architizer', 'building codes',
    ],
    signatureThreshold: 20,
  },
  {
    roleType: 'manager',
    displayName: 'Project Manager',
    description: 'Spends time in meetings, project tools, and communication',
    coreApps: [
      'jira', 'asana', 'trello', 'monday.com', 'clickup',
      'microsoft project', 'smartsheet', 'airtable',
      'zoom', 'google meet', 'webex', 'microsoft teams',
      'slack', 'microsoft teams',
    ],
    researchApps: [
      'confluence', 'notion', 'google docs', 'sharepoint',
    ],
    signatureThreshold: 35,
  },
  {
    roleType: 'sales',
    displayName: 'Sales / Account Manager',
    description: 'Uses CRM, email, and communication tools heavily',
    coreApps: [
      'salesforce', 'hubspot', 'pipedrive', 'zoho crm',
      'outreach', 'salesloft', 'gong', 'chorus',
      'linkedin', 'linkedin sales navigator',
      'zoom', 'google meet', 'calendly',
    ],
    researchApps: [
      'crunchbase', 'zoominfo', 'apollo',
    ],
    signatureThreshold: 30,
  },
  {
    roleType: 'data_analyst',
    displayName: 'Data Analyst / Scientist',
    description: 'Works with data tools, notebooks, and visualization',
    coreApps: [
      'jupyter', 'notebook', 'rstudio', 'tableau', 'power bi',
      'looker', 'metabase', 'grafana', 'datagrip',
      'excel', 'google sheets', 'spreadsheet',
      'python', 'r console', 'matlab', 'spss',
    ],
    researchApps: [
      'kaggle', 'towards data science', 'arxiv',
    ],
    signatureThreshold: 25,
  },
];

export interface DetectedRole {
  employeeId: string;
  roleType: string;
  displayName: string;
  confidence: number; // 0-100
  status: 'learning' | 'detected' | 'confirmed' | 'admin_override';
  appBreakdown: Record<string, number>; // app -> minutes
  detectedAt: string;
  learningStartedAt: string;
  totalActivitiesAnalyzed: number;
}

export interface ClassificationOverride {
  id: string;
  employeeId: string | null; // null = global override for a role
  roleType: string | null;   // null = override applies to all roles
  appPattern: string;
  category: string;
  productivityScore: number;
  createdBy: string;
  createdAt: string;
}

// Minimum activities before we attempt role detection
const MIN_ACTIVITIES_FOR_DETECTION = 50;
// Minimum hours of data before we lock in a role
const LEARNING_PERIOD_HOURS = 8;

export async function detectEmployeeRole(employeeId: string): Promise<DetectedRole> {
  const db = getDatabase();

  // Get all activities for this employee
  const activities = await db.all(
    `SELECT app_name, window_title, duration_seconds, timestamp, category
     FROM activities
     WHERE employee_id = ? AND is_idle = 0
     ORDER BY timestamp ASC`,
    [employeeId]
  );

  // Calculate total tracked time
  const totalSeconds = activities.reduce((sum: number, a: any) => sum + (a.duration_seconds || 0), 0);
  const totalMinutes = totalSeconds / 60;
  const totalHours = totalMinutes / 60;

  // Build app usage map (app -> total minutes)
  const appUsage = new Map<string, number>();
  for (const activity of activities) {
    const appLower = (activity.app_name || '').toLowerCase();
    const titleLower = (activity.window_title || '').toLowerCase();
    const minutes = (activity.duration_seconds || 0) / 60;

    // Count by both app name and window title keywords
    const key = appLower || titleLower;
    appUsage.set(key, (appUsage.get(key) || 0) + minutes);
  }

  // Score each role profile
  let bestRole: { profile: RoleProfile; score: number; matchedMinutes: number } | null = null;

  for (const profile of ROLE_PROFILES) {
    let matchedMinutes = 0;

    for (const [app, minutes] of appUsage.entries()) {
      const isCoreMatch = profile.coreApps.some(p => app.includes(p));
      const isResearchMatch = profile.researchApps.some(p => app.includes(p));

      if (isCoreMatch || isResearchMatch) {
        matchedMinutes += minutes;
      }
    }

    const percentage = totalMinutes > 0 ? (matchedMinutes / totalMinutes) * 100 : 0;

    if (percentage >= profile.signatureThreshold) {
      if (!bestRole || percentage > bestRole.score) {
        bestRole = { profile, score: percentage, matchedMinutes };
      }
    }
  }

  // Determine status
  let status: DetectedRole['status'] = 'learning';
  const confidence = bestRole ? Math.min(Math.round(bestRole.score * 1.5), 100) : 0;

  // Check if admin has overridden
  const override = await db.get(
    `SELECT * FROM role_profiles WHERE employee_id = ? AND status = 'admin_override'`,
    [employeeId]
  );

  if (override) {
    const overrideProfile = ROLE_PROFILES.find(p => p.roleType === override.role_type);
    return {
      employeeId,
      roleType: override.role_type,
      displayName: overrideProfile?.displayName || override.role_type,
      confidence: 100,
      status: 'admin_override',
      appBreakdown: Object.fromEntries(appUsage),
      detectedAt: override.detected_at,
      learningStartedAt: override.learning_started_at,
      totalActivitiesAnalyzed: activities.length,
    };
  }

  if (activities.length >= MIN_ACTIVITIES_FOR_DETECTION && totalHours >= LEARNING_PERIOD_HOURS) {
    status = bestRole ? 'detected' : 'learning';
  }

  const firstActivity = activities[0];
  const learningStartedAt = firstActivity?.timestamp || new Date().toISOString();

  const result: DetectedRole = {
    employeeId,
    roleType: bestRole?.profile.roleType || 'unknown',
    displayName: bestRole?.profile.displayName || 'Not yet detected',
    confidence,
    status,
    appBreakdown: Object.fromEntries(appUsage),
    detectedAt: status === 'detected' ? new Date().toISOString() : '',
    learningStartedAt,
    totalActivitiesAnalyzed: activities.length,
  };

  // Persist the detection
  if (bestRole && status === 'detected') {
    await saveRoleProfile(result);
  }

  return result;
}

async function saveRoleProfile(role: DetectedRole): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.run(
    `INSERT OR REPLACE INTO role_profiles
     (employee_id, role_type, display_name, confidence, status, detected_at, learning_started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [role.employeeId, role.roleType, role.displayName, role.confidence, role.status, role.detectedAt, role.learningStartedAt, now]
  );
}

// Reclassify an activity based on detected role
export function reclassifyForRole(
  roleType: string,
  appName: string,
  windowTitle: string,
  originalCategory: string,
  originalScore: number
): { category: string; categoryName: string; productivityScore: number; productivityLevel: string } {
  const profile = ROLE_PROFILES.find(p => p.roleType === roleType);
  if (!profile) {
    return { category: originalCategory, categoryName: originalCategory, productivityScore: originalScore, productivityLevel: getLevelForScore(originalScore) };
  }

  const appLower = appName.toLowerCase();
  const titleLower = windowTitle.toLowerCase();

  // Check if this app is core work for the detected role
  const isCoreForRole = profile.coreApps.some(p => appLower.includes(p) || titleLower.includes(p));
  if (isCoreForRole && originalCategory !== 'core_work') {
    return {
      category: 'core_work',
      categoryName: 'Core Work',
      productivityScore: 95,
      productivityLevel: 'productive',
    };
  }

  // Check if this app is research for the detected role
  const isResearchForRole = profile.researchApps.some(p => appLower.includes(p) || titleLower.includes(p));
  if (isResearchForRole && originalCategory !== 'research_learning' && originalCategory !== 'core_work') {
    return {
      category: 'research_learning',
      categoryName: 'Research & Learning',
      productivityScore: 85,
      productivityLevel: 'productive',
    };
  }

  return { category: originalCategory, categoryName: getCategoryName(originalCategory), productivityScore: originalScore, productivityLevel: getLevelForScore(originalScore) };
}

// Apply classification overrides (admin-set). Org-scoped: only overrides
// belonging to the caller's org are considered, so one org can't override
// classification for another org's activities even if they happen to share
// an employee_id by accident.
export async function applyOverrides(
  employeeId: string,
  roleType: string,
  appName: string,
  windowTitle: string,
  category: string,
  score: number,
  orgId?: string
): Promise<{ category: string; categoryName: string; productivityScore: number; productivityLevel: string }> {
  const db = getDatabase();

  // Check for employee-specific override first, then role-based, then global
  const override = await db.get(
    `SELECT * FROM classification_overrides
     WHERE (org_id IS NULL OR org_id = ?)
     AND (employee_id = ? OR employee_id IS NULL)
     AND (role_type = ? OR role_type IS NULL)
     AND (LOWER(?) LIKE '%' || LOWER(app_pattern) || '%' OR LOWER(?) LIKE '%' || LOWER(app_pattern) || '%')
     ORDER BY
       CASE WHEN employee_id IS NOT NULL THEN 0 ELSE 1 END,
       CASE WHEN role_type IS NOT NULL THEN 0 ELSE 1 END
     LIMIT 1`,
    [orgId || null, employeeId, roleType, appName, windowTitle]
  );

  if (override) {
    return {
      category: override.category,
      categoryName: getCategoryName(override.category),
      productivityScore: override.productivity_score,
      productivityLevel: getLevelForScore(override.productivity_score),
    };
  }

  return { category, categoryName: getCategoryName(category), productivityScore: score, productivityLevel: getLevelForScore(score) };
}

function getLevelForScore(score: number): string {
  if (score >= 60) return 'productive';
  if (score >= 20) return 'neutral';
  if (score > 0) return 'unproductive';
  return 'idle';
}

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    core_work: 'Core Work',
    communication: 'Communication',
    research_learning: 'Research & Learning',
    planning_docs: 'Planning & Documentation',
    break_idle: 'Break/Idle',
    entertainment: 'Entertainment',
    social_media: 'Social Media',
    shopping_personal: 'Shopping/Personal',
    other: 'Other',
  };
  return names[category] || category;
}

// Get role detection status for admin dashboard
export async function getRoleStatus(employeeId: string): Promise<{
  status: string;
  roleType: string;
  displayName: string;
  confidence: number;
  learningProgress: number; // 0-100%
  hoursTracked: number;
  activitiesCount: number;
  hoursNeeded: number;
  activitiesNeeded: number;
}> {
  const db = getDatabase();

  // Check saved profile first
  const saved = await db.get(
    `SELECT * FROM role_profiles WHERE employee_id = ?`,
    [employeeId]
  );

  // Get activity stats
  const stats = await db.get(
    `SELECT COUNT(*) as count, COALESCE(SUM(duration_seconds), 0) as total_seconds
     FROM activities WHERE employee_id = ? AND is_idle = 0`,
    [employeeId]
  );

  const hoursTracked = (stats?.total_seconds || 0) / 3600;
  const activitiesCount = stats?.count || 0;

  const hoursProgress = Math.min(hoursTracked / LEARNING_PERIOD_HOURS, 1);
  const activitiesProgress = Math.min(activitiesCount / MIN_ACTIVITIES_FOR_DETECTION, 1);
  const learningProgress = Math.round(Math.min(hoursProgress, activitiesProgress) * 100);

  if (saved) {
    return {
      status: saved.status,
      roleType: saved.role_type,
      displayName: saved.display_name,
      confidence: saved.confidence,
      learningProgress: saved.status === 'learning' ? learningProgress : 100,
      hoursTracked: Math.round(hoursTracked * 10) / 10,
      activitiesCount,
      hoursNeeded: LEARNING_PERIOD_HOURS,
      activitiesNeeded: MIN_ACTIVITIES_FOR_DETECTION,
    };
  }

  return {
    status: 'learning',
    roleType: 'unknown',
    displayName: 'Gathering data...',
    confidence: 0,
    learningProgress,
    hoursTracked: Math.round(hoursTracked * 10) / 10,
    activitiesCount,
    hoursNeeded: LEARNING_PERIOD_HOURS,
    activitiesNeeded: MIN_ACTIVITIES_FOR_DETECTION,
  };
}
