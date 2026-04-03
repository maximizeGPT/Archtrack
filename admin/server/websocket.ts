import { WebSocketServer, WebSocket } from 'ws';
import { createTimeEntry, updateTimeEntry, getEmployeeById, createActivity, getActivityById, updateActivity } from './database.js';
import { verifyToken } from './auth.js';
import type { URL } from 'url';

interface ConnectedClient {
  ws: WebSocket;
  employeeId?: string;
  employeeName?: string;
  isAdmin?: boolean;
  orgId?: string;
}

const clients = new Map<WebSocket, ConnectedClient>();

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: any) => {
    console.log('🔌 New WebSocket connection');

    // Authenticate via JWT in query params: ws://host/ws?token=JWT
    let orgId: string | undefined;
    let employeeId: string | undefined;
    let isAdmin = false;

    try {
      const url = new (require('url').URL)(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Authentication required: no token provided');
        return;
      }
      const payload = verifyToken(token);
      orgId = payload.orgId;
      if (payload.type === 'device') {
        employeeId = payload.employeeId;
        isAdmin = false;
      } else if (payload.type === 'dashboard') {
        employeeId = payload.userId;
        isAdmin = true;
      }
    } catch (err) {
      ws.close(4002, 'Authentication failed: invalid or expired token');
      return;
    }

    clients.set(ws, { ws, orgId, employeeId, isAdmin });

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
      if (client?.employeeId && client?.orgId) {
        // Notify admins in the same org that employee went offline
        broadcastToAdmins(client.orgId, {
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
      // Employee or admin registering — use JWT-verified values, not self-reported
      client.employeeName = message.employeeName;

      console.log(`👤 ${client.employeeName} (${client.employeeId}) registered [org: ${client.orgId}]`);

      // Notify admins about new online employee
      if (!client.isAdmin) {
        broadcastToAdmins(client.orgId!, {
          type: 'employee:online',
          data: {
            employeeId: client.employeeId,
            employeeName: client.employeeName,
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
        await createTimeEntry(client.orgId!, message.entry);
      } catch (err) {
        console.error('Error saving time entry:', err);
      }

      // Broadcast to admins in the same org
      broadcastToAdmins(client.orgId!, {
        type: 'time-entry:started',
        data: {
          employeeId: client.employeeId,
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
        await updateTimeEntry(client.orgId!, message.entry.id, {
          endTime: message.entry.endTime,
          duration: message.entry.duration,
          idleTime: message.entry.idleTime
        });
      } catch (err) {
        console.error('Error updating time entry:', err);
      }

      // Broadcast to admins in the same org
      broadcastToAdmins(client.orgId!, {
        type: 'time-entry:stopped',
        data: {
          employeeId: client.employeeId,
          employeeName: client.employeeName,
          entry: message.entry,
          timestamp: new Date().toISOString()
        }
      });
      break;

    case 'time-entries':
      // Batch sync from desktop app (activities, not time entries)
      console.log(`📤 ${client.employeeName} synced ${message.entries?.length || 0} activities`);

      if (message.entries && Array.isArray(message.entries)) {
        let successCount = 0;
        let errorCount = 0;
        let lastError: string | null = null;

        for (const entry of message.entries) {
          try {
            // Check if activity already exists
            const existing = await getActivityById(client.orgId!, entry.id);

            if (existing) {
              await updateActivity(client.orgId!, entry.id, entry);
            } else {
              await createActivity(client.orgId!, entry);
            }
            successCount++;
          } catch (err: any) {
            console.error('Error syncing activity:', err);
            errorCount++;
            lastError = err.message || 'Unknown error';
          }
        }

        // Send response back to client
        ws.send(JSON.stringify({
          type: 'sync:response',
          data: {
            success: errorCount === 0,
            successCount,
            errorCount,
            message: errorCount > 0
              ? `Synced ${successCount} activities, ${errorCount} failed. Last error: ${lastError}`
              : `Successfully synced ${successCount} activities`
          }
        }));

        // Notify admins
        if (successCount > 0) {
          broadcastToAdmins(client.orgId!, {
            type: 'sync:completed',
            data: {
              employeeId: client.employeeId,
              employeeName: client.employeeName,
              count: successCount,
              timestamp: new Date().toISOString()
            }
          });
        }
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

function broadcastToAdmins(orgId: string, message: any): void {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.isAdmin && client.orgId === orgId && client.ws.readyState === WebSocket.OPEN) {
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