import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { initDatabase } from './database.js';
import { setupRoutes } from './routes.js';
import { setupWebSocket } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initDatabase();

// Setup WebSocket
setupWebSocket(wss);

// API routes (must come before static files)
setupRoutes(app);

// Serve static files from dist/client
// Use import.meta.url to get the correct path
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticPath = path.join(currentDir, '../dist/client');
console.log('Serving static files from:', staticPath);
app.use(express.static(staticPath));

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(staticPath, 'index.html'));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 ArchTrack Admin Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
});
