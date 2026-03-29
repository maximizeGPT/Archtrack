import React, { useState, useRef, useEffect } from 'react';
import './GenesisAI.css';

// Simple markdown formatter
function formatMarkdown(text: string): string {
  return text
    // Bold: **text** → <strong>text</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* → <em>text</em>  
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n/g, '<br/>');
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
}

export function GenesisAI() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [useLLM, setUseLLM] = useState(true); // Toggle between old and new
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const endpoint = useLLM ? '/api/ai-llm/chat' : '/api/ai/chat';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          conversationId
        })
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        suggestions: data.suggestions
      };

      setMessages(prev => [...prev, assistantMessage]);
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  if (!isOpen) {
    return (
      <button 
        className="genesis-fab"
        onClick={() => setIsOpen(true)}
        title="Ask Genesis AI"
      >
        <span className="genesis-fab-icon">🤖</span>
        <span className="genesis-fab-text">Genesis AI</span>
      </button>
    );
  }

  return (
    <div className="genesis-panel">
      <div className="genesis-header">
        <div className="genesis-title">
          <span className="genesis-icon">🤖</span>
          <div>
            <h3>Genesis AI</h3>
            <span className="genesis-subtitle">
              {useLLM ? 'Powered by DeepSeek AI' : 'Rule-based Analytics'}
            </span>
          </div>
        </div>
        <div className="genesis-controls">
          <label className="llm-toggle">
            <input
              type="checkbox"
              checked={useLLM}
              onChange={(e) => setUseLLM(e.target.checked)}
            />
            <span>LLM Mode</span>
          </label>
          <button 
            className="genesis-close"
            onClick={() => setIsOpen(false)}
          >
            ×
          </button>
        </div>
      </div>

      <div className="genesis-messages">
        {messages.length === 0 && (
          <div className="genesis-welcome">
            <h4>👋 Hi! I'm Genesis, your AI analytics assistant.</h4>
            <p>I can help you understand your team's productivity data.</p>
            <div className="genesis-quick-actions">
              <button onClick={() => handleSuggestionClick('Who was most productive today?')}>
                💡 Who was most productive today?
              </button>
              <button onClick={() => handleSuggestionClick('Show repetitive tasks')}>
                💡 Show repetitive tasks
              </button>
              <button onClick={() => handleSuggestionClick('Time spent on meetings')}>
                💡 Time spent on meetings
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`genesis-message ${message.role}`}>
            <div className="genesis-message-content">
              {message.role === 'assistant' && <span className="genesis-avatar">🤖</span>}
              <div className="genesis-bubble">
                <div className="genesis-text" dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }} />
                
                {message.suggestions && message.suggestions.length > 0 && (
                  <div className="genesis-suggestions">
                    {message.suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        className="genesis-suggestion"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        💡 {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="genesis-message assistant">
            <div className="genesis-message-content">
              <span className="genesis-avatar">🤖</span>
              <div className="genesis-bubble">
                <div className="genesis-typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="genesis-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about productivity, employees, or trends..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
