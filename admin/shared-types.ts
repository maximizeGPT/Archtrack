// Shared types for ArchTrack

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  timezone?: string;              // IANA tz, default "UTC"
  logoUrl?: string | null;        // relative path served from /uploads/*
  defaultCurrency?: string;       // ISO 4217 code, default "USD"
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  passwordHash?: string;
  name: string;
  role: 'owner' | 'admin' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

export interface SetupToken {
  id: string;
  orgId: string;
  employeeId: string;
  token: string;
  isUsed: boolean;
  usedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  orgId?: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'admin';
  department?: string;
  hourlyRate?: number;
  currency?: string;              // ISO 4217 code, e.g. "USD", "INR"
  timezone?: string;              // IANA tz, overrides org tz for this employee
  businessHoursStart?: string;    // "HH:MM"
  businessHoursEnd?: string;      // "HH:MM" (exclusive)
  businessHoursDays?: string;     // comma-separated ISO weekday: "1,2,3,4,5"
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
  logoUrl?: string | null;
  defaultCurrency?: string;
}

export interface Project {
  id: string;
  orgId?: string;
  name: string;
  description?: string;
  clientName?: string;
  status: 'active' | 'completed' | 'on-hold';
  startDate: string;
  endDate?: string;
  budget?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  orgId?: string;
  projectId: string;
  name: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  orgId?: string;
  employeeId: string;
  taskId?: string;
  projectId?: string;
  description?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  isBillable?: boolean;
  idleTime?: number;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  orgId?: string;
  employeeId: string;
  timestamp: string;
  appName: string;
  windowTitle: string;
  category: string;
  categoryName: string;
  productivityScore: number;
  productivityLevel: 'productive' | 'unproductive' | 'neutral' | 'idle';
  isSuspicious: boolean;
  suspiciousReason?: string;
  isIdle: boolean;
  idleTimeSeconds: number;
  durationSeconds: number;
  createdAt: string;
}

export interface ProductivityReport {
  employeeId: string;
  employeeName: string;
  dateRange: { start: string; end: string };
  summary: {
    totalHours: number;
    productiveHours: number;
    unproductiveHours: number;
    neutralHours: number;
    averageProductivityScore: number;
    focusScore: number;
  };
  categoryBreakdown: Record<string, number>;
  suspiciousActivities: Activity[];
  dailyTrend: Array<{
    date: string;
    productivityScore: number;
    productiveMinutes: number;
    unproductiveMinutes: number;
  }>;
}

// ===========================================================================
// Unified productivity statistics — single source of truth
// ---------------------------------------------------------------------------
// Used by BOTH the Dashboard stats endpoint and the Reports endpoint so the
// numbers always reconcile and the score formula is consistent across pages.
//
// Formula (approved 2026-04-06):
//   productivityScore = productiveSeconds / (productiveSeconds + unproductiveSeconds) * 100
//
// Rationale:
//   - Excluding `neutral` (e.g. "Other" such as the admin browsing their own
//     dashboard) prevents legitimate-but-unclassified time from dragging the
//     score down.
//   - Excluding `idle` / `break_idle` prevents lunch breaks and AFK time
//     from distorting the numerator or denominator.
//   - All buckets (productive + unproductive + neutral + idle + outsideHours)
//     are still tracked and exposed separately so Reports can show a full
//     reconcilable breakdown that sums to the total.
// ===========================================================================

export interface ProductivityStats {
  totalSeconds: number;          // productive + unproductive + neutral + idle (NOT outsideHours)
  productiveSeconds: number;
  unproductiveSeconds: number;
  neutralSeconds: number;
  idleSeconds: number;
  outsideHoursSeconds: number;
  categorySeconds: Record<string, number>; // canonical id → seconds
  productivityScore: number;     // 0..100 integer
}

export interface ProductivityActivityLike {
  category?: string | null;
  categoryName?: string | null;
  productivityLevel?: string | null;
  isIdle?: boolean | number | null;
  durationSeconds?: number | null;
  outsideBusinessHours?: boolean;
}

export function computeProductivityStats(
  activities: ProductivityActivityLike[]
): ProductivityStats {
  let productive = 0;
  let unproductive = 0;
  let neutral = 0;
  let idle = 0;
  let outside = 0;
  const categorySeconds: Record<string, number> = {};

  for (const a of activities) {
    const dur = Math.max(0, Math.floor(a.durationSeconds || 0));
    if (dur === 0) continue;

    if (a.outsideBusinessHours) {
      outside += dur;
      continue;
    }

    const cat = a.category || 'other';
    categorySeconds[cat] = (categorySeconds[cat] || 0) + dur;

    const isIdleRow = a.isIdle === true || a.isIdle === 1 || a.productivityLevel === 'idle';
    if (isIdleRow) {
      idle += dur;
      continue;
    }

    switch (a.productivityLevel) {
      case 'productive':
        productive += dur;
        break;
      case 'unproductive':
        unproductive += dur;
        break;
      case 'neutral':
      default:
        neutral += dur;
        break;
    }
  }

  const active = productive + unproductive;
  const score = active > 0 ? Math.round((productive / active) * 100) : 0;

  return {
    totalSeconds: productive + unproductive + neutral + idle,
    productiveSeconds: productive,
    unproductiveSeconds: unproductive,
    neutralSeconds: neutral,
    idleSeconds: idle,
    outsideHoursSeconds: outside,
    categorySeconds,
    productivityScore: score
  };
}

// ---------------------------------------------------------------------------
// Precise duration formatter
// ---------------------------------------------------------------------------
// Input is SECONDS (integer).
//
//   0       → "0"
//   < 60s   → "<1m"
//   < 60m   → "42m"
//   < 10h   → "1h 23m"   (honest: won't round 57m up to 1.0h)
//   ≥ 10h   → "12.3h"
// ---------------------------------------------------------------------------
export function formatDurationSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s === 0) return '0';
  if (s < 60) return '<1m';
  const totalMinutes = Math.round(s / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = totalMinutes / 60;
  if (hours < 10) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  return `${(Math.round(hours * 10) / 10).toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Category display names (keep in sync with shared/src/classification.ts)
// ---------------------------------------------------------------------------
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  core_work: 'Core Work',
  communication: 'Communication',
  research_learning: 'Research & Learning',
  planning_docs: 'Planning & Documentation',
  break_idle: 'Break/Idle',
  entertainment: 'Entertainment',
  social_media: 'Social Media',
  shopping_personal: 'Shopping/Personal',
  other: 'Other'
};

// Color per category — used by Dashboard breakdown + Reports chart legend
export const CATEGORY_COLORS: Record<string, string> = {
  core_work: '#27ae60',
  communication: '#3498db',
  research_learning: '#9b59b6',
  planning_docs: '#1abc9c',
  break_idle: '#95a5a6',
  other: '#bdc3c7',
  entertainment: '#e74c3c',
  social_media: '#e67e22',
  shopping_personal: '#f39c12'
};

// Canonical order for rendering the full breakdown (productive → unproductive)
export const CANONICAL_CATEGORY_ORDER: string[] = [
  'core_work',
  'communication',
  'research_learning',
  'planning_docs',
  'other',
  'break_idle',
  'entertainment',
  'social_media',
  'shopping_personal'
];

// ---------------------------------------------------------------------------
// Currency display helpers
// ---------------------------------------------------------------------------
export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar',        symbol: '$' },
  { code: 'EUR', label: 'Euro',             symbol: '€' },
  { code: 'GBP', label: 'British Pound',    symbol: '£' },
  { code: 'INR', label: 'Indian Rupee',     symbol: '₹' },
  { code: 'CAD', label: 'Canadian Dollar',  symbol: 'CA$' },
  { code: 'AUD', label: 'Australian Dollar',symbol: 'A$' },
  { code: 'JPY', label: 'Japanese Yen',     symbol: '¥' },
  { code: 'AED', label: 'UAE Dirham',       symbol: 'د.إ' },
  { code: 'SAR', label: 'Saudi Riyal',      symbol: '﷼' },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$' },
  { code: 'BRL', label: 'Brazilian Real',   symbol: 'R$' },
  { code: 'MXN', label: 'Mexican Peso',     symbol: 'MX$' },
  { code: 'ZAR', label: 'South African Rand', symbol: 'R' },
  { code: 'CHF', label: 'Swiss Franc',      symbol: 'Fr' },
  { code: 'CNY', label: 'Chinese Yuan',     symbol: 'CN¥' }
];

export function formatCurrency(amount: number, currency: string): string {
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    const sym = SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol || code + ' ';
    return `${sym}${amount.toFixed(2)}`;
  }
}

// ---------------------------------------------------------------------------
// Supported job roles (for admin override UI)
// ---------------------------------------------------------------------------
export interface JobRoleOption {
  id: string;
  label: string;
  icon: string;
}

export const JOB_ROLES: JobRoleOption[] = [
  { id: 'auto',          label: 'Auto-detect',   icon: '🤖' },
  { id: 'developer',     label: 'Developer',     icon: '💻' },
  { id: 'designer',      label: 'Designer',      icon: '🎨' },
  { id: 'architect',     label: 'Architect',     icon: '📐' },
  { id: 'manager',       label: 'Manager',       icon: '📋' },
  { id: 'sales',         label: 'Sales',         icon: '💼' },
  { id: 'data_analyst',  label: 'Data Analyst',  icon: '📊' },
  { id: 'writer',        label: 'Writer/Editor', icon: '✍️' }
];
