// Server-side classifier fixer.
//
// The desktop tracker classifies each activity at capture time using the
// rules in shared/src/classification.ts. That classifier is good but it
// has gaps for:
//
//   * macOS system processes that should never be tracked at all
//     (UserNotificationCenter, controlcenter, dock, etc.)
//   * Common Mac apps the rules just don't list (Messages, Preview,
//     Notes, Reminders, FaceTime, etc.)
//   * Browser tabs whose titles mention common SaaS work tools the
//     classifier doesn't yet recognize (Google Drive, Notion, Linear,
//     ArchTrack itself, claude.ai, etc.)
//
// Catching all of those gaps requires either rebuilding every employee's
// desktop tracker (high friction) OR doing one more classification pass
// on the server before INSERTing into the activities table. This file
// is that second pass.
//
// The output is one of:
//   * null  → drop the activity entirely (system noise)
//   * an object with possibly-overridden { category, categoryName,
//     productivityScore, productivityLevel } that the caller should
//     write instead of the original.
//
// Existing role-based reclassification + admin overrides still run AFTER
// this in the activity ingestion path, so this is purely additive.

export interface ClassifierFixerInput {
  appName: string;
  windowTitle: string;
  category: string;
  categoryName: string;
  productivityScore: number;
  productivityLevel: string;
}

export interface ClassifierFixerOutput {
  category: string;
  categoryName: string;
  productivityScore: number;
  productivityLevel: 'productive' | 'unproductive' | 'neutral' | 'idle';
}

// Names that are macOS system processes / chrome under the hood. Drop these
// at ingestion so they don't pollute totals or category breakdowns.
const SYSTEM_PROCESS_PATTERNS = [
  'usernotificationcenter',
  'notification center',
  'notificationcenter',
  'controlcenter',
  'control center',
  'dock',
  'window server',
  'windowserver',
  'loginwindow',
  'login window',
  'screensaver',
  'screen saver',
  'lockscreen',
  'lock screen',
  'wallpaper agent',
  'spotlight',
  'spotlightnetshelper',
  'siri',
  'finder' // optional — most users don't want Finder time tracked as productive
];

// Bare app names that ArchTrack should consider productive Core Work even
// when the desktop classifier left them as "other". Keys are lower-cased
// app-name substrings.
const CORE_WORK_APPS: string[] = [
  'preview',           // macOS PDF viewer — basically always work usage
  'pages',             // Apple Pages
  'numbers',           // Apple Numbers
  'keynote',           // Apple Keynote
  'textedit',          // basic text editor
  'notes',             // Apple Notes
  'reminders',         // Apple Reminders
  'calendar',          // Apple/Google Calendar app
  'iterm',             // terminal
  'iterm2',
  'warp',              // Warp terminal
  'tableplus',         // DB GUI
  'postman',
  'insomnia',
  'cursor',            // already in shared but be safe
  'xcode'              // already in shared but be safe
];

const COMMUNICATION_APPS: string[] = [
  'messages',          // Apple iMessage app
  'imessage',
  'facetime',
  'mail',              // Apple Mail (already in shared but be safe)
  'spark',             // Spark email
  'superhuman'
];

const RESEARCH_APPS: string[] = [
  'safari reader',
  'reeder',            // RSS reader
  'instapaper',
  'pocket'
];

// Browser window-title substrings that flag work-related browsing. The
// desktop tracker has its own list, but this server-side pass adds the
// common SaaS / company-specific patterns we kept seeing in the wild.
const BROWSER_WORK_INDICATORS: string[] = [
  // ArchTrack / Genesis itself
  'archtrack',
  'genesis design',
  'genesis design studios',
  // Claude / AI
  'claude.ai',
  'claude opus',
  'chat.openai',
  'chatgpt',
  'gemini.google',
  'perplexity',
  // Google Workspace
  'google drive',
  'drive.google',
  'docs.google',
  'sheets.google',
  'slides.google',
  'meet.google',
  'mail.google',
  'calendar.google',
  // Project / collab SaaS
  'notion.so',
  'linear.app',
  'linear.com',
  'asana.com',
  'monday.com',
  'trello.com',
  'jira',
  'confluence',
  'clickup.com',
  'airtable',
  'basecamp',
  // Design / whiteboard
  'figma.com',
  'figma -',
  'canva.com',
  'miro.com',
  'lucidchart',
  'lucid.app',
  'whimsical',
  'framer.com',
  // Dev / version control
  'github.com',
  'gitlab.com',
  'bitbucket',
  'stackoverflow',
  'mdn web docs',
  'developer.mozilla',
  'devdocs',
  'sentry.io',
  'datadog',
  'logtail',
  'pagerduty',
  // Cloud / infra dashboards
  'cloud.digitalocean',
  'console.aws',
  'console.cloud.google',
  'portal.azure',
  'vercel.com',
  'render.com',
  'fly.io',
  'railway.app',
  'supabase',
  'firebase',
  'planetscale',
  'neon.tech',
  'upstash',
  // Website builders + hosting + DNS + domains (very common for SMB owners
  // building their own site, like the user's uncle is doing for Overflow
  // Plumbing on Wix)
  'wix.com',
  'wix studio',
  'wixstudio',
  'wix-platform',
  'editor.wix',
  'editorx.com',
  'squarespace',
  'webflow',
  'shopify',
  'wordpress',
  'wp-admin',
  'cpanel',
  'plesk',
  'namecheap',
  'godaddy',
  'name.com',
  'porkbun',
  'cloudflare',
  'advanced dns',
  'dns records',
  'whois',
  // E-commerce / payments / accounting / CRM
  'stripe.com',
  'dashboard.stripe',
  'paypal',
  'square',
  'quickbooks',
  'freshbooks',
  'xero',
  'wave',
  'hubspot',
  'salesforce',
  'pipedrive',
  // Communication / video / scheduling SaaS
  'calendly',
  'cal.com',
  'loom.com',
  'zoom.us',
  'meet.zoom',
  // Email / marketing
  'mailchimp',
  'klaviyo',
  'sendgrid',
  'resend.com',
  'postmarkapp',
  // ArchTrack-tracker-specific things we see in dev
  'wix mcp',
  'velo docs',
  'oauth',
  'authorize',
  'authorization'
];

const BROWSER_PROCESS_NAMES = [
  'chrome', 'google chrome', 'safari', 'firefox', 'edge',
  'brave', 'opera', 'arc', 'vivaldi'
];

function isSystemProcess(appName: string): boolean {
  const lower = (appName || '').toLowerCase();
  return SYSTEM_PROCESS_PATTERNS.some(p => lower === p || lower.includes(p));
}

function matchesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some(n => lower.includes(n));
}

const CATEGORY_NAMES: Record<string, string> = {
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

const PRODUCTIVITY_SCORES: Record<string, number> = {
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

const PRODUCTIVITY_LEVELS: Record<string, 'productive' | 'unproductive' | 'neutral' | 'idle'> = {
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

function reclassifyTo(category: string): ClassifierFixerOutput {
  return {
    category,
    categoryName: CATEGORY_NAMES[category] || category,
    productivityScore: PRODUCTIVITY_SCORES[category] ?? 30,
    productivityLevel: PRODUCTIVITY_LEVELS[category] || 'neutral'
  };
}

/**
 * Run the server-side classifier-fixer over an incoming activity. Returns
 * null when the activity should be dropped entirely (system noise).
 */
export function fixActivityClassification(input: ClassifierFixerInput): ClassifierFixerOutput | null {
  const appName = input.appName || '';
  const windowTitle = input.windowTitle || '';
  const lowerApp = appName.toLowerCase();

  // 1. Drop system noise.
  if (isSystemProcess(appName)) return null;

  // 2a. RESCUE PATH for desktop-tracker false positives:
  //     The shared classifier in shared/src/classification.ts used to have
  //     `x.com` in the social_media pattern list, which substring-matched
  //     `wix.com`, `six.com`, etc. Every Wix admin page therefore got
  //     tagged as social media. Trackers built before that fix is shipped
  //     locally will keep sending these mislabels. Catch them here and
  //     reclassify by checking for any work indicator in the title.
  if (input.category === 'social_media' && BROWSER_PROCESS_NAMES.some(b => lowerApp.includes(b))) {
    if (matchesAny(windowTitle, BROWSER_WORK_INDICATORS)) {
      return reclassifyTo('core_work');
    }
    // Also: if the title has 'wix' anywhere it's basically always work for
    // a small business owner (the only social_media false-positive case
    // we've actually seen). Cheap targeted check.
    if (windowTitle.toLowerCase().includes('wix')) {
      return reclassifyTo('core_work');
    }
  }

  // 2b. If the desktop tracker already labelled it as something other than
  //     "other" or false-positive social_media, trust that label.
  if (input.category && input.category !== 'other') {
    return {
      category: input.category,
      categoryName: input.categoryName,
      productivityScore: input.productivityScore,
      productivityLevel: (input.productivityLevel as ClassifierFixerOutput['productivityLevel']) || 'neutral'
    };
  }

  // 3. Bare-name lookups for common Mac apps the shared classifier missed.
  if (matchesAny(lowerApp, COMMUNICATION_APPS)) return reclassifyTo('communication');
  if (matchesAny(lowerApp, CORE_WORK_APPS)) return reclassifyTo('core_work');
  if (matchesAny(lowerApp, RESEARCH_APPS)) return reclassifyTo('research_learning');

  // 4. Browser tabs: look at the window title for work indicators.
  if (BROWSER_PROCESS_NAMES.some(b => lowerApp.includes(b))) {
    if (matchesAny(windowTitle, BROWSER_WORK_INDICATORS)) {
      return reclassifyTo('core_work');
    }
  }

  // 5. Otherwise leave the category alone.
  return {
    category: input.category || 'other',
    categoryName: input.categoryName || 'Other',
    productivityScore: input.productivityScore ?? 30,
    productivityLevel: (input.productivityLevel as ClassifierFixerOutput['productivityLevel']) || 'neutral'
  };
}
