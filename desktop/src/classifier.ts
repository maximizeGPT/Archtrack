// Activity Classification System for ArchTrack Desktop
// Universal classification that works for ANY employee type

export type ActivityCategory =
  | 'core_work'
  | 'communication'
  | 'research_learning'
  | 'planning_docs'
  | 'break_idle'
  | 'entertainment'
  | 'social_media'
  | 'shopping_personal'
  | 'other';

export type ProductivityLevel = 'productive' | 'neutral' | 'unproductive' | 'idle';

export interface ActivityClassification {
  category: ActivityCategory;
  categoryName: string;
  productivityScore: number;
  productivityLevel: ProductivityLevel;
  isSuspicious: boolean;
  suspiciousReason?: string;
  isIdle: boolean;
}

// Productivity scores by category (0-100)
export const PRODUCTIVITY_SCORES: Record<ActivityCategory, number> = {
  core_work: 95,
  communication: 70,
  research_learning: 85,
  planning_docs: 80,
  break_idle: 0,
  entertainment: 5,
  social_media: 10,
  shopping_personal: 5,
  other: 30
};

export const CATEGORY_NAMES: Record<ActivityCategory, string> = {
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

export const PRODUCTIVITY_LEVELS: Record<ActivityCategory, ProductivityLevel> = {
  core_work: 'productive',
  communication: 'productive',
  research_learning: 'productive',
  planning_docs: 'productive',
  break_idle: 'idle',
  entertainment: 'unproductive',
  social_media: 'unproductive',
  shopping_personal: 'unproductive',
  other: 'neutral'
};

// Universal app classification - works for ANY employee type
interface AppRule {
  patterns: string[];
  category: ActivityCategory;
  exceptions?: string[];
}

export const APP_CLASSIFICATION_RULES: AppRule[] = [
  // Core Work Tools (generic - covers many professions)
  {
    patterns: [
      'microsoft excel', 'excel', 'google sheets', 'spreadsheet',
      'microsoft word', 'word', 'google docs',
      'microsoft powerpoint', 'powerpoint', 'google slides',
      'pdf', 'acrobat', 'preview - pdf',
      'autocad', 'cad', 'revit', 'sketchup', 'solidworks', 'catia',
      'figma', 'sketch', 'adobe illustrator', 'adobe photoshop', 'photoshop',
      'vscode', 'visual studio code', 'code -', 'cursor', 'intellij',
      'machinery', 'cnc', 'scada', 'plc', 'hmi',
      'quickbooks', 'sap', 'oracle', 'salesforce',
      'epic', 'cerner', 'allscripts',
    ],
    category: 'core_work'
  },

  // Communication (where the "ghost" tricks happen)
  {
    patterns: ['slack', 'microsoft teams', 'teams -', 'zoom', 'google meet', 'webex', 'skype', 'discord', 'telegram', 'whatsapp'],
    category: 'communication'
  },

  // Email
  {
    patterns: ['outlook', 'gmail', 'mail', 'thunderbird', 'apple mail'],
    category: 'communication'
  },

  // Research & Learning (work-related)
  {
    patterns: [
      'stackoverflow', 'github', 'gitlab', 'documentation', 'docs.',
      'wikipedia', 'wikis', 'confluence', 'notion', 'obsidian',
      'udemy', 'coursera', 'linkedin learning', 'pluralsight',
    ],
    category: 'research_learning',
    exceptions: ['facebook', 'instagram', 'twitter', 'reddit']
  },

  // OpenClaw - Core Work (employee-specific context)
  {
    patterns: [
      'openclaw', 'claw', 'mohltbot', 'mission-control', 'archtrack', 'arch-track',
    ],
    category: 'core_work'
  },

  // Planning & Documentation
  {
    patterns: [
      'jira', 'asana', 'trello', 'monday.com', 'clickup', 'notion',
      'microsoft project', 'smartsheet', 'airtable',
    ],
    category: 'planning_docs'
  },

  // Entertainment (the time wasters)
  {
    patterns: [
      'youtube', 'netflix', 'hulu', 'disney+', 'amazon prime video',
      'spotify', 'apple music', 'pandora', 'tidal',
      'twitch', 'tiktok',
    ],
    category: 'entertainment',
    exceptions: ['tutorial', 'course', 'lecture', 'how to', 'documentation', 'workshop', 'training']
  },

  // Social Media
  {
    patterns: [
      'facebook', 'instagram', 'twitter', 'x.com', 'linkedin', 'reddit',
      'pinterest', 'snapchat', 'tumblr',
    ],
    category: 'social_media'
  },

  // Shopping/Personal
  {
    patterns: [
      'amazon', 'ebay', 'etsy', 'walmart', 'target', 'best buy',
      'bank', 'credit card', 'paypal', 'venmo',
    ],
    category: 'shopping_personal'
  },

  // System/Browser (neutral)
  {
    patterns: [
      'finder', 'explorer', 'desktop', 'system preferences', 'settings',
      'chrome', 'safari', 'firefox', 'edge', 'new tab', 'google search',
    ],
    category: 'other'
  }
];

// Suspicious pattern detection
export interface SuspiciousPattern {
  type: 'video_idle' | 'communication_ghost' | 'rapid_switching' | 'fake_active' | 'long_idle';
  description: string;
  threshold: number;
}

export const SUSPICIOUS_THRESHOLDS = {
  videoIdleMinutes: 15,
  communicationGhostMinutes: 10,
  rapidSwitchSeconds: 3,
  idleThresholdMinutes: 5,
  sameWindowMinutes: 30,
};

// Main classification function
export function classifyActivity(
  appName: string,
  windowTitle: string,
  context?: {
    durationMinutes?: number;
    hasInputActivity?: boolean;
    windowChangeCount?: number;
    lastInputMinutesAgo?: number;
    isVideoPlaying?: boolean;
    isFullscreen?: boolean;
  }
): ActivityClassification {
  const appLower = appName.toLowerCase();
  const titleLower = windowTitle.toLowerCase();

  // Default classification
  let category: ActivityCategory = 'other';
  let isIdle = false;

  // SPECIAL CASE: Check window title FIRST for work indicators in browsers
  // This ensures "mission-control" in a Chrome tab gets classified as Core Work
  const browserApps = ['chrome', 'safari', 'firefox', 'edge', 'brave', 'opera'];
  const isBrowser = browserApps.some(b => appLower.includes(b));

  if (isBrowser) {
    // EMPLOYEE-SPECIFIC CONTEXT: Safari on this Mac mini is dedicated OpenClaw work
    // Since Safari window titles show as "Untitled" due to macOS permissions,
    // we classify all Safari as Core Work for this employee
    if (appLower.includes('safari')) {
      category = 'core_work';
    } else {
      const workIndicators = [
        'openclaw', 'mission-control', 'debug', 'debugger', 'codex',
        'github', 'gitlab', 'bitbucket', 'stackoverflow',
        'docker', 'kubernetes', 'terminal', 'console',
        'api', 'endpoint', 'webhook', 'integration',
        'architecture', 'system design', 'workflow', 'automation',
        'vscode', 'cursor', 'intellij', 'sublime', 'atom',
        'pull request', 'issues', 'bug', 'fix', 'deploy', 'build'
      ];

      const hasWorkIndicator = workIndicators.some(indicator =>
        titleLower.includes(indicator)
      );

      if (hasWorkIndicator) {
        category = 'core_work';
      } else {
        // Check for research/learning indicators
        const researchIndicators = [
          'documentation', 'docs.', 'readme', 'tutorial', 'how to',
          'wikipedia', 'confluence', 'notion', 'obsidian',
          'stackoverflow', 'github.com', 'gitlab.com'
        ];

        const hasResearchIndicator = researchIndicators.some(indicator =>
          titleLower.includes(indicator)
        );

        if (hasResearchIndicator) {
          category = 'research_learning';
        }
      }
    }
  }

  // If not a browser or no work indicator found, use normal rules
  if (category === 'other') {
    // Find matching rule
    for (const rule of APP_CLASSIFICATION_RULES) {
      const matchesPattern = rule.patterns.some(pattern =>
        appLower.includes(pattern) || titleLower.includes(pattern)
      );

      if (matchesPattern) {
        if (rule.exceptions) {
          const hasException = rule.exceptions.some(ex =>
            titleLower.includes(ex)
          );
          if (hasException) {
            if (rule.category === 'entertainment') {
              category = 'research_learning';
            }
            continue;
          }
        }
        category = rule.category;
        break;
      }
    }
  }

  // Detect suspicious patterns
  let isSuspicious = false;
  let suspiciousReason: string | undefined;

  if (context) {
    // Video Idle Trick
    if (category === 'entertainment' && context.isVideoPlaying) {
      if (!context.hasInputActivity || (context.lastInputMinutesAgo && context.lastInputMinutesAgo > 5)) {
        isSuspicious = true;
        suspiciousReason = `Video playing (${appName}) with no interaction for ${context.lastInputMinutesAgo || 'unknown'} min - likely AFK trick`;
        category = 'break_idle';
        isIdle = true;
      }
    }

    // Communication Ghost
    if (category === 'communication') {
      const noInput = !context.hasInputActivity || (context.lastInputMinutesAgo && context.lastInputMinutesAgo > SUSPICIOUS_THRESHOLDS.communicationGhostMinutes);
      const longDuration = context.durationMinutes && context.durationMinutes > SUSPICIOUS_THRESHOLDS.communicationGhostMinutes;

      if (noInput && longDuration) {
        isSuspicious = true;
        suspiciousReason = `${appName} "active" but no input for ${context.lastInputMinutesAgo || context.durationMinutes} min - ghost presence`;
        category = 'break_idle';
        isIdle = true;
      }
    }

    // Long Idle
    if (context.lastInputMinutesAgo && context.lastInputMinutesAgo > SUSPICIOUS_THRESHOLDS.idleThresholdMinutes) {
      if (!isSuspicious) {
        isSuspicious = true;
        suspiciousReason = `No input activity for ${context.lastInputMinutesAgo} min - likely away from desk`;
        category = 'break_idle';
        isIdle = true;
      }
    }

    // Same Window Too Long
    if (context.durationMinutes && context.durationMinutes > SUSPICIOUS_THRESHOLDS.sameWindowMinutes) {
      if (!context.hasInputActivity && !isSuspicious) {
        isSuspicious = true;
        suspiciousReason = `Same window (${appName}) for ${context.durationMinutes} min with no interaction - possible AFK`;
        category = 'break_idle';
        isIdle = true;
      }
    }

    // Rapid Switching
    if (context.windowChangeCount && context.durationMinutes) {
      const switchesPerMinute = context.windowChangeCount / context.durationMinutes;
      if (switchesPerMinute > 10) {
        isSuspicious = true;
        suspiciousReason = `Rapid window switching (${switchesPerMinute.toFixed(1)}/min) - distracted, not focused`;
      }
    }
  }

  return {
    category,
    categoryName: CATEGORY_NAMES[category],
    productivityScore: isIdle ? 0 : PRODUCTIVITY_SCORES[category],
    productivityLevel: isIdle ? 'idle' : PRODUCTIVITY_LEVELS[category],
    isSuspicious,
    suspiciousReason,
    isIdle
  };
}

// Calculate true productivity (excluding idle time)
export function calculateTrueProductivity(
  activities: Array<{
    category: ActivityCategory;
    duration: number;
    isIdle: boolean;
    isSuspicious: boolean;
  }>
): {
  productiveMinutes: number;
  idleMinutes: number;
  unproductiveMinutes: number;
  totalMinutes: number;
  productivityPercentage: number;
} {
  let productive = 0;
  let idle = 0;
  let unproductive = 0;

  for (const activity of activities) {
    const minutes = activity.duration / 60;

    if (activity.isIdle) {
      idle += minutes;
    } else if (PRODUCTIVITY_LEVELS[activity.category] === 'productive') {
      productive += minutes;
    } else {
      unproductive += minutes;
    }
  }

  const total = productive + idle + unproductive;
  const productivityPercentage = total > 0
    ? Math.round((productive / total) * 100)
    : 0;

  return {
    productiveMinutes: Math.round(productive),
    idleMinutes: Math.round(idle),
    unproductiveMinutes: Math.round(unproductive),
    totalMinutes: Math.round(total),
    productivityPercentage
  };
}

// Detect if employee is trying to game the system
export function detectGamingAttempts(
  activities: Array<{
    appName: string;
    windowTitle: string;
    duration: number;
    hasInputActivity?: boolean;
  }>
): Array<{
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}> {
  const issues: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }> = [];

  const hasYouTube = activities.some(a =>
    a.appName.toLowerCase().includes('youtube') && a.duration > 900
  );
  const hasSlackTeams = activities.some(a =>
    (a.appName.toLowerCase().includes('slack') || a.appName.toLowerCase().includes('teams')) &&
    !a.hasInputActivity
  );

  if (hasYouTube && hasSlackTeams) {
    issues.push({
      type: 'video_with_communication',
      description: 'YouTube/Video playing while communication app shows "active" - likely using video to keep status green',
      severity: 'high'
    });
  }

  const commApps = activities.filter(a =>
    a.appName.toLowerCase().includes('slack') ||
    a.appName.toLowerCase().includes('teams')
  );
  const totalCommTime = commApps.reduce((sum, a) => sum + a.duration, 0);
  const hasInputInComm = commApps.some(a => a.hasInputActivity);

  if (totalCommTime > 1800 && !hasInputInComm) {
    issues.push({
      type: 'ghost_presence',
      description: 'Communication app open for extended period with no messages sent - ghost presence detected',
      severity: 'medium'
    });
  }

  return issues;
}

// Generate daily summary
export function generateDailySummary(
  employeeId: string,
  activities: Array<{
    category: ActivityCategory;
    duration: number;
    isIdle: boolean;
    isSuspicious: boolean;
    appName: string;
    windowTitle: string;
  }>
): {
  employeeId: string;
  totalHours: number;
  productiveHours: number;
  idleHours: number;
  unproductiveHours: number;
  productivityScore: number;
  suspiciousActivities: number;
  topApps: Array<{ name: string; hours: number; category: ActivityCategory }>;
  warnings: string[];
} {
  const { productiveMinutes, idleMinutes, unproductiveMinutes, totalMinutes, productivityPercentage } =
    calculateTrueProductivity(activities);

  const appUsage = new Map<string, { duration: number; category: ActivityCategory }>();
  for (const activity of activities) {
    const existing = appUsage.get(activity.appName);
    if (existing) {
      existing.duration += activity.duration;
    } else {
      appUsage.set(activity.appName, { duration: activity.duration, category: activity.category });
    }
  }

  const topApps = Array.from(appUsage.entries())
    .map(([name, data]) => ({
      name,
      hours: Math.round((data.duration / 3600) * 10) / 10,
      category: data.category
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  const suspiciousCount = activities.filter(a => a.isSuspicious).length;

  const warnings: string[] = [];
  if (idleMinutes > 120) warnings.push('High idle time detected');
  if (suspiciousCount > 3) warnings.push('Multiple suspicious patterns detected');
  if (productivityPercentage < 50) warnings.push('Low productivity score');

  return {
    employeeId,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    productiveHours: Math.round((productiveMinutes / 60) * 10) / 10,
    idleHours: Math.round((idleMinutes / 60) * 10) / 10,
    unproductiveHours: Math.round((unproductiveMinutes / 60) * 10) / 10,
    productivityScore: productivityPercentage,
    suspiciousActivities: suspiciousCount,
    topApps,
    warnings
  };
}
