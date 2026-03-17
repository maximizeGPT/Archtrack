import { getDatabase } from './database.js';
import type { Activity } from '../shared-types.js';

export interface RepetitivePattern {
  id: string;
  employeeId: string;
  patternType: 'app_sequence' | 'copy_paste' | 'data_entry' | 'report_generation';
  description: string;
  frequency: number; // times per day
  avgDurationMinutes: number;
  totalTimeHours: number;
  agentifiabilityScore: number; // 0-100
  automationPotential: 'high' | 'medium' | 'low';
  suggestedSolution: string;
  detectedAt: string;
}

export interface AgentOpportunity {
  taskName: string;
  frequency: string;
  timeCostPerWeek: number;
  complexity: 'simple' | 'medium' | 'complex';
  roiScore: number; // estimated hours saved per month
  implementationEffort: 'hours' | 'days' | 'weeks';
  recommendedApproach: string;
}

interface DbActivity {
  id: string;
  employee_id: string;
  timestamp: string;
  app_name: string;
  window_title: string;
  category: string;
  category_name: string;
  productivity_score: number;
  productivity_level: string;
  is_suspicious: number;
  suspicious_reason?: string;
  is_idle: number;
  idle_time_seconds: number;
  duration_seconds: number;
  created_at: string;
}

/**
 * Detect repetitive patterns in employee activity data
 */
export async function detectRepetitivePatterns(
  employeeId?: string,
  daysBack: number = 7
): Promise<RepetitivePattern[]> {
  const db = getDatabase();
  const patterns: RepetitivePattern[] = [];

  // Get activities for analysis
  const query = employeeId
    ? `SELECT * FROM activities 
       WHERE employee_id = ? 
       AND timestamp > datetime('now', '-${daysBack} days')
       ORDER BY timestamp ASC`
    : `SELECT * FROM activities 
       WHERE timestamp > datetime('now', '-${daysBack} days')
       ORDER BY employee_id, timestamp ASC`;

  const params = employeeId ? [employeeId] : [];
  const activities = await db.all<DbActivity[]>(query, params);

  // Pattern 1: Same app sequence repeated
  const appSequences = detectAppSequences(activities);
  patterns.push(...appSequences);

  // Pattern 2: Long duration in data entry apps
  const dataEntryPatterns = detectDataEntryPatterns(activities);
  patterns.push(...dataEntryPatterns);

  // Pattern 3: Report generation workflows
  const reportPatterns = detectReportPatterns(activities);
  patterns.push(...reportPatterns);

  return patterns.sort((a, b) => b.agentifiabilityScore - a.agentifiabilityScore);
}

// Apps to ignore in pattern detection (system apps, not user workflows)
const IGNORED_APPS = ['loginwindow', 'WindowServer', 'kernel', 'launchd', 'Dock', 'Finder'];

/**
 * Check if an app should be ignored in pattern detection
 */
function isIgnoredApp(appName: string): boolean {
  return IGNORED_APPS.some(ignored => appName.toLowerCase().includes(ignored.toLowerCase()));
}

/**
 * Detect repeated app sequences (e.g., Excel → Email → Excel)
 */
function detectAppSequences(activities: DbActivity[]): RepetitivePattern[] {
  const patterns: RepetitivePattern[] = [];
  const sequences: Map<string, { count: number; totalTime: number }> = new Map();

  // Group by employee
  const byEmployee = groupBy(activities, 'employee_id');

  for (const [employeeId, acts] of byEmployee) {
    // Filter out ignored apps and very short activities (< 5 seconds)
    const filteredActs = acts.filter(a => 
      !isIgnoredApp(a.app_name) && 
      a.duration_seconds > 5
    );

    // Look for 3-app sequences that repeat
    for (let i = 0; i < filteredActs.length - 3; i++) {
      const app1 = filteredActs[i].app_name;
      const app2 = filteredActs[i + 1].app_name;
      const app3 = filteredActs[i + 2].app_name;

      // Skip sequences where all apps are the same
      if (app1 === app2 && app2 === app3) continue;

      // Skip sequences with duplicate consecutive apps (e.g., Chrome → Chrome → Safari)
      if (app1 === app2 || app2 === app3) continue;

      const seq = `${app1}→${app2}→${app3}`;
      const key = `${employeeId}:${seq}`;
      
      const existing = sequences.get(key) || { count: 0, totalTime: 0 };
      existing.count++;
      existing.totalTime += (acts[i].duration_seconds || 0) / 60;
      sequences.set(key, existing);
    }
  }

  // Convert sequences that appear 3+ times to patterns
  for (const [key, data] of sequences) {
    if (data.count >= 3) {
      const [employeeId, sequence] = key.split(':');
      const apps = sequence.split('→');
      
      // Score based on frequency and time
      const frequency = Math.round(data.count / 7); // per day
      const avgDuration = data.totalTime / data.count;
      const agentifiabilityScore = calculateSequenceScore(apps, frequency, avgDuration);

      patterns.push({
        id: `seq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        employeeId,
        patternType: 'app_sequence',
        description: `Repeated workflow: ${apps.join(' → ')}`,
        frequency,
        avgDurationMinutes: Math.round(avgDuration),
        totalTimeHours: Math.round((data.totalTime / 60) * 10) / 10,
        agentifiabilityScore,
        automationPotential: agentifiabilityScore > 70 ? 'high' : agentifiabilityScore > 40 ? 'medium' : 'low',
        suggestedSolution: generateSequenceSolution(apps),
        detectedAt: new Date().toISOString()
      });
    }
  }

  return patterns;
}

/**
 * Detect data entry patterns (long periods in spreadsheets, forms, etc.)
 */
function detectDataEntryPatterns(activities: DbActivity[]): RepetitivePattern[] {
  const dataEntryApps = ['Excel', 'Google Sheets', 'Numbers', 'Airtable', 'Notion', 'Microsoft Access'];
  const patterns: RepetitivePattern[] = [];

  const byEmployee = groupBy(activities, 'employee_id');

  for (const [employeeId, acts] of byEmployee) {
    const dataEntryActs = acts.filter(a => 
      dataEntryApps.some(app => a.app_name.toLowerCase().includes(app.toLowerCase()))
    );

    if (dataEntryActs.length === 0) continue;

    const totalTime = dataEntryActs.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) / 3600;
    const frequency = Math.round(dataEntryActs.length / 7);
    const avgDuration = totalTime / dataEntryActs.length * 60; // minutes per session

    if (totalTime > 5) { // More than 5 hours per week
      const agentifiabilityScore = Math.min(90, 50 + (frequency * 5) + (totalTime * 2));

      patterns.push({
        id: `data-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        employeeId,
        patternType: 'data_entry',
        description: `Data entry work in spreadsheets (${Math.round(totalTime)}h/week)`,
        frequency,
        avgDurationMinutes: Math.round(avgDuration),
        totalTimeHours: Math.round(totalTime * 10) / 10,
        agentifiabilityScore,
        automationPotential: agentifiabilityScore > 70 ? 'high' : 'medium',
        suggestedSolution: 'Consider automated data import from source systems or AI-powered data extraction',
        detectedAt: new Date().toISOString()
      });
    }
  }

  return patterns;
}

/**
 * Detect report generation patterns
 */
function detectReportPatterns(activities: DbActivity[]): RepetitivePattern[] {
  const reportIndicators = ['report', 'summary', 'analysis', 'dashboard', 'export', 'pdf'];
  const patterns: RepetitivePattern[] = [];

  const byEmployee = groupBy(activities, 'employee_id');

  for (const [employeeId, acts] of byEmployee) {
    const reportActs = acts.filter(a => 
      reportIndicators.some(indicator => 
        a.window_title.toLowerCase().includes(indicator.toLowerCase())
      )
    );

    if (reportActs.length < 3) continue;

    const totalTime = reportActs.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) / 3600;
    const frequency = Math.round(reportActs.length / 7);

    if (totalTime > 2) {
      patterns.push({
        id: `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        employeeId,
        patternType: 'report_generation',
        description: `Report creation and analysis work`,
        frequency,
        avgDurationMinutes: Math.round((totalTime / reportActs.length) * 60),
        totalTimeHours: Math.round(totalTime * 10) / 10,
        agentifiabilityScore: 75, // Reports are highly automatable
        automationPotential: 'high',
        suggestedSolution: 'Automated report generation with scheduled delivery',
        detectedAt: new Date().toISOString()
      });
    }
  }

  return patterns;
}

/**
 * Calculate agentifiability score for app sequences
 */
function calculateSequenceScore(apps: string[], frequency: number, avgDuration: number): number {
  let score = 30; // Base score
  
  // Higher frequency = more automatable
  score += Math.min(30, frequency * 3);
  
  // Longer sessions = more time saved
  score += Math.min(20, avgDuration / 5);
  
  // Bonus for common automation targets
  const automationTargets = ['Excel', 'Email', 'Slack', 'Chrome', 'Safari'];
  const hasTarget = apps.some(app => 
    automationTargets.some(target => app.toLowerCase().includes(target.toLowerCase()))
  );
  if (hasTarget) score += 20;
  
  return Math.min(100, Math.round(score));
}

/**
 * Generate solution suggestion for app sequences
 */
function generateSequenceSolution(apps: string[]): string {
  if (apps.some(a => a.toLowerCase().includes('excel')) && apps.some(a => a.toLowerCase().includes('email'))) {
    return 'Automated email reports with Excel attachments using scheduled scripts';
  }
  if (apps.some(a => a.toLowerCase().includes('chrome')) || apps.some(a => a.toLowerCase().includes('safari'))) {
    return 'Browser automation for data collection and form submission';
  }
  return 'Workflow automation to connect these apps and reduce manual switching';
}

/**
 * Group array by key
 */
function groupBy<T>(array: T[], key: keyof T): Map<string, T[]> {
  return array.reduce((map, item) => {
    const value = String(item[key]);
    const existing = map.get(value) || [];
    existing.push(item);
    map.set(value, existing);
    return map;
  }, new Map<string, T[]>());
}

/**
 * Get top agent opportunities across all employees
 */
export async function getTopAgentOpportunities(limit: number = 5): Promise<AgentOpportunity[]> {
  const patterns = await detectRepetitivePatterns(undefined, 14); // 2 weeks of data
  
  return patterns
    .filter(p => p.automationPotential === 'high')
    .slice(0, limit)
    .map(p => ({
      taskName: p.description,
      frequency: `${p.frequency}x per day`,
      timeCostPerWeek: Math.round(p.totalTimeHours * 10) / 10,
      complexity: p.patternType === 'data_entry' ? 'simple' : p.patternType === 'app_sequence' ? 'medium' : 'complex',
      roiScore: Math.round(p.totalTimeHours * 4), // Hours saved per month
      implementationEffort: p.agentifiabilityScore > 80 ? 'hours' : p.agentifiabilityScore > 60 ? 'days' : 'weeks',
      recommendedApproach: p.suggestedSolution
    }));
}
