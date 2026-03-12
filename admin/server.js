const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3001;

// In-memory storage for activities
const activitiesStore = new Map(); // employeeId -> activities array
const employeeStatus = new Map(); // employeeId -> last seen info

// Initial mock data for display
const employees = [
  { id: 'emp-001', name: 'Mohammed', email: 'mohammed@archfirm.com', status: 'online', currentProject: '-', lastActive: new Date().toISOString() },
  { id: 'emp-002', name: 'Ahmed', email: 'ahmed@archfirm.com', status: 'offline', currentProject: '-', lastActive: '2024-03-06T18:30:00Z' },
  { id: 'emp-003', name: 'Sarah', email: 'sarah@archfirm.com', status: 'offline', currentProject: '-', lastActive: '2024-03-06T18:30:00Z' }
];

// Load persisted data if exists
const DATA_FILE = path.join(__dirname, 'data', 'activities.json');
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (data.activities) {
        Object.entries(data.activities).forEach(([empId, acts]) => {
          activitiesStore.set(empId, acts);
        });
      }
      if (data.employeeStatus) {
        Object.entries(data.employeeStatus).forEach(([empId, status]) => {
          employeeStatus.set(empId, status);
        });
      }
      console.log('✓ Loaded persisted activity data');
    }
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

function saveData() {
  try {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const data = {
      activities: Object.fromEntries(activitiesStore),
      employeeStatus: Object.fromEntries(employeeStatus),
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save data:', err);
  }
}

// Save data periodically
setInterval(saveData, 30000);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// Receive activity data from desktop app
app.post('/api/activity', (req, res) => {
  try {
    const { employeeId, timestamp, activities } = req.body;
    
    if (!employeeId || !activities || !Array.isArray(activities)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: employeeId, activities' 
      });
    }
    
    // Store activities
    if (!activitiesStore.has(employeeId)) {
      activitiesStore.set(employeeId, []);
    }
    
    const empActivities = activitiesStore.get(employeeId);
    empActivities.push(...activities);
    
    // Keep only last 1000 activities per employee
    if (empActivities.length > 1000) {
      empActivities.splice(0, empActivities.length - 1000);
    }
    
    // Update employee status
    const lastActivity = activities[activities.length - 1];
    employeeStatus.set(employeeId, {
      lastSeen: timestamp,
      lastActivity: lastActivity,
      isOnline: true
    });
    
    // Update employee in list
    const emp = employees.find(e => e.id === employeeId);
    if (emp) {
      emp.status = 'online';
      emp.lastActive = timestamp;
      emp.currentProject = lastActivity?.categoryName || lastActivity?.project || '-';
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] Received ${activities.length} activities from ${employeeId}`);
    
    res.json({ 
      success: true, 
      received: activities.length,
      totalStored: empActivities.length
    });
  } catch (err) {
    console.error('Error processing activity:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get employees list
app.get('/api/employees', (req, res) => {
  // Update online status based on last seen
  const now = Date.now();
  employees.forEach(emp => {
    const status = employeeStatus.get(emp.id);
    if (status) {
      const lastSeen = new Date(status.lastSeen).getTime();
      const minutesSinceLastSeen = (now - lastSeen) / 60000;
      
      if (minutesSinceLastSeen > 2) {
        emp.status = 'offline';
        status.isOnline = false;
      } else {
        emp.status = 'online';
        emp.currentProject = status.lastActivity?.project || '-';
      }
    }
  });
  
  res.json({ success: true, data: employees });
});

// Get activities for specific employee
app.get('/api/activities/:employeeId', (req, res) => {
  const employeeActivities = activitiesStore.get(req.params.employeeId) || [];
  res.json({ success: true, data: employeeActivities });
});

// Dashboard stats
app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const now = Date.now();
  
  // Calculate project stats from real data
  const projectStats = {};
  const employeeHours = {};
  
  activitiesStore.forEach((acts, empId) => {
    const emp = employees.find(e => e.id === empId);
    const empName = emp ? emp.name : empId;
    
    acts.forEach(activity => {
      // Only count today's activities
      if (activity.timestamp && activity.timestamp.startsWith(today)) {
        const category = activity.categoryName || activity.project || 'Unknown';
        
        // Count 5 seconds per activity entry (since we sample every 5s)
        const duration = 5;
        
        projectStats[category] = (projectStats[category] || 0) + duration;
        
        if (!employeeHours[empName]) {
          employeeHours[empName] = {};
        }
        employeeHours[empName][category] = (employeeHours[empName][category] || 0) + duration;
      }
    });
  });
  
  // Update employee statuses
  employees.forEach(emp => {
    const status = employeeStatus.get(emp.id);
    if (status) {
      const lastSeen = new Date(status.lastSeen).getTime();
      const minutesSinceLastSeen = (now - lastSeen) / 60000;
      
      if (minutesSinceLastSeen > 2) {
        emp.status = 'offline';
      } else {
        emp.status = 'online';
        emp.currentProject = status.lastActivity?.project || '-';
        emp.lastActive = status.lastSeen;
      }
    }
  });
  
  // Calculate online count
  const onlineNow = employees.filter(e => e.status === 'online').length;
  
  res.json({
    success: true,
    data: {
      totalEmployees: employees.length,
      onlineNow,
      activeProjects: Object.keys(projectStats).length,
      projectStats,
      employeeHours,
      employees,
      lastUpdated: new Date().toISOString()
    }
  });
});

// Load data on startup
loadData();

app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     ArchTrack Admin Dashboard v2.0     ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /api/health        - Health check`);
  console.log(`  POST /api/activity      - Receive desktop app data`);
  console.log(`  GET  /api/dashboard     - Dashboard stats`);
  console.log(`  GET  /api/employees     - Employee list`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nSaving data...');
  saveData();
  process.exit(0);
});
