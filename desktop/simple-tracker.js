#!/usr/bin/env node
/**
 * ArchTrack Simple Tracker (Node.js only, no Electron)
 * Tracks activity and sends to server
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const CONFIG_PATH = path.join(os.homedir(), '.archtrack', 'config.json');
const QUEUE_PATH = path.join(os.homedir(), '.archtrack', 'queue.json');

// Default config - Update this to your deployed server URL
// Render: 'https://archtrack-admin.onrender.com'
// DigitalOcean: 'http://165.227.78.107:3001'
// Local: 'http://localhost:3001'
const DEFAULT_SERVER_URL = process.env.ARCHTRACK_SERVER_URL || 'https://archtrack-admin.onrender.com';

let config = {
  employeeId: 'emp-001',
  employeeName: 'Employee',
  serverUrl: DEFAULT_SERVER_URL
};

// Activity queue
let activities = [];
let lastActivity = null;

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      config = { ...config, ...saved };
    }
  } catch (err) {
    console.error('Failed to load config:', err.message);
  }
}

// Save config
function saveConfig() {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save config:', err.message);
  }
}

// Load queue
function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_PATH)) {
      const data = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
      if (Array.isArray(data)) activities = data;
    }
  } catch (err) {
    console.error('Failed to load queue:', err.message);
  }
}

// Save queue
function saveQueue() {
  try {
    const dir = path.dirname(QUEUE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(activities));
  } catch (err) {
    console.error('Failed to save queue:', err.message);
  }
}

// Get active window (mock for now - would need active-win package)
async function getActiveWindow() {
  try {
    // Try to use active-win if available
    const { default: activeWin } = await import('active-win');
    const win = await activeWin();
    return {
      app: win.owner?.name || 'Unknown',
      title: win.title || 'Untitled'
    };
  } catch {
    // Fallback: just track that user is active
    return {
      app: 'Active',
      title: 'Working'
    };
  }
}

// Classify activity
function classifyActivity(app, title) {
  const lower = (app + ' ' + title).toLowerCase();
  
  if (lower.includes('slack') || lower.includes('teams') || lower.includes('zoom') || lower.includes('discord')) {
    return 'communication';
  }
  if (lower.includes('chrome') || lower.includes('safari') || lower.includes('firefox')) {
    if (lower.includes('youtube') || lower.includes('netflix') || lower.includes('twitch')) {
      return 'entertainment';
    }
    return 'research';
  }
  if (lower.includes('code') || lower.includes('terminal') || lower.includes('xcode')) {
    return 'core_work';
  }
  if (lower.includes('mail') || lower.includes('outlook')) {
    return 'communication';
  }
  return 'core_work';
}

// Record activity
async function recordActivity() {
  const now = Date.now();
  const window = await getActiveWindow();
  const category = classifyActivity(window.app, window.title);
  
  const activity = {
    id: `act-${now}`,
    employeeId: config.employeeId,
    timestamp: new Date(now).toISOString(),
    application: window.app,
    windowTitle: window.title,
    category: category,
    duration: 10 // seconds
  };
  
  // Don't duplicate if same as last
  if (lastActivity && 
      lastActivity.application === activity.application &&
      lastActivity.windowTitle === activity.windowTitle) {
    lastActivity.duration += 10;
    return;
  }
  
  activities.push(activity);
  lastActivity = activity;
  
  // Keep only last 1000 activities
  if (activities.length > 1000) {
    activities = activities.slice(-1000);
  }
  
  saveQueue();
  console.log(`[${new Date().toLocaleTimeString()}] ${window.app}: ${window.title} (${category})`);
}

// Sync to server
async function syncToServer() {
  if (activities.length === 0) return;
  
  try {
    const response = await fetch(`${config.serverUrl}/api/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities })
    });
    
    if (response.ok) {
      console.log(`✓ Synced ${activities.length} activities`);
      activities = [];
      saveQueue();
    } else {
      console.log(`✗ Sync failed: ${response.status}`);
    }
  } catch (err) {
    console.log(`✗ Offline: ${err.message}`);
  }
}

// Setup prompt
async function setup() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     ArchTrack Employee Setup           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  
  const readline = (await import('readline')).createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (prompt) => new Promise(resolve => readline.question(prompt, resolve));
  
  const name = await question('Your name: ');
  const id = await question('Employee ID (e.g., emp-001): ');
  
  config.employeeName = name || config.employeeName;
  config.employeeId = id || config.employeeId;
  
  saveConfig();
  readline.close();
  
  console.log('');
  console.log('✓ Setup complete!');
  console.log(`  Name: ${config.employeeName}`);
  console.log(`  ID: ${config.employeeId}`);
  console.log(`  Server: ${config.serverUrl}`);
  console.log('');
}

// Main
async function main() {
  loadConfig();
  loadQueue();
  
  // Check if first run
  if (!fs.existsSync(CONFIG_PATH)) {
    await setup();
  }
  
  console.log('╔════════════════════════════════════════╗');
  console.log('║     ArchTrack Tracker v2.0             ║');
  console.log('║  Press Ctrl+C to stop                  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`Employee: ${config.employeeName} (${config.employeeId})`);
  console.log(`Server: ${config.serverUrl}`);
  console.log('');
  
  // Track every 10 seconds
  setInterval(recordActivity, 10000);
  
  // Sync every 60 seconds
  setInterval(syncToServer, 60000);
  
  // Initial activity
  await recordActivity();
  
  console.log('✓ Tracking started...');
  console.log('');
}

main().catch(console.error);
