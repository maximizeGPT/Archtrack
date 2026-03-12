import { WebSocketServer, WebSocket } from 'ws';
import { createTimeEntry, updateTimeEntry, getEmployeeById } from './database';

interface ConnectedClient {
  ws: WebSocket;
  employeeId?: string;
  employeeName?: string;
  isAdmin?: boolean;
}

const clients = new Map<WebSocket, ConnectedClient>();

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket) => {
    console.log('🔌 New WebSocket connection');
    
    clients.set(ws, { ws });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(ws, message);
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      const client = clients.get(ws);
      if (client?.employeeId) {
        // Notify admins that employee went offline
        broadcastToAdmins({
          type: 'employee:offline',
          data: {
            employeeId: client.employeeId,
            employeeName: client.employeeName,
            timestamp: new Date().toISOString()
          }
        });
      }
      clients.delete(ws);
      console.log('🔌 WebSocket disconnected');
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });
}

async function handleMessage(ws: WebSocket, message: any): Promise<void> {
  const client = clients.get(ws);
  if (!client) return;

  switch (message.type) {
    case 'register':
      // Employee or admin registering
      client.employeeId = message.employeeId;
      client.employeeName = message.employeeName;
      client.isAdmin = message.isAdmin || false;
      
      console.log(`👤 ${message.employeeName} (${message.employeeId}) registered`);
      
      // Notify admins about new online employee
      if (!client.isAdmin) {
        broadcastToAdmins({
          type: 'employee:online',
          data: {
            employeeId: message.employeeId,
            employeeName: message.employeeName,
            timestamp: new Date().toISOString()
          }
        });
      }
      break;

    case 'time-entry:started':
      // Desktop app started tracking
      console.log(`⏱️ ${client.employeeName} started tracking`);
      
      // Save to database
      try {
        await createTimeEntry(message.entry);
      } catch (err) {
        console.error('Error saving time entry:', err);
      }
      
      // Broadcast to all admins
      broadcastToAdmins({
        type: 'time-entry:started',
        data: {
          employeeId: message.employeeId,
          employeeName: client.employeeName,
          entry: message.entry,
          timestamp: new Date().toISOString()
        }
      });
      break;

    case 'time-entry:stopped':
      // Desktop app stopped tracking
      console.log(`⏹️ ${client.employeeName} stopped tracking`);
      
      // Update in database
      try {
        await updateTimeEntry(message.entry.id, {
          endTime: message.entry.endTime,
          duration: message.entry.duration,
          idleTime: message.entry.idleTime
        });
      } catch (err) {
        console.error('Error updating time entry:', err);
      }
      
      // Broadcast to all admins
      broadcastToAdmins({
        type: 'time-entry:stopped',
        data: {
          employeeId: message.employeeId,
          employeeName: client.employeeName,
          entry: message.entry,
          timestamp: new Date().toISOString()
        }
      });
      break;

    case 'time-entries':
      // Batch sync from desktop app
      console.log(`📤 ${client.employeeName} synced ${message.entries?.length || 0} entries`);
      
      if (message.entries && Array.isArray(message.entries)) {
        for (const entry of message.entries) {
          try {
            // Check if entry already exists
            const { getTimeEntryById } = require('./database');
            const existing = await getTimeEntryById(entry.id);
            
            if (existing) {
              await updateTimeEntry(entry.id, entry);
            } else {
              await createTimeEntry(entry);
            }
          } catch (err) {
            console.error('Error syncing entry:', err);
          }
        }
        
        // Notify admins
        broadcastToAdmins({
          type: 'sync:completed',
          data: {
            employeeId: message.employeeId,
            employeeName: client.employeeName,
            count: message.entries.length,
            timestamp: new Date().toISOString()
          }
        });
      }
      break;

    case 'admin:request-sync':
      // Admin requesting all employees to sync
      if (client.isAdmin) {
        broadcastToEmployees({
          type: 'sync-request',
          data: { requestedBy: client.employeeId }
        });
      }
      break;

    case 'admin:ping-employee':
      // Admin checking if employee is online
      if (client.isAdmin && message.employeeId) {
        const targetClient = findClientByEmployeeId(message.employeeId);
        ws.send(JSON.stringify({
          type: 'admin:employee-status',
          data: {
            employeeId: message.employeeId,
            isOnline: !!targetClient,
            timestamp: new Date().toISOString()
          }
        }));
      }
      break;
  }
}

function broadcastToAdmins(message: any): void {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.isAdmin && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

function broadcastToEmployees(message: any): void {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (!client.isAdmin && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

function findClientByEmployeeId(employeeId: string): ConnectedClient | undefined {
  for (const client of clients.values()) {
    if (client.employeeId === employeeId) {
      return client;
    }
  }
  return undefined;
}

export function getConnectedEmployees(): Array<{ employeeId: string; employeeName: string }> {
  const employees: Array<{ employeeId: string; employeeName: string }> = [];
  clients.forEach((client) => {
    if (client.employeeId && !client.isAdmin) {
      employees.push({
        employeeId: client.employeeId,
        employeeName: client.employeeName || 'Unknown'
      });
    }
  });
  return employees;
}