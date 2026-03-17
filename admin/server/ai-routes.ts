import { Router } from 'express';
import { getDatabase } from '../database.js';
import { detectRepetitivePatterns, getTopAgentOpportunities } from '../ai-analytics.js';

const router = Router();

interface ChatRequest {
  question: string;
}

interface ChatResponse {
  answer: string;
  sql?: string;
  data?: any[];
  suggestions?: string[];
}

/**
 * Natural language query endpoint for AI chat
 */
router.post('/chat', async (req, res) => {
  try {
    const { question }: ChatRequest = req.body;
    
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

/**
 * Get repetitive patterns and automation opportunities
 */
router.get('/patterns', async (req, res) => {
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

/**
 * Get top agent opportunities
 */
router.get('/opportunities', async (req, res) => {
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

/**
 * Extract employee name from question
 */
async function extractEmployeeName(question: string, db: any): Promise<{ id: string; name: string } | null> {
  const employees = await db.all('SELECT id, name FROM employees');
  // Sort by longest name first to avoid partial matches
  const sorted = employees.sort((a: any, b: any) => b.name.length - a.name.length);
  return sorted.find((e: any) => question.toLowerCase().includes(e.name.toLowerCase())) || null;
}

/**
 * Extract timeframe from question
 */
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

/**
 * Process natural language queries and convert to data analysis
 */
async function processNaturalLanguageQuery(question: string): Promise<ChatResponse> {
  const lowerQuestion = question.toLowerCase();
  const db = getDatabase();

  // Pattern 0: Personal improvement/advice queries (highest priority)
  if (lowerQuestion.includes('do better') || lowerQuestion.includes('improve') || lowerQuestion.includes('help') || lowerQuestion.includes('advice')) {
    return handleImprovementQuery(lowerQuestion, db);
  }

  // Pattern 0.5: Architecture firm owner specific queries
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

  // Pattern 1: Specific app queries (YouTube, email, etc.)
  if (lowerQuestion.includes('youtube') || lowerQuestion.includes('email') || lowerQuestion.includes('slack') || lowerQuestion.includes('chrome')) {
    return handleSpecificAppQuery(lowerQuestion, db);
  }

  // Pattern 2: "How is [name] doing" - status check
  if ((lowerQuestion.includes('how is') || lowerQuestion.includes('how\'s')) && lowerQuestion.includes('doing')) {
    return handleStatusQuery(lowerQuestion, db);
  }

  // Pattern 3: Time spent queries
  if (lowerQuestion.includes('time') && (lowerQuestion.includes('spend') || lowerQuestion.includes('spent'))) {
    return handleTimeSpentQuery(lowerQuestion, db);
  }

  // Pattern 4: Productivity queries
  if (lowerQuestion.includes('productive') || lowerQuestion.includes('productivity')) {
    return handleProductivityQuery(lowerQuestion, db);
  }

  // Pattern 5: Repetitive tasks / automation
  if (lowerQuestion.includes('repetitive') || lowerQuestion.includes('automation') || lowerQuestion.includes('automate')) {
    return handleRepetitiveTasksQuery(db);
  }

  // Pattern 6: Employee-specific queries
  if (lowerQuestion.includes('employee') || lowerQuestion.includes('who')) {
    return handleEmployeeQuery(lowerQuestion, db);
  }

  // Pattern 7: App/website queries
  if (lowerQuestion.includes('app') || lowerQuestion.includes('website')) {
    return handleAppQuery(lowerQuestion, db);
  }

  // Default: General summary
  return handleGeneralQuery(db);
}

async function handleImprovementQuery(question: string, db: any): Promise<ChatResponse> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  if (!employee) {
    return {
      answer: "I'd be happy to help! To give personalized improvement suggestions, could you tell me which employee you'd like advice for? For example: 'What can Mohammed do better?'",
      suggestions: ['What can Mohammed do better?', 'How to improve productivity?', 'Time management tips']
    };
  }

  // Get detailed stats for this employee
  const statsSql = `
    SELECT 
      AVG(productivity_score) as avg_score,
      SUM(CASE WHEN productivity_level = 'productive' THEN duration_seconds ELSE 0 END) / 3600 as productive_hours,
      SUM(CASE WHEN productivity_level = 'unproductive' THEN duration_seconds ELSE 0 END) / 3600 as unproductive_hours,
      SUM(CASE WHEN productivity_level = 'idle' THEN duration_seconds ELSE 0 END) / 3600 as idle_hours,
      SUM(duration_seconds) / 3600 as total_hours,
      COUNT(DISTINCT CASE WHEN is_suspicious = 1 THEN id END) as suspicious_count,
      COUNT(*) as total_activities
    FROM activities
    WHERE employee_id = ?
    AND timestamp > datetime('now', '-${timeframe.days} days')
  `;

  const stats = await db.get(statsSql, [employee.id]);

  // Get top unproductive apps
  const appsSql = `
    SELECT 
      app_name,
      SUM(duration_seconds) / 3600 as hours,
      AVG(productivity_score) as avg_score
    FROM activities
    WHERE employee_id = ?
    AND timestamp > datetime('now', '-${timeframe.days} days')
    AND (productivity_level = 'unproductive' OR productivity_level = 'idle')
    GROUP BY app_name
    ORDER BY hours DESC
    LIMIT 5
  `;

  const unproductiveApps = await db.all(appsSql, [employee.id]);

  // Get category breakdown
  const categorySql = `
    SELECT 
      category_name,
      SUM(duration_seconds) / 3600 as hours,
      AVG(productivity_score) as avg_score
    FROM activities
    WHERE employee_id = ?
    AND timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY category_name
    ORDER BY hours DESC
  `;

  const categories = await db.all(categorySql, [employee.id]);

  // Build personalized advice
  let answer = `**${employee.name}'s Productivity Analysis (${timeframe.label})**\n\n`;
  
  const productivePct = stats.total_hours > 0 ? Math.round((stats.productive_hours / stats.total_hours) * 100) : 0;
  const unproductivePct = stats.total_hours > 0 ? Math.round((stats.unproductive_hours / stats.total_hours) * 100) : 0;
  const idlePct = stats.total_hours > 0 ? Math.round((stats.idle_hours / stats.total_hours) * 100) : 0;

  answer += `**Current Stats:**\n`;
  answer += `• Productivity Score: ${Math.round(stats.avg_score)}%\n`;
  answer += `• Productive Time: ${productivePct}% (${Math.round(stats.productive_hours * 10) / 10}h)\n`;
  answer += `• Unproductive Time: ${unproductivePct}% (${Math.round(stats.unproductive_hours * 10) / 10}h)\n`;
  answer += `• Idle Time: ${idlePct}% (${Math.round(stats.idle_hours * 10) / 10}h)\n\n`;

  // Generate recommendations
  const recommendations: string[] = [];

  if (stats.avg_score < 50) {
    recommendations.push('**Focus Improvement Needed:** Try using website blockers during work hours to reduce distractions');
  }

  if (idlePct > 30) {
    recommendations.push('**High Idle Time:** Consider taking structured breaks (Pomodoro technique) instead of sporadic idle time');
  }

  if (unproductiveApps.length > 0) {
    const topTimeWaster = unproductiveApps[0];
    recommendations.push(`**Top Time Waster:** ${topTimeWaster.app_name} (${Math.round(topTimeWaster.hours * 10) / 10}h). Try limiting this to specific times of day`);
  }

  if (stats.suspicious_count > 10) {
    recommendations.push('**Activity Patterns:** High number of flagged activities. Review if these are work-related or need addressing');
  }

  // Add positive reinforcement
  if (stats.avg_score > 70) {
    recommendations.unshift('**Great work!** Productivity score is above average. Keep it up! 🎉');
  } else if (productivePct > 60) {
    recommendations.unshift('**Good progress!** More than half the time is productive. Small tweaks can help optimize further');
  }

  if (recommendations.length === 0) {
    recommendations.push('**Tracking Well:** Data shows balanced activity. Continue monitoring for patterns');
  }

  answer += `**Recommendations:**\n` + recommendations.join('\n\n');

  return {
    answer,
    suggestions: ['Show time breakdown', 'What apps are used most?', 'Compare to team average']
  };
}

async function handleStatusQuery(question: string, db: any): Promise<ChatResponse> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  if (!employee) {
    return handleGeneralQuery(db);
  }

  // Get today's specific data
  const todaySql = `
    SELECT 
      AVG(productivity_score) as avg_score,
      SUM(CASE WHEN productivity_level = 'productive' THEN duration_seconds ELSE 0 END) / 3600 as productive_hours,
      SUM(duration_seconds) / 3600 as total_hours,
      COUNT(*) as activities,
      MAX(timestamp) as last_activity
    FROM activities
    WHERE employee_id = ?
    AND timestamp > datetime('now', '-${timeframe.days} days')
  `;

  const today = await db.get(todaySql, [employee.id]);

  // Get current activity
  const currentSql = `
    SELECT app_name, window_title, category_name, productivity_score
    FROM activities
    WHERE employee_id = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const current = await db.get(currentSql, [employee.id]);

  // Get comparison to their average
  const avgSql = `
    SELECT AVG(productivity_score) as overall_avg
    FROM activities
    WHERE employee_id = ?
    AND timestamp > datetime('now', '-30 days')
  `;

  const overall = await db.get(avgSql, [employee.id]);

  let answer = `**${employee.name}'s Status (${timeframe.label})**\n\n`;

  if (today.total_hours === 0) {
    answer += `📭 **No activity recorded** for ${timeframe.label}.\n\n`;
    answer += `The desktop tracker may not be running. Ask them to start the ArchTrack tracker app.`;
  } else {
    const productivePct = today.total_hours > 0 ? Math.round((today.productive_hours / today.total_hours) * 100) : 0;
    const vsAverage = today.avg_score - overall.overall_avg;
    const trend = vsAverage > 5 ? '📈 Above' : vsAverage < -5 ? '📉 Below' : '➡️ On par with';

    answer += `**Today's Performance:**\n`;
    answer += `• Productivity Score: ${Math.round(today.avg_score)}%\n`;
    answer += `• Productive Time: ${productivePct}% (${Math.round(today.productive_hours * 10) / 10}h of ${Math.round(today.total_hours * 10) / 10}h total)\n`;
    answer += `• Activities Tracked: ${today.activities}\n`;
    answer += `• ${trend} their 30-day average (${Math.round(overall.overall_avg)}%)\n\n`;

    if (current) {
      const statusEmoji = current.productivity_score > 70 ? '🟢' : current.productivity_score > 40 ? '🟡' : '🔴';
      answer += `**Currently:** ${statusEmoji} ${current.app_name} - ${current.window_title.substring(0, 50)}${current.window_title.length > 50 ? '...' : ''}`;
    }
  }

  return {
    answer,
    suggestions: ['What can they improve?', 'Show weekly trend', 'Compare to team']
  };
}

async function handleSpecificAppQuery(question: string, db: any): Promise<ChatResponse> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  // Detect which app
  let appName = '';
  let appDisplay = '';
  
  if (question.includes('youtube')) {
    appName = 'YouTube';
    appDisplay = 'YouTube';
  } else if (question.includes('email') || question.includes('gmail') || question.includes('outlook')) {
    appName = 'Mail';
    appDisplay = 'email';
  } else if (question.includes('slack')) {
    appName = 'Slack';
    appDisplay = 'Slack';
  } else if (question.includes('chrome') || question.includes('safari') || question.includes('browser')) {
    appName = 'Chrome';
    appDisplay = 'browser';
  }

  let sql: string;
  let params: any[];

  if (employee) {
    sql = `
      SELECT 
        app_name,
        SUM(duration_seconds) / 3600 as hours,
        COUNT(*) as sessions,
        AVG(productivity_score) as avg_score,
        window_title
      FROM activities
      WHERE employee_id = ?
      AND (LOWER(app_name) LIKE LOWER(?))
      AND timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY app_name
      ORDER BY hours DESC
    `;
    params = [employee.id, `%${appName}%`];
  } else {
    sql = `
      SELECT 
        e.name as employee_name,
        a.app_name,
        SUM(a.duration_seconds) / 3600 as hours,
        COUNT(*) as sessions,
        AVG(a.productivity_score) as avg_score
      FROM activities a
      JOIN employees e ON a.employee_id = e.id
      WHERE LOWER(a.app_name) LIKE LOWER(?)
      AND a.timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY a.employee_id, a.app_name
      ORDER BY hours DESC
    `;
    params = [`%${appName}%`];
  }

  const data = await db.all(sql, params);

  if (data.length === 0) {
    return {
      answer: `No ${appDisplay} activity found${employee ? ` for ${employee.name}` : ''} ${timeframe.label}.`,
      suggestions: ['Show all apps used', 'What are they doing instead?', 'Weekly summary']
    };
  }

  let answer = '';
  
  if (employee) {
    const totalHours = data.reduce((sum: number, row: any) => sum + row.hours, 0);
    const avgScore = data.reduce((sum: number, row: any) => sum + row.avg_score, 0) / data.length;
    
    answer = `**${employee.name}'s ${appDisplay} Usage (${timeframe.label})**\n\n`;
    answer += `• Total Time: ${Math.round(totalHours * 10) / 10} hours\n`;
    answer += `• Sessions: ${data.reduce((sum: number, row: any) => sum + row.sessions, 0)}\n`;
    answer += `• Avg Productivity Score: ${Math.round(avgScore)}%\n\n`;
    
    if (appName === 'YouTube' && totalHours > 2) {
      answer += `⚠️ **High YouTube usage detected.** Consider setting time limits or using website blockers during focus hours.`;
    } else if (appName === 'Mail' || appName === 'Slack') {
      answer += `💡 **Communication apps** are essential, but batch-checking emails/messages 2-3 times per day can improve focus.`;
    }
  } else {
    answer = `**${appDisplay} Usage by Employee (${timeframe.label})**\n\n`;
    data.forEach((row: any, idx: number) => {
      answer += `${idx + 1}. **${row.employee_name}**: ${Math.round(row.hours * 10) / 10}h (${row.sessions} sessions, ${Math.round(row.avg_score)}% productive)\n`;
    });
  }

  return {
    answer,
    suggestions: ['Compare to last week', 'What else are they using?', 'Productivity tips']
  };
}

async function handleTimeSpentQuery(question: string, db: any): Promise<ChatResponse> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  let sql: string;
  let params: any[];

  if (employee) {
    sql = `
      SELECT 
        app_name,
        SUM(duration_seconds) / 3600 as hours,
        COUNT(*) as sessions
      FROM activities
      WHERE employee_id = ?
      AND timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY app_name
      ORDER BY hours DESC
      LIMIT 10
    `;
    params = [employee.id];
  } else {
    sql = `
      SELECT 
        e.name as employee_name,
        SUM(a.duration_seconds) / 3600 as hours
      FROM activities a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY a.employee_id
      ORDER BY hours DESC
    `;
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

  return {
    answer,
    sql,
    data,
    suggestions: ['Show productivity scores', 'What apps were used most?', 'Any suspicious activity?']
  };
}

async function handleProductivityQuery(question: string, db: any): Promise<ChatResponse> {
  const timeframe = extractTimeframe(question);

  const sql = `
    SELECT 
      e.name as employee_name,
      AVG(a.productivity_score) as avg_score,
      SUM(CASE WHEN a.productivity_level = 'productive' THEN a.duration_seconds ELSE 0 END) / 3600 as productive_hours,
      SUM(a.duration_seconds) / 3600 as total_hours
    FROM activities a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY a.employee_id
    ORDER BY avg_score DESC
  `;

  const data = await db.all(sql);

  const answer = `Productivity rankings ${timeframe.label}:\n\n` +
    data.map((row: any, idx: number) => {
      const percentage = row.total_hours > 0 ? Math.round((row.productive_hours / row.total_hours) * 100) : 0;
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
      return `${medal} ${row.employee_name}: ${Math.round(row.avg_score)}% score, ${percentage}% productive time`;
    }).join('\n');

  return {
    answer,
    sql,
    data,
    suggestions: ['Who was least productive?', 'Show time wasters', 'Repetitive task opportunities']
  };
}

async function handleRepetitiveTasksQuery(db: any): Promise<ChatResponse> {
  const patterns = await detectRepetitivePatterns(undefined, 14);
  
  // Filter out nonsense patterns
  const validPatterns = patterns.filter(p => {
    // Skip patterns with very low time cost or obviously wrong sequences
    if (p.totalTimeHours < 0.5) return false;
    // Skip patterns that are just the same app repeated
    if (p.description.includes('→') && p.description.split('→').every(app => app.trim() === p.description.split('→')[0].trim())) return false;
    return true;
  });
  
  if (validPatterns.length === 0) {
    return {
      answer: "I haven't detected any clear repetitive patterns yet. I need at least a few days of data to identify automation opportunities. Check back after your team has been using the tracker for a while.",
      suggestions: ['Show productivity summary', 'What apps are used most?', 'Employee time breakdown']
    };
  }

  const topPatterns = validPatterns.slice(0, 5);
  
  let answer = `**${validPatterns.length} Automation Opportunities Found**\n\n`;
  
  topPatterns.forEach((pattern, idx) => {
    const emoji = pattern.automationPotential === 'high' ? '🔥' : pattern.automationPotential === 'medium' ? '⚡' : '💡';
    answer += `${idx + 1}. ${emoji} **${pattern.description}**\n`;
    answer += `   • Time cost: **${pattern.totalTimeHours} hours/week**\n`;
    answer += `   • Frequency: ${pattern.frequency}x per day\n`;
    answer += `   • Potential: ${pattern.automationPotential.toUpperCase()}\n`;
    answer += `   • 💡 ${pattern.suggestedSolution}\n\n`;
  });

  const totalHours = topPatterns.reduce((sum, p) => sum + p.totalTimeHours, 0);
  answer += `**💰 Total potential savings: ${Math.round(totalHours * 4)} hours/month**`;

  return {
    answer,
    data: topPatterns,
    suggestions: ['Show all patterns', 'Which tasks are easiest to automate?', 'Employee-specific opportunities']
  };
}

async function handleEmployeeQuery(question: string, db: any): Promise<ChatResponse> {
  const sql = `
    SELECT 
      e.name,
      e.department,
      COUNT(DISTINCT DATE(a.timestamp)) as days_active,
      SUM(a.duration_seconds) / 3600 as total_hours,
      AVG(a.productivity_score) as avg_productivity,
      SUM(CASE WHEN a.is_suspicious = 1 THEN 1 ELSE 0 END) as suspicious_count
    FROM employees e
    LEFT JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-7 days')
    GROUP BY e.id
    ORDER BY total_hours DESC
  `;

  const data = await db.all(sql);

  const answer = `**Employee Activity Summary (Last 7 Days)**\n\n` +
    data.map((row: any) => {
      const status = row.suspicious_count > 5 ? '⚠️' : '✅';
      const hours = Math.round(row.total_hours * 10) / 10;
      const productivity = Math.round(row.avg_productivity);
      return `${status} **${row.name}** (${row.department})\n   ${hours}h tracked • ${productivity}% productivity • ${row.suspicious_count} flags`;
    }).join('\n\n');

  return {
    answer,
    sql,
    data,
    suggestions: ['Who worked the most hours?', 'Show suspicious activity', 'Department comparison']
  };
}

async function handleAppQuery(question: string, db: any): Promise<ChatResponse> {
  const timeframe = extractTimeframe(question);

  const sql = `
    SELECT 
      app_name,
      SUM(duration_seconds) / 3600 as hours,
      COUNT(DISTINCT employee_id) as users,
      AVG(productivity_score) as avg_score
    FROM activities
    WHERE timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY app_name
    ORDER BY hours DESC
    LIMIT 10
  `;

  const data = await db.all(sql);

  const answer = `**Top 10 Apps ${timeframe.label}**\n\n` +
    data.map((row: any, idx: number) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
      const scoreEmoji = row.avg_score > 70 ? '🟢' : row.avg_score > 40 ? '🟡' : '🔴';
      return `${medal} **${row.app_name}**: ${Math.round(row.hours * 10) / 10}h (${row.users} users) ${scoreEmoji} ${Math.round(row.avg_score)}%`;
    }).join('\n');

  return {
    answer,
    sql,
    data,
    suggestions: ['Show distracting apps', 'Most productive apps', 'App usage trends']
  };
}

async function handleGeneralQuery(db: any): Promise<ChatResponse> {
  const sql = `
    SELECT 
      COUNT(DISTINCT employee_id) as active_employees,
      SUM(duration_seconds) / 3600 as total_hours,
      AVG(productivity_score) as avg_productivity,
      SUM(CASE WHEN is_suspicious = 1 THEN 1 ELSE 0 END) as suspicious_activities
    FROM activities
    WHERE timestamp > datetime('now', '-7 days')
  `;

  const data = await db.all(sql);
  const row = data[0];

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

  return {
    answer,
    sql,
    data,
    suggestions: ['Show repetitive tasks', 'Who is most productive?', 'Time breakdown by app']
  };
}

// ========== ARCHITECTURE FIRM OWNER QUERY HANDLERS ==========

async function handleSlackingQuery(question: string, db: any): Promise<ChatResponse> {
  const timeframe = extractTimeframe(question);
  
  const sql = `
    SELECT 
      e.name,
      e.department,
      AVG(a.productivity_score) as avg_score,
      SUM(CASE WHEN a.productivity_level = 'idle' THEN a.duration_seconds ELSE 0 END) / 3600 as idle_hours,
      SUM(CASE WHEN a.productivity_level = 'unproductive' THEN a.duration_seconds ELSE 0 END) / 3600 as unproductive_hours,
      SUM(a.duration_seconds) / 3600 as total_hours,
      COUNT(CASE WHEN a.is_idle = 1 THEN 1 END) as idle_count
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    HAVING avg_score < 40 OR idle_hours > 2
    ORDER BY avg_score ASC, idle_hours DESC
  `;

  const data = await db.all(sql);

  if (data.length === 0) {
    return {
      answer: `**Good news!** No one appears to be slacking off ${timeframe.label}. All employees are maintaining reasonable productivity levels.`,
      suggestions: ['Who is most productive?', 'Show overtime workers', 'Team efficiency trends']
    };
  }

  let answer = `**Employees with Low Activity ${timeframe.label}**\n\n`;
  
  data.forEach((row: any, idx: number) => {
    const emoji = row.avg_score < 20 ? '🔴' : row.avg_score < 40 ? '🟠' : '🟡';
    answer += `${emoji} **${row.name}** (${row.department})\n`;
    answer += `   • Productivity: ${Math.round(row.avg_score)}%\n`;
    answer += `   • Idle time: ${Math.round(row.idle_hours * 10) / 10}h\n`;
    answer += `   • Unproductive: ${Math.round(row.unproductive_hours * 10) / 10}h\n`;
    answer += `   • Total tracked: ${Math.round(row.total_hours * 10) / 10}h\n\n`;
  });

  answer += `**Recommendation:** Consider having a 1-on-1 with these employees to understand if there are blockers or distractions affecting their work.`;

  return {
    answer,
    suggestions: ['What can they improve?', 'Compare to last week', 'Show their app usage']
  };
}

async function handleOvertimeQuery(question: string, db: any): Promise<ChatResponse> {
  const timeframe = extractTimeframe(question);
  const threshold = 40;

  const sql = `
    SELECT 
      e.name,
      e.department,
      SUM(a.duration_seconds) / 3600 as total_hours,
      AVG(a.productivity_score) as avg_score,
      COUNT(DISTINCT DATE(a.timestamp)) as days_worked,
      MAX(a.timestamp) as last_activity
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    HAVING total_hours > ${threshold}
    ORDER BY total_hours DESC
  `;

  const data = await db.all(sql);

  if (data.length === 0) {
    return {
      answer: `No one is working excessive overtime ${timeframe.label}. All employees are within normal working hours.`,
      suggestions: ['Who has capacity for more work?', 'Show burnout risk', 'Team workload balance']
    };
  }

  let answer = `**Employees Working Overtime ${timeframe.label}**\n\n`;
  
  data.forEach((row: any) => {
    const overtime = Math.round((row.total_hours - threshold) * 10) / 10;
    const emoji = row.avg_score < 50 ? '⚠️' : '💪';
    answer += `${emoji} **${row.name}** (${row.department})\n`;
    answer += `   • Total hours: **${Math.round(row.total_hours * 10) / 10}h** (${overtime}h over)\n`;
    answer += `   • Days worked: ${row.days_worked}\n`;
    answer += `   • Productivity: ${Math.round(row.avg_score)}%\n`;
    answer += `   • Last active: ${new Date(row.last_activity).toLocaleDateString()}\n\n`;
  });

  answer += `**Note:** High overtime with low productivity may indicate burnout. Consider redistributing workload.`;

  return {
    answer,
    suggestions: ['Check for burnout risk', 'Who has capacity?', 'Workload distribution']
  };
}

async function handleNonWorkQuery(question: string, db: any): Promise<ChatResponse> {
  const employee = await extractEmployeeName(question, db);
  const timeframe = extractTimeframe(question);

  const unproductiveCategories = ['entertainment', 'social_media', 'shopping_personal'];
  const categoryFilter = unproductiveCategories.map(c => `category = '${c}'`).join(' OR ');

  let sql: string;
  let params: any[];

  if (employee) {
    sql = `
      SELECT 
        app_name,
        category_name,
        SUM(duration_seconds) / 3600 as hours,
        COUNT(*) as sessions
      FROM activities
      WHERE employee_id = ?
      AND (${categoryFilter})
      AND timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY app_name
      ORDER BY hours DESC
      LIMIT 10
    `;
    params = [employee.id];
  } else {
    sql = `
      SELECT 
        e.name as employee_name,
        SUM(a.duration_seconds) / 3600 as hours
      FROM activities a
      JOIN employees e ON a.employee_id = e.id
      WHERE (${categoryFilter})
      AND a.timestamp > datetime('now', '-${timeframe.days} days')
      GROUP BY a.employee_id
      ORDER BY hours DESC
    `;
    params = [];
  }

  const data = await db.all(sql, params);

  if (data.length === 0) {
    return {
      answer: `Great! No significant non-work activity detected ${timeframe.label}${employee ? ` for ${employee.name}` : ''}.`,
      suggestions: ['Show productivity leaders', 'Who deserves recognition?', 'Team performance']
    };
  }

  let answer = '';
  
  if (employee) {
    const totalWasted = data.reduce((sum: number, row: any) => sum + row.hours, 0);
    answer = `**${employee.name}'s Non-Work Activity ${timeframe.label}**\n\n`;
    answer += `Total time on non-work apps: **${Math.round(totalWasted * 10) / 10} hours**\n\n`;
    
    data.forEach((row: any) => {
      const emoji = row.category_name === 'entertainment' ? '🎮' : row.category_name === 'social_media' ? '📱' : '🛒';
      answer += `${emoji} **${row.app_name}**: ${Math.round(row.hours * 10) / 10}h (${row.sessions} times)\n`;
    });

    if (totalWasted > 5) {
      answer += `\n⚠️ **Concern:** Over 5 hours on non-work activities. Consider discussing focus time expectations.`;
    }
  } else {
    answer = `**Non-Work Time by Employee ${timeframe.label}**\n\n`;
    data.forEach((row: any, idx: number) => {
      answer += `${idx + 1}. **${row.employee_name}**: ${Math.round(row.hours * 10) / 10} hours\n`;
    });
  }

  return {
    answer,
    suggestions: ['What can they improve?', 'Show their productive time', 'Compare to team average']
  };
}

async function handleBurnoutQuery(question: string, db: any): Promise<ChatResponse> {
  const employee = await extractEmployeeName(question, db);

  const sql = `
    SELECT 
      e.name,
      e.department,
      SUM(CASE WHEN a.timestamp > datetime('now', '-7 days') THEN a.duration_seconds ELSE 0 END) / 3600 as recent_hours,
      SUM(CASE WHEN a.timestamp <= datetime('now', '-7 days') AND a.timestamp > datetime('now', '-14 days') THEN a.duration_seconds ELSE 0 END) / 3600 as previous_hours,
      AVG(CASE WHEN a.timestamp > datetime('now', '-7 days') THEN a.productivity_score END) as recent_score,
      AVG(CASE WHEN a.timestamp <= datetime('now', '-7 days') AND a.timestamp > datetime('now', '-14 days') THEN a.productivity_score END) as previous_score
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-14 days')
    ${employee ? 'AND e.id = ?' : ''}
    GROUP BY e.id
    ${employee ? '' : 'HAVING recent_hours > 45 OR (recent_score < previous_score - 15)'}
    ORDER BY recent_hours DESC
  `;

  const params = employee ? [employee.id] : [];
  const data = await db.all(sql, params);

  if (data.length === 0) {
    return {
      answer: employee 
        ? `**Good news!** ${employee.name} doesn't show burnout indicators.`
        : `**Good news!** No employees show signs of burnout.`,
      suggestions: ['Show overtime workers', 'Who has capacity?', 'Team wellness check']
    };
  }

  let answer = employee 
    ? `**${employee.name}'s Burnout Risk Assessment**\n\n`
    : `**Employees at Risk of Burnout**\n\n`;

  data.forEach((row: any) => {
    const hoursChange = row.previous_hours > 0 ? Math.round(((row.recent_hours - row.previous_hours) / row.previous_hours) * 100) : 0;
    const scoreChange = row.previous_score ? Math.round(row.recent_score - row.previous_score) : 0;
    
    const riskLevel = (row.recent_hours > 50 && row.recent_score < 50) ? '🔴 HIGH' :
                      (row.recent_hours > 45 || scoreChange < -20) ? '🟠 MEDIUM' : '🟡 LOW';

    answer += `${riskLevel} **${row.name}**\n`;
    answer += `   • Hours: ${Math.round(row.previous_hours || 0)}h → **${Math.round(row.recent_hours)}h**\n`;
    answer += `   • Productivity: ${Math.round(row.previous_score || 0)}% → **${Math.round(row.recent_score)}%**\n\n`;
  });

  answer += `**Recommendations:** Check in with these employees, consider redistributing tasks, encourage breaks.`;

  return {
    answer,
    suggestions: ['Redistribute workload', 'Who has capacity?', 'Show overtime trends']
  };
}

async function handleCapacityQuery(question: string, db: any): Promise<ChatResponse> {
  const timeframe = extractTimeframe(question);
  const standardHours = timeframe.days * 8;

  const sql = `
    SELECT 
      e.name,
      e.department,
      SUM(a.duration_seconds) / 3600 as hours_worked,
      AVG(a.productivity_score) as avg_score
    FROM employees e
    LEFT JOIN activities a ON e.id = a.employee_id 
      AND a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    ORDER BY hours_worked ASC
  `;

  const data = await db.all(sql);

  let answer = `**Employee Capacity Analysis ${timeframe.label}**\n\n`;
  answer += `Standard: **${standardHours} hours**\n\n`;

  const available = data.filter((e: any) => e.hours_worked < standardHours * 0.8);
  const overloaded = data.filter((e: any) => e.hours_worked > standardHours);

  if (available.length > 0) {
    answer += `**🟢 Available:**\n`;
    available.forEach((row: any) => {
      const remaining = Math.round((standardHours - row.hours_worked) * 10) / 10;
      answer += `• **${row.name}**: ${remaining}h available\n`;
    });
    answer += '\n';
  }

  if (overloaded.length > 0) {
    answer += `**🔴 Overloaded:**\n`;
    overloaded.forEach((row: any) => {
      answer += `• **${row.name}**: ${Math.round(row.hours_worked * 10) / 10}h\n`;
    });
  }

  if (available.length > 0) {
    answer += `\n**Recommendation:** Give new work to **${available[0].name}**.`;
  }

  return {
    answer,
    suggestions: ['Show burnout risk', 'Redistribute workload', 'Who is most efficient?']
  };
}

async function handleTopPerformerQuery(question: string, db: any): Promise<ChatResponse> {
  const timeframe = extractTimeframe(question);

  const sql = `
    SELECT 
      e.name,
      e.department,
      AVG(a.productivity_score) as avg_score,
      SUM(a.duration_seconds) / 3600 as total_hours
    FROM employees e
    JOIN activities a ON e.id = a.employee_id
    WHERE a.timestamp > datetime('now', '-${timeframe.days} days')
    GROUP BY e.id
    HAVING avg_score > 60 AND total_hours > 10
    ORDER BY avg_score DESC
    LIMIT 5
  `;

  const data = await db.all(sql);

  if (data.length === 0) {
    return {
      answer: `No clear top performers identified ${timeframe.label}.`,
      suggestions: ['Show all employees', 'Who is improving?', 'Team productivity overview']
    };
  }

  let answer = `**🏆 Top Performers ${timeframe.label}**\n\n`;

  data.forEach((row: any, idx: number) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
    answer += `${medal} **${row.name}** (${row.department}): ${Math.round(row.avg_score)}% productivity, ${Math.round(row.total_hours)}h\n`;
  });

  return {
    answer,
    suggestions: ['What makes them successful?', 'Show their work patterns', 'Compare to others']
  };
}

export default router;
