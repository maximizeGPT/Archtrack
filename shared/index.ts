// Shared types for ArchTrack

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'admin';
  department?: string;
  hourlyRate?: number;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  clientName?: string;
  status: 'active' | 'completed' | 'on-hold';
  startDate: string;
  endDate?: string;
  budget?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  taskId?: string;
  projectId?: string;
  description?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  isBillable?: boolean;
  idleTime?: number;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  employeeId: string;
  timestamp: string;
  appName: string;
  windowTitle: string;
  category: string;
  categoryName: string;
  productivityScore: number;
  productivityLevel: 'productive' | 'unproductive' | 'neutral' | 'idle';
  isSuspicious: boolean;
  suspiciousReason?: string;
  isIdle: boolean;
  idleTimeSeconds: number;
  durationSeconds: number;
  createdAt: string;
}

export interface ProductivityReport {
  employeeId: string;
  employeeName: string;
  dateRange: { start: string; end: string };
  summary: {
    totalHours: number;
    productiveHours: number;
    unproductiveHours: number;
    neutralHours: number;
    averageProductivityScore: number;
    focusScore: number;
  };
  categoryBreakdown: Record<string, number>;
  suspiciousActivities: Activity[];
  dailyTrend: Array<{
    date: string;
    productivityScore: number;
    productiveMinutes: number;
    unproductiveMinutes: number;
  }>;
}
