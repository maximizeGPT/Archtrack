import { Router } from 'express';
import { getDatabase } from '../database.js';
import { detectRepetitivePatterns, getTopAgentOpportunities } from '../ai-analytics.js';

const router = Router();

interface ChatRequest {
  question: string;
  conversationId?: string;
}

interface ChatResponse {
  answer: string;
  sql?: string;
  data?: any[];
  suggestions?: string[];
  conversationId: string;
}

// Conversation memory store (in production, use Redis)
const conversations = new Map<string, Array<{role: 'user' | 'assistant', content: string}>>();

// DeepSeek API configuration (works from US servers)
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * Call DeepSeek LLM API
 */
async function callLLM(messages: Array<{role: string, content: string}>, temperature = 0.7): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    return 'LLM not configured. Please set DEEPSEEK_API_KEY environment variable.';
  }

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('LLM API error:', error);
      return 'Sorry, I encountered an error. Please try again.';
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || 'No response from LLM.';
  } catch (error) {
    console.error('LLM call error:', error);
    return 'Sorry, I encountered an error. Please try again.';
  }
}

/**
 * Generate system prompt with current data context
 */
async function generateSystemPrompt(db: any): Promise<string> {
  // Get current team stats
  const stats = await db.get(`
    SELECT 
      COUNT(DISTINCT employee_id) as employee_count,
      COUNT(*) as total_activities,
      AVG(productivity_score) as avg_productivity,
      SUM(duration_seconds) / 3600 as total_hours
    FROM activities 
    WHERE timestamp > datetime('now', '-7 days')
  `);

  // Get employee list
  const employees = await db.all('SELECT name, department, hourly_rate FROM employees WHERE is_active = 1');
  
  // Get recent activity summary
  const recentActivity = await db.all(`
    SELECT 
      e.name,
      COUNT(*) as activities,
      AVG(a.productivity_score) as avg_score,
      SUM(a.duration_seconds) / 3600 as hours
    FROM activities a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp > datetime('now', '-1 day')
    GROUP BY e.id
    ORDER BY activities DESC
    LIMIT 5
  `);

  // Get top apps by time spent
  const topApps = await db.all(`
    SELECT 
      app_name,
      SUM(duration_seconds) / 3600 as hours,
      AVG(productivity_score) as avg_score,
      COUNT(*) as usage_count
    FROM activities
    WHERE timestamp > datetime('now', '-7 days')
      AND app_name NOT IN ('loginwindow', 'Window Server', 'kernel', 'system', 'Finder', 'Dock')
    GROUP BY app_name
    ORDER BY hours DESC
    LIMIT 10
  `);

  // Get productivity breakdown by category
  const categoryBreakdown = await db.all(`
    SELECT 
      category,
      SUM(duration_seconds) / 3600 as hours,
      COUNT(*) as activities
    FROM activities
    WHERE timestamp > datetime('now', '-7 days')
    GROUP BY category
    ORDER BY hours DESC
  `);

  // Get employee app usage patterns for repetitive task detection
  const employeePatterns = await db.all(`
    SELECT 
      e.name,
      a.app_name,
      COUNT(*) as times_used,
      SUM(a.duration_seconds) / 3600 as total_hours,
      AVG(a.productivity_score) as avg_productivity
    FROM activities a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp > datetime('now', '-7 days')
      AND a.app_name NOT IN ('loginwindow', 'Window Server', 'kernel', 'system', 'Finder', 'Dock')
    GROUP BY e.id, a.app_name
    HAVING times_used > 10
    ORDER BY times_used DESC
    LIMIT 15
  `);

  return `You are Genesis, an AI analytics assistant for ArchTrack - an employee productivity tracking system for an architecture firm.

CURRENT TEAM CONTEXT:
- Active Employees: ${stats.employee_count}
- Total Hours (7 days): ${Math.round(stats.total_hours * 10) / 10}h
- Average Productivity: ${Math.round(stats.avg_productivity)}%
- Total Activities: ${stats.total_activities}

TEAM MEMBERS:
${employees.map((e: any) => `- ${e.name} (${e.department}, $${e.hourly_rate}/hr)`).join('\n')}

RECENT ACTIVITY (Last 24h):
${recentActivity.map((a: any) => `- ${a.name}: ${a.activities} activities, ${Math.round(a.avg_score)}% productivity, ${Math.round(a.hours * 10) / 10}h`).join('\n')}

TOP APPS BY TIME (Last 7 days):
${topApps.map((a: any) => `- ${a.app_name}: ${Math.round(a.hours * 10) / 10}h, ${Math.round(a.avg_score)}% productivity, used ${a.usage_count} times`).join('\n')}

TIME BREAKDOWN BY CATEGORY (Last 7 days):
${categoryBreakdown.map((c: any) => `- ${c.category}: ${Math.round(c.hours * 10) / 10}h (${c.activities} activities)`).join('\n')}

FREQUENT APP USAGE PATTERNS (Potential repetitive tasks):
${employeePatterns.map((p: any) => `- ${p.name} → ${p.app_name}: ${p.times_used} times, ${Math.round(p.total_hours * 10) / 10}h total`).join('\n')}

AUTOMATION RECOMMENDATIONS BY APP TYPE:
- **Google Chrome / Browser**: Use browser extensions (Toby, Workona) for tab management. Consider bookmark scripts or auto-fill tools for repetitive form entry.
- **Terminal / Command Line**: Create shell aliases, bash scripts, or use tools like Warp/ Fig for command autocomplete. Document common commands in a runbook.
- **Slack / Teams**: Set up keyboard shortcuts, use /remind for follow-ups, create saved snippets for common responses.
- **Email (Gmail/Outlook)**: Use templates/canned responses, schedule send, filters for auto-sorting, and unsubscribe tools.
- **VS Code / IDE**: Code snippets, extensions for repetitive tasks, multi-cursor editing, and automated formatting.
- **Excel / Sheets**: Macros, formulas instead of manual calculations, templates for recurring reports.
- **Design tools (Figma/Sketch)**: Component libraries, auto-layout, plugins for repetitive exports.
- **Project management (Jira/Asana)**: Templates for recurring tasks, automation rules, bulk edit features.

YOUR CAPABILITIES:
1. Answer questions about employee productivity, time tracking, and app usage
2. Identify patterns and trends in work habits
3. Suggest improvements for individual employees or the team
4. Generate insights about focus time, distractions, and efficiency
5. Compare performance across employees or time periods

RESPONSE GUIDELINES:
- Be concise but informative (2-4 sentences for simple queries)
- Use specific data points when available
- **ALWAYS give 3 specific, actionable steps they can do TODAY**
- Don't say "consider automating" — say "Install Toby extension at toby.tab"
- Don't say "reduce distractions" — say "Use Cold Turkey blocker, download at getcoldturkey.com"
- Include exact tool names, URLs, and command-line examples where possible
- If data is insufficient, explain what's needed
- Use emojis sparingly for visual hierarchy
- Always offer 3 relevant follow-up questions as suggestions

SPECIFIC WORKFLOW FIXES:
When you detect patterns like "OpenClaw Control ↔ Terminal/DigitalOcean":
1. **SSH Key Setup**: "Set up SSH keys to avoid typing passwords repeatedly"
2. **SSH Config**: "Add host aliases in ~/.ssh/config for one-command access"
3. **Terminal Multiplexer**: "Use tmux or screen to keep sessions alive between switches"
4. **Local Scripts**: "Create shell scripts for common deployment commands"
5. **VS Code Remote**: "Use VS Code Remote-SSH extension to edit files directly on the server"
6. **GitHub Actions**: "Automate deployments with GitHub Actions instead of manual SSH"

TONE: Professional, helpful, data-driven, slightly friendly but not overly casual.`;
}

/**
 * Main chat endpoint with LLM
 */
router.post('/chat', async (req, res) => {
  try {
    const { question, conversationId }: ChatRequest = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const db = getDatabase();
    const convId = conversationId || generateConversationId();
    
    // Get or create conversation history
    let history = conversations.get(convId) || [];
    
    // Generate system prompt with current data
    const systemPrompt = await generateSystemPrompt(db);
    
    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6), // Keep last 6 messages for context
      { role: 'user', content: question }
    ];

    // Call LLM
    let answer = await callLLM(messages);
    
    // Post-process to add specific actionable steps
    answer = enhanceResponseWithActions(answer, question);
    
    // Update conversation history
    history.push({ role: 'user', content: question });
    history.push({ role: 'assistant', content: answer });
    conversations.set(convId, history);

    // Generate contextual suggestions based on the conversation
    const suggestions = await generateSuggestions(question, answer, db);

    res.json({
      answer,
      suggestions,
      conversationId: convId
    });

  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ 
      answer: 'Sorry, I encountered an error processing your question. Please try again.',
      conversationId: generateConversationId()
    });
  }
});

/**
 * Generate contextual suggestions based on conversation
 */
async function generateSuggestions(question: string, answer: string, db: any): Promise<string[]> {
  const suggestions: string[] = [];
  
  // Extract employee names mentioned
  const employees = await db.all('SELECT name FROM employees WHERE is_active = 1');
  const mentionedEmployee = employees.find((e: any) => 
    question.toLowerCase().includes(e.name.toLowerCase())
  );
  
  if (mentionedEmployee) {
    // If an employee was discussed, suggest related queries
    suggestions.push(`What can ${mentionedEmployee.name} improve?`);
    suggestions.push(`Show ${mentionedEmployee.name}'s app usage`);
  } else {
    // Otherwise suggest checking on a random employee
    const randomEmployee = employees[Math.floor(Math.random() * employees.length)];
    suggestions.push(`How is ${randomEmployee.name} doing?`);
  }
  
  // Add diverse analytical suggestions
  const analyticalSuggestions = [
    'Compare team productivity this week vs last week',
    'What are the top time-wasting apps?',
    'Show me focus time trends',
    'Who has the best work-life balance?',
    'What times of day is the team most productive?',
    'Show department comparison'
  ];
  
  // Pick 2 random analytical suggestions
  const shuffled = analyticalSuggestions.sort(() => 0.5 - Math.random());
  suggestions.push(...shuffled.slice(0, 2));
  
  return suggestions.slice(0, 3);
}

/**
 * Enhance LLM response with specific actionable steps
 */
function enhanceResponseWithActions(answer: string, question: string): string {
  const lowerQuestion = question.toLowerCase();
  const lowerAnswer = answer.toLowerCase();
  
  // Add specific actions based on question type (always add, don't check for existing)
  if (lowerQuestion.includes('repetitive') || lowerQuestion.includes('automate')) {
    // Don't add if already has Quick Wins section
    if (!lowerAnswer.includes('quick wins') && !lowerAnswer.includes('do these today')) {
      return answer + '\n\n**Quick Wins (Do These Today):**\n' +
        '1. **Chrome users**: Install Toby extension (toby.tab) — organize tabs in 5 minutes\n' +
        '2. **Terminal users**: Add `alias deploy="ssh server && ./deploy.sh"` to ~/.bashrc\n' +
        '3. **VS Code users**: Press Cmd+Shift+P → "Snippets: Configure User Snippets" → create templates\n\n' +
        '**This Week:**\n' +
        '- Document your 3 most common commands in a text file\n' +
        '- Set up 1 GitHub Action for automatic deployment\n' +
        '- Use VS Code Remote-SSH to edit server files directly';
    }
  }
  
  if (lowerQuestion.includes('productive') || lowerQuestion.includes('focus') || lowerQuestion.includes('distraction')) {
    if (!lowerAnswer.includes('immediate actions') && !lowerAnswer.includes('cold turkey')) {
      return answer + '\n\n**Immediate Actions:**\n' +
        '1. **Block distractions**: Use Cold Turkey (Windows) or SelfControl (Mac) during work hours\n' +
        '2. **Time blocking**: Schedule 2-hour "deep work" blocks in calendar, turn off notifications\n' +
        '3. **Environment**: Close Slack/Teams, put phone in another room\n\n' +
        '**Track Progress:**\n' +
        '- Check ArchTrack dashboard daily at 5pm\n' +
        '- Aim for 3+ hours of "core work" daily\n' +
        '- Review weekly: Is productive time increasing?';
    }
  }
  
  if (lowerQuestion.includes('burnout') || lowerQuestion.includes('overtime') || lowerQuestion.includes('stress')) {
    if (!lowerAnswer.includes('immediate actions')) {
      return answer + '\n\n**Immediate Actions:**\n' +
        '1. **Check hours**: Anyone working >50 hours/week needs workload review\n' +
        '2. **Conversation**: Schedule 1-on-1 with high-hours employees this week\n' +
        '3. **Redistribute**: Move tasks from overloaded employees to those with capacity\n\n' +
        '**Long-term:**\n' +
        '- Set "core hours" policy (e.g., 10am-4pm in office, rest flexible)\n' +
        '- Review project deadlines — are they realistic?\n' +
        '- Consider hiring if team is consistently overloaded';
    }
  }
  
  if (lowerQuestion.includes('slack') || lowerQuestion.includes('email') || lowerQuestion.includes('meeting') || lowerQuestion.includes('communication')) {
    if (!lowerAnswer.includes('reduce communication overhead')) {
      return answer + '\n\n**Reduce Communication Overhead:**\n' +
        '1. **Async updates**: Replace daily standups with written updates in Slack\n' +
        '2. **Email batching**: Check email 2x daily (11am, 4pm), not constantly\n' +
        '3. **Meeting audit**: Cancel recurring meetings with no agenda\n\n' +
        '**Tools:**\n' +
        '- Slack: Use /remind for follow-ups instead of mental notes\n' +
        '- Email: Create filters to auto-sort newsletters to folder\n' +
        '- Calendar: Block "focus time" so others can\'t book meetings';
    }
  }
  
  // Default enhancement for other queries
  if (!answer.includes('**') && answer.length > 200 && !lowerAnswer.includes('next steps')) {
    return answer + '\n\n**Next Steps:**\n' +
      '1. Check this data again in 1 week to see trends\n' +
      '2. Share insights with the employee (transparency builds trust)\n' +
      '3. Set 1 specific goal based on this data';
  }
  
  return answer;
}

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default router;
