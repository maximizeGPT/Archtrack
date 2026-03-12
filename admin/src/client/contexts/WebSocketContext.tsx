import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface WebSocketContextType {
  isConnected: boolean;
  lastMessage: any;
  onlineEmployees: Map<string, { name: string; lastSeen: string; currentTask?: string }>;
  recentActivity: Array<{
    type: string;
    employeeName: string;
    message: string;
    timestamp: string;
  }>;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  lastMessage: null,
  onlineEmployees: new Map(),
  recentActivity: []
});

export const useWebSocket = () => useContext(WebSocketContext);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [onlineEmployees, setOnlineEmployees] = useState<Map<string, any>>(new Map());
  const [recentActivity, setRecentActivity] = useState<Array<any>>([]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // Register as admin
      ws.send(JSON.stringify({
        type: 'register',
        employeeId: 'admin',
        employeeName: 'Administrator',
        isAdmin: true
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);
        handleMessage(message);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    const handleMessage = (message: any) => {
      const timestamp = new Date().toISOString();
      
      switch (message.type) {
        case 'employee:online':
          setOnlineEmployees(prev => {
            const next = new Map(prev);
            next.set(message.data.employeeId, {
              name: message.data.employeeName,
              lastSeen: timestamp
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
      setRecentActivity(prev => [
        { type, employeeName, message, timestamp },
        ...prev.slice(0, 49) // Keep last 50 activities
      ]);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage, onlineEmployees, recentActivity }}>
      {children}
    </WebSocketContext.Provider>
  );
};