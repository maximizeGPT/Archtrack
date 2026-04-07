import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { initDatabase } from './database.js';
import { setupRoutes } from './routes.js';
import { setupWebSocket } from './websocket.js';
import aiRoutes from './routes/ai-routes.js';
import aiLLMRoutes from './routes/ai-routes-llm.js';
import { setupAuthRoutes } from './routes/auth-routes.js';
import { setupOrgRoutes } from './routes/org-routes.js';
import { setupSummaryScreenshotRoutes } from './routes/summary-screenshot-routes.js';
import { startDailySummaryScheduler } from './daily-summary.js';
import { startScreenshotRetentionScheduler } from './screenshot-retention.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Enterprise-grade health check endpoint (before static files)
app.get('/api/health', async (req, res) => {
  try {
    // Check database
    const db = await initDatabase();
    const employeeCount = await db.get('SELECT COUNT(*) as count FROM employees');
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      employees: employeeCount?.count || 0,
      version: '1.0.0'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      error: String(error),
      timestamp: new Date().toISOString()
    });
  }
});

// Find static files with fallback paths
function findStaticPath(): string {
  const possiblePaths = [
    // Production: server is at admin/dist/server/, client at admin/dist/client/
    path.join(__dirname, '../client'),
    // Alternative: server at dist/server/, client at dist/client/
    path.join(__dirname, '../../dist/client'),
    // Development: client at admin/dist/client/
    path.join(__dirname, '../../admin/dist/client'),
    // Absolute fallback
    '/opt/archtrack/admin/dist/client',
    '/opt/archtrack/dist/client'
  ];
  
  for (const staticPath of possiblePaths) {
    if (fs.existsSync(path.join(staticPath, 'index.html'))) {
      console.log(`✅ Found static files at: ${staticPath}`);
      return staticPath;
    }
  }
  
  // Default to first option and log warning
  console.warn(`⚠️  No static files found in expected locations, using default: ${possiblePaths[0]}`);
  console.warn('Expected one of:', possiblePaths);
  return possiblePaths[0];
}

// Initialize database and start server
async function startServer() {
  try {
    console.log('🏢 ArchTrack Enterprise Server Starting...');
    console.log(`📁 Server location: ${__dirname}`);
    
    // Step 1: Initialize database
    console.log('🔄 Initializing database...');
    const db = await initDatabase();
    console.log('✅ Database initialized successfully');
    
    // Verify database has data
    const employeeCount = await db.get('SELECT COUNT(*) as count FROM employees');
    console.log(`📊 Employees in database: ${employeeCount?.count || 0}`);
    
    // Step 2: Setup WebSocket
    console.log('🔌 Setting up WebSocket...');
    setupWebSocket(wss);
    console.log('✅ WebSocket ready');
    
    // Step 3: Setup API routes
    console.log('🛣️  Setting up API routes...');
    setupAuthRoutes(app);  // Auth routes first (signup/login are public)
    setupOrgRoutes(app);   // Organization settings + logo upload
    setupSummaryScreenshotRoutes(app); // Daily summary + screenshot endpoints
    setupRoutes(app);
    app.use('/api/ai', aiRoutes);
    app.use('/api/ai-llm', aiLLMRoutes);
    console.log('✅ API routes configured (including auth + LLM)');
    
    // Step 4: Find and serve static files
    const staticPath = findStaticPath();
    console.log(`📂 Serving static files from: ${staticPath}`);
    app.use(express.static(staticPath));

    // Serve user-uploaded files (company logos, etc.) from admin/data/uploads/.
    // This lives next to the SQLite db, so backups and migrations see both.
    const uploadsDir = path.join(__dirname, '../../data/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    console.log(`📎 Serving uploads from: ${uploadsDir}`);
    app.use('/uploads', express.static(uploadsDir, {
      maxAge: '1d',
      fallthrough: true
    }));
    
    // SPA fallback
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        const indexPath = path.join(staticPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).json({ 
            error: 'Dashboard not built',
            message: 'Client files not found. Run npm run build.',
            expectedPath: indexPath
          });
        }
      }
    });
    
    // Step 4b: Start daily summary scheduler (1-min tick).
    startDailySummaryScheduler();

    // Step 4c: Start screenshot retention scheduler (hourly tick, 30d default).
    startScreenshotRetentionScheduler();

    // Step 5: Start listening
    server.listen(PORT, () => {
      console.log('');
      console.log('🚀 ArchTrack Enterprise Server Running');
      console.log('=====================================');
      console.log(`📊 Dashboard: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
      console.log(`💓 Health:    http://localhost:${PORT}/api/health`);
      console.log(`👥 Employees: ${employeeCount?.count || 0}`);
      console.log('=====================================');
    });
    
  } catch (error) {
    console.error('');
    console.error('❌ FATAL: Server startup failed');
    console.error('=====================================');
    console.error(error);
    console.error('=====================================');
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Check database permissions: ls -la data/');
    console.error('2. Verify build: ls -la dist/client/');
    console.error('3. Check logs: pm2 logs archtrack');
    console.error('');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

startServer();
