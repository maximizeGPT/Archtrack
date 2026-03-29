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
      AVG(a.productivity_score) as avg_score
    FROM activities a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp > datetime('now', '-1 day')
    GROUP BY e.id
    ORDER BY activities DESC
    LIMIT 5
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
${recentActivity.map((a: any) => `- ${a.name}: ${a.activities} activities, ${Math.round(a.avg_score)}% productivity`).join('\n')}

YOUR CAPABILITIES:
1. Answer questions about employee productivity, time tracking, and app usage
2. Identify patterns and trends in work habits
3. Suggest improvements for individual employees or the team
4. Generate insights about focus time, distractions, and efficiency
5. Compare performance across employees or time periods

RESPONSE GUIDELINES:
- Be concise but informative (2-4 sentences for simple queries)
- Use specific data points when available
- Suggest actionable next steps
- If data is insufficient, explain what's needed
- Use emojis sparingly for visual hierarchy
- Always offer 3 relevant follow-up questions as suggestions

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
    const answer = await callLLM(messages);
    
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

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default router;
