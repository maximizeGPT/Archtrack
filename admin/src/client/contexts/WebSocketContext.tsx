import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface WebSocketContextType {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  lastMessage: any;
  onlineEmployees: Map<string, { name: string; lastSeen: string; currentTask?: string }>;
  recentActivity: Array<{
    type: string;
    employeeName: string;
    message: string;
    timestamp: string;
  }>;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  connectionStatus: 'disconnected',
  lastMessage: null,
  onlineEmployees: new Map(),
  recentActivity: [],
  reconnect: () => {}
});

export const useWebSocket = () => useContext(WebSocketContext);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [onlineEmployees, setOnlineEmployees] = useState<Map<string, any>>(new Map());
  const [recentActivity, setRecentActivity] = useState<Array<any>>([]);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = React.useRef(true);

  const connect = useCallback(() => {
    // Don't connect if component is unmounted
    if (!isMountedRef.current) return null;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) {
        ws.close();
        return;
      }
      console.log('WebSocket connected');
      setIsConnected(true);
      setConnectionStatus('connected');
      setReconnectAttempt(0);

      // Register as admin
      ws.send(JSON.stringify({
        type: 'register',
        employeeId: 'admin',
        employeeName: 'Administrator',
        isAdmin: true
      }));
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);
        handleMessage(message);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected', event.code, event.reason);
      if (!isMountedRef.current) return;

      setIsConnected(false);
      setConnectionStatus('disconnected');

      // Only reconnect if this is still the current WebSocket and component is mounted
      if (wsRef.current === ws && isMountedRef.current) {
        wsRef.current = null;

        // Auto-reconnect with exponential backoff (max 10 attempts)
        const currentAttempt = reconnectAttempt;
        if (currentAttempt < 10) {
          const delay = Math.min(1000 * Math.pow(2, currentAttempt), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${currentAttempt + 1})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setReconnectAttempt(prev => prev + 1);
            }
          }, delay);
        }
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (!isMountedRef.current) return;
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };

    const handleMessage = (message: any) => {
      const timestamp = new Date().toISOString();

      switch (message.type) {
        case 'employee:online':
          setOnlineEmployees(prev => {
            const next = new Map(prev);
            next.set(message.data.employeeId, {
              name: message.data.employeeName,
              lastSeen: message.data.timestamp || timestamp
            });
            return next;
          });
          addActivity('online', message.data.employeeName, 'came online', timestamp);
          break;

        case 'employee:offline':
          setOnlineEmployees(prev => {
            const next = new Map(prev);
            next.delete(message.data.employeeId);
            return next;
          });
          addActivity('offline', message.data.employeeName, 'went offline', timestamp);
          break;

        case 'time-entry:started':
          setOnlineEmployees(prev => {
            const next = new Map(prev);
            const emp = next.get(message.data.employeeId);
            if (emp) {
              emp.currentTask = message.data.entry?.description || 'Working';
              next.set(message.data.employeeId, emp);
            }
            return next;
          });
          addActivity('tracking', message.data.employeeName, `started tracking: ${message.data.entry?.description || 'New task'}`, timestamp);
          break;

        case 'time-entry:stopped':
          const duration = message.data.entry?.duration
            ? `${Math.round(message.data.entry.duration / 60)} min`
            : 'some time';
          addActivity('stopped', message.data.employeeName, `stopped tracking (${duration})`, timestamp);
          break;

        case 'sync:completed':
          addActivity('sync', message.data.employeeName, `synced ${message.data.count} entries`, timestamp);
          break;
      }
    };

    const addActivity = (type: string, employeeName: string, message: string, timestamp: string) => {
      if (!isMountedRef.current) return;
      setRecentActivity(prev => [
        { type, employeeName, message, timestamp },
        ...prev.slice(0, 49) // Keep last 50 activities
      ]);
    };

    return ws;
  }, [reconnectAttempt]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    setReconnectAttempt(0);
  }, []);

  return (
    <WebSocketContext.Provider value={{ 
      isConnected, 
      connectionStatus,
      lastMessage, 
      onlineEmployees, 
      recentActivity,
      reconnect 
    }}>
      {children}
    </WebSocketContext.Provider>
  );
};
