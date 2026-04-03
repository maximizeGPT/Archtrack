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
async function generateSystemPrompt(db: any, orgId?: string): Promise<string> {
  const orgFilter = orgId ? `AND org_id = '${orgId}'` : '';
  const orgFilterWhere = orgId ? `WHERE org_id = '${orgId}'` : '';
  const orgFilterAnd = orgId ? `AND a.org_id = '${orgId}'` : '';

  // Helper: format duration smartly
  const fmt = (totalSeconds: number) => {
    if (!totalSeconds || totalSeconds <= 0) return '0m';
    const mins = Math.round(totalSeconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.round(totalSeconds / 360) / 10;
    return `${hrs}h`;
  };

  // Get current team stats
  const stats = await db.get(`
    SELECT
      COUNT(DISTINCT employee_id) as employee_count,
      COUNT(*) as total_activities,
      AVG(productivity_score) as avg_productivity,
      SUM(duration_seconds) as total_seconds
    FROM activities
    WHERE timestamp > datetime('now', '-7 days') ${orgFilter}
  `);

  // Get employee list
  const employees = await db.all(`SELECT name, department, hourly_rate FROM employees WHERE is_active = 1 ${orgFilter}`);

  // Get recent activity summary with minutes
  const recentActivity = await db.all(`
    SELECT
      e.name,
      COUNT(*) as activities,
      AVG(a.productivity_score) as avg_score,
      SUM(a.duration_seconds) as total_seconds
    FROM activities a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp > datetime('now', '-1 day') ${orgFilterAnd}
    GROUP BY e.id
    ORDER BY activities DESC
    LIMIT 5
  `);

  // Get top apps by time spent
  const topApps = await db.all(`
    SELECT
      app_name,
      category_name,
      SUM(duration_seconds) as total_seconds,
      AVG(productivity_score) as avg_score,
      COUNT(*) as usage_count
    FROM activities
    WHERE timestamp > datetime('now', '-7 days') ${orgFilter}
      AND app_name NOT IN ('loginwindow', 'Window Server', 'kernel', 'system', 'Finder', 'Dock')
    GROUP BY app_name
    ORDER BY total_seconds DESC
    LIMIT 10
  `);

  // Get productivity breakdown by category
  const categoryBreakdown = await db.all(`
    SELECT
      category_name,
      SUM(duration_seconds) as total_seconds,
      COUNT(*) as activities
    FROM activities
    WHERE timestamp > datetime('now', '-7 days') ${orgFilter}
    GROUP BY category
    ORDER BY total_seconds DESC
  `);

  // Get employee app usage patterns
  const employeePatterns = await db.all(`
    SELECT
      e.name,
      a.app_name,
      a.category_name,
      COUNT(*) as times_used,
      SUM(a.duration_seconds) as total_seconds,
      AVG(a.productivity_score) as avg_productivity
    FROM activities a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp > datetime('now', '-7 days') ${orgFilterAnd}
      AND a.app_name NOT IN ('loginwindow', 'Window Server', 'kernel', 'system', 'Finder', 'Dock')
    GROUP BY e.id, a.app_name
    HAVING times_used > 5
    ORDER BY times_used DESC
    LIMIT 15
  `);

  return `You are Genesis, an AI analytics assistant for ArchTrack — an employee productivity tracking system.

IMPORTANT RULES:
- Only reference data shown below. Do NOT make up numbers.
- Times are shown in minutes (m) or hours (h). Use the exact values given.
- If a value seems low (e.g. "25m tracked"), that's real data — don't assume it's a bug.
- Each "activity" is a 10-second snapshot of what app the employee was using.
- Give advice based on ACTUAL data patterns, not generic productivity tips.
- Do NOT recommend random tools unless they're directly relevant to the apps being used.

CURRENT TEAM (last 7 days):
- Employees tracked: ${stats.employee_count || 0}
- Total tracked time: ${fmt(stats.total_seconds || 0)}
- Average productivity: ${Math.round(stats.avg_productivity || 0)}%
- Activity snapshots: ${stats.total_activities || 0}

TEAM MEMBERS:
${employees.map((e: any) => `- ${e.name} (${e.department || 'No dept'})`).join('\n') || '- No employees yet'}

TODAY'S ACTIVITY:
${recentActivity.map((a: any) => `- ${a.name}: ${a.activities} snapshots, ${Math.round(a.avg_score)}% productivity, ${fmt(a.total_seconds)} tracked`).join('\n') || '- No activity today'}

TOP APPS (last 7 days):
${topApps.map((a: any) => `- ${a.app_name} [${a.category_name}]: ${fmt(a.total_seconds)}, ${Math.round(a.avg_score)}% score, ${a.usage_count} snapshots`).join('\n') || '- No app data'}

TIME BY CATEGORY (last 7 days):
${categoryBreakdown.map((c: any) => `- ${c.category_name}: ${fmt(c.total_seconds)} (${c.activities} snapshots)`).join('\n') || '- No category data'}

APP USAGE PATTERNS:
${employeePatterns.map((p: any) => `- ${p.name} uses ${p.app_name} [${p.category_name}]: ${p.times_used}x, ${fmt(p.total_seconds)}`).join('\n') || '- Not enough data yet'}

RESPONSE STYLE:
- Be concise and data-driven. Reference specific numbers from the data above.
- When asked "who was most productive", compare actual employees and scores.
- Suggest 2-3 follow-up questions the business owner might want to ask.
- Keep responses to 3-5 paragraphs max.
- Use markdown formatting (bold, lists) for readability.

TONE: Professional, helpful, like a smart analyst presenting findings to a business owner.`;
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
    
    // Generate system prompt with current data (scoped to org)
    const orgId = (req as any).orgId;
    const systemPrompt = await generateSystemPrompt(db, orgId);
    
    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6), // Keep last 6 messages for context
      { role: 'user', content: question }
    ];

    // Call LLM
    let answer = await callLLM(messages);
    
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
