// ArchTrack Desktop App Configuration
// Update this file to change the server URL for all desktop trackers

export const ARCHTRACK_CONFIG = {
  // Server URL - Change this to your deployed server URL
  // Examples:
  // - Render: 'https://archtrack-admin.onrender.com'
  // - DigitalOcean: 'http://165.227.78.107:3001'
  // - Local: 'http://localhost:3001'
  serverUrl: 'http://165.227.78.107:3001',
  
  // Default employee settings (can be overridden per installation)
  defaults: {
    employeeId: 'emp-001',
    employeeName: 'Employee'
  },
  
  // Sync settings
  sync: {
    intervalMs: 30000,      // Sync every 30 seconds
    batchSize: 100,         // Max activities per batch
    retryDelayMs: 60000     // Retry after 1 minute on failure
  },
  
  // Tracking settings
  tracking: {
    checkIntervalMs: 5000,  // Check active window every 5 seconds
    idleThresholdMs: 300000 // 5 minutes of no input = idle
  }
};

// Helper to get server URL (checks environment variable first)
export function getServerUrl(): string {
  return process.env.ARCHTRACK_SERVER_URL || ARCHTRACK_CONFIG.serverUrl;
}
