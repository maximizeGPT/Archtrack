import { getDatabase } from '../database.js';

interface ChatResponse {
  answer: string;
  sql?: string;
  data?: any[];
  suggestions?: string[];
}

/**
 * Extract employee name from question
 */
async function extractEmployeeName(question: string, db: any): Promise<{ id: string; name: string } | null> {
  const employees = await db.all('SELECT id, name FROM employees');
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

export async function handleSlackingQuery(question: string, db: any): Promise<ChatResponse> {
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

export async function handleOvertimeQuery(question: string, db: any): Promise<ChatResponse> {
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

export async function handleNonWorkQuery(question: string, db: any): Promise<ChatResponse> {
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

export async function handleBurnoutQuery(question: string, db: any): Promise<ChatResponse> {
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

export async function handleCapacityQuery(question: string, db: any): Promise<ChatResponse> {
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

export async function handleTopPerformerQuery(question: string, db: any): Promise<ChatResponse> {
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
