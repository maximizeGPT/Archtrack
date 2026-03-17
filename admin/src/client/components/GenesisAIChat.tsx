import { useState, useRef, useEffect } from 'react';
import { Send, X, MessageCircle, ChevronLeft, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

interface ChatResponse {
  answer: string;
  sql?: string;
  data?: any[];
  suggestions?: string[];
}

// Component to render formatted message with markdown-like styling
function FormattedMessage({ content }: { content: string }) {
  // Split by newlines and process each line
  const lines = content.split('\n');
  
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      {lines.map((line, index) => {
        // Handle bold text **text**
        const parts = line.split(/(\*\*.*?\*\*)/g);
        
        return (
          <div key={index} style={{ marginBottom: line.trim() === '' ? 8 : 4 }}>
            {parts.map((part, partIndex) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                // Bold text
                return (
                  <span key={partIndex} style={{ fontWeight: 700, color: '#1f2937' }}>
                    {part.slice(2, -2)}
                  </span>
                );
              }
              // Regular text with bullet handling
              const trimmedPart = part.trim();
              if (trimmedPart.startsWith('•') || trimmedPart.startsWith('-')) {
                return (
                  <span key={partIndex} style={{ display: 'flex', gap: 8, marginLeft: 4 }}>
                    <span style={{ color: '#3b82f6' }}>•</span>
                    <span>{trimmedPart.slice(1).trim()}</span>
                  </span>
                );
              }
              if (trimmedPart.match(/^\d+\./)) {
                // Numbered list
                const match = trimmedPart.match(/^(\d+)\.\s*(.*)/);
                if (match) {
                  return (
                    <span key={partIndex} style={{ display: 'flex', gap: 8, marginLeft: 4 }}>
                      <span style={{ color: '#3b82f6', fontWeight: 600, minWidth: 20 }}>
                        {match[1]}.
                      </span>
                      <span>{match[2]}</span>
                    </span>
                  );
                }
              }
              return <span key={partIndex}>{part}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function GenesisAIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "👋 Hi! I'm Genesis, your AI analytics assistant. I can help you understand your team's productivity data.\n\nWhat would you like to know?",
      timestamp: new Date(),
      suggestions: [
        'Who was most productive today?',
        'Show repetitive tasks',
        'Time spent on meetings'
      ]
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!hasStarted) {
      setHasStarted(true);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input })
      });

      const data: ChatResponse = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
        suggestions: data.suggestions
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const handleBackToWelcome = () => {
    setHasStarted(false);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "👋 Hi! I'm Genesis, your AI analytics assistant. I can help you understand your team's productivity data.\n\nWhat would you like to know?",
        timestamp: new Date(),
        suggestions: [
          'Who was most productive today?',
          'Show repetitive tasks',
          'Time spent on meetings'
        ]
      }
    ]);
  };

  const handleNewChat = () => {
    setHasStarted(false);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "👋 Hi! I'm Genesis, your AI analytics assistant. I can help you understand your team's productivity data.\n\nWhat would you like to know?",
        timestamp: new Date(),
        suggestions: [
          'Who was most productive today?',
          'Show repetitive tasks',
          'Time spent on meetings'
        ]
      }
    ]);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            ...styles.floatingButton,
            transform: isHovered ? 'scale(1.1)' : 'scale(1)',
            boxShadow: isHovered 
              ? '0 6px 20px rgba(59, 130, 246, 0.6)' 
              : '0 4px 12px rgba(59, 130, 246, 0.4)'
          }}
          aria-label="Open Genesis AI Chat"
          title="Open AI Assistant"
        >
          <MessageCircle style={{ width: 28, height: 28 }} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div style={styles.chatWindow}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              {hasStarted && (
                <button onClick={handleBackToWelcome} style={styles.iconButton}>
                  <ChevronLeft style={{ width: 20, height: 20 }} />
                </button>
              )}
              <div style={styles.avatar}>
                <Sparkles style={{ width: 18, height: 18, color: 'white' }} />
              </div>
              <div>
                <div style={styles.headerTitle}>Genesis AI</div>
                <div style={styles.headerSubtitle}>Analytics Assistant</div>
              </div>
            </div>
            <div style={styles.headerRight}>
              {hasStarted && (
                <button onClick={handleNewChat} style={styles.newChatButton}>
                  New
                </button>
              )}
              <button onClick={() => setIsOpen(false)} style={styles.iconButton}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={styles.messagesContainer}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  ...styles.messageRow,
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                {message.role === 'assistant' && (
                  <div style={styles.avatarSmall}>
                    <Sparkles style={{ width: 14, height: 14, color: 'white' }} />
                  </div>
                )}
                
                <div style={{ maxWidth: '80%' }}>
                  <div
                    style={{
                      ...styles.messageBubble,
                      ...(message.role === 'user' ? styles.userBubble : styles.assistantBubble)
                    }}
                  >
                    {message.role === 'user' ? (
                      <span style={{ fontSize: 13 }}>{message.content}</span>
                    ) : (
                      <FormattedMessage content={message.content} />
                    )}
                  </div>
                  
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div style={styles.suggestionsContainer}>
                      {message.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestion(suggestion)}
                          style={styles.suggestionButton}
                        >
                          💡 {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div style={styles.timestamp}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {message.role === 'user' && (
                  <div style={styles.userAvatar}>
                    <span style={{ fontSize: 14 }}>👤</span>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div style={styles.messageRow}>
                <div style={styles.avatarSmall}>
                  <Sparkles style={{ width: 14, height: 14, color: 'white' }} />
                </div>
                <div style={styles.loadingBubble}>
                  <span style={styles.loadingSpinner}>⏳</span>
                  <span>Analyzing your data...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} style={styles.inputContainer}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your team's productivity..."
              style={styles.input}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              style={{
                ...styles.sendButton,
                opacity: isLoading || !input.trim() ? 0.4 : 1,
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                backgroundColor: isLoading || !input.trim() ? '#e5e7eb' : '#3b82f6'
              }}
              title={!input.trim() ? 'Type a message to send' : 'Send message'}
            >
              <Send style={{ width: 18, height: 18 }} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  floatingButton: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    color: 'white',
    borderRadius: '50%',
    border: 'none',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    transition: 'all 0.2s ease'
  },
  chatWindow: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 400,
    height: 550,
    backgroundColor: 'white',
    borderRadius: 16,
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9999,
    overflow: 'hidden',
    border: '1px solid #e5e7eb'
  },
  header: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    color: 'white',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  avatar: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: 14
  },
  headerSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)'
  },
  iconButton: {
    background: 'transparent',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: 6,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  newChatButton: {
    background: 'transparent',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 4
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    backgroundColor: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  messageRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8
  },
  avatarSmall: {
    width: 28,
    height: 28,
    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  userAvatar: {
    width: 28,
    height: 28,
    backgroundColor: '#d1d5db',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  messageBubble: {
    padding: '12px 16px',
    borderRadius: 16,
    maxWidth: '100%'
  },
  userBubble: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderBottomRightRadius: 4
  },
  assistantBubble: {
    backgroundColor: 'white',
    color: '#1f2937',
    border: '1px solid #e5e7eb',
    borderBottomLeftRadius: 4,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  },
  suggestionsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  suggestionButton: {
    fontSize: 11,
    padding: '6px 10px',
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    color: '#374151',
    borderRadius: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  timestamp: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4
  },
  loadingBubble: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#6b7280'
  },
  loadingSpinner: {
    animation: 'spin 1s linear infinite'
  },
  inputContainer: {
    padding: 12,
    backgroundColor: 'white',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    gap: 8
  },
  input: {
    flex: 1,
    padding: '10px 16px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: 20,
    fontSize: 13,
    outline: 'none'
  },
  sendButton: {
    width: 40,
    height: 40,
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
