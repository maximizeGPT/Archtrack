import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import type { Employee } from '@archtrack/shared';

interface Activity {
  id: string;
  employeeId: string;
  appName: string;
  windowTitle: string;
  category: string;
  categoryName: string;
  productivityScore: number;
  productivityLevel: string;
  isSuspicious: boolean;
  suspiciousReason?: string;
  isIdle: boolean;
  timestamp: string;
}

interface EmployeeActivity {
  employeeId: string;
  employeeName: string;
  currentActivity?: string;
  currentCategory?: string;
  productivityScore: number;
  hoursToday: number;
  suspiciousActivityCount: number;
  isIdle?: boolean;
}

interface DashboardStats {
  totalEmployees: number;
  activeProjects: number;
  totalHoursToday: number;
  totalHoursThisWeek: number;
  productivityBreakdown: {
    coreWork: number;
    communication: number;
    researchLearning: number;
    planningDocs: number;
    breakIdle: number;
    entertainment: number;
    socialMedia: number;
    shoppingPersonal: number;
    other: number;
  };
  averageProductivityScore: number;
  suspiciousActivityCount: number;
  focusTimeMinutes: number;
  distractedTimeMinutes: number;
  recentActivities: Activity[];
  employeeActivity: EmployeeActivity[];
}

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const { onlineEmployees, recentActivity: _recentActivity } = useWebSocket();

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, employeesRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/employees')
      ]);

      const statsData = await statsRes.json();
      const employeesData = await employeesRes.json();

      if (statsData.success) setStats(statsData.data);
      if (employeesData.success) setEmployees(employeesData.data);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  const getProductivityColor = (score: number) => {
    if (score >= 80) return '#27ae60';
    if (score >= 60) return '#f39c12';
    if (score >= 40) return '#e67e22';
    return '#e74c3c';
  };

  const getProductivityIcon = (level: string) => {
    switch (level) {
      case 'productive': return '🟢';
      case 'idle': return '💤';
      case 'unproductive': return '🔴';
      default: return '🟡';
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>Real-time team productivity monitoring</p>
      </header>

      {/* Alert Banner for Suspicious Activity */}
      {stats && stats.suspiciousActivityCount > 0 && (
        <div style={styles.alertBanner}>
          ⚠️ {stats.suspiciousActivityCount} suspicious activities detected today
        </div>
      )}

      <div style={styles.grid}>
        {/* Key Stats */}
        <div style={styles.statsGrid}>
          <StatCard
            title="Team Productivity"
            value={`${stats?.averageProductivityScore || 0}%`}
            icon="📊"
            color={getProductivityColor(stats?.averageProductivityScore || 0)}
          />
          <StatCard
            title="Focus Time Today"
            value={(() => {
              const minutes = stats?.focusTimeMinutes || 0;
              if (minutes < 60) return `${minutes}m`;
              return `${Math.round(minutes / 60 * 10) / 10}h`;
            })()}
            icon="🎯"
            color="#27ae60"
          />
          <StatCard
            title="Idle/Wasted Time"
            value={(() => {
              const minutes = stats?.distractedTimeMinutes || 0;
              if (minutes < 60) return `${minutes}m`;
              return `${Math.round(minutes / 60 * 10) / 10}h`;
            })()}
            icon="💤"
            color="#e74c3c"
          />
          <StatCard
            title="Suspicious Activity"
            value={stats?.suspiciousActivityCount || 0}
            icon="⚠️"
            color={stats?.suspiciousActivityCount ? '#e74c3c' : '#95a5a6'}
          />
        </div>

        {/* Employee Activity */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>👥 Employee Activity</h2>
          <div style={styles.employeeGrid}>
            {employees.map(emp => {
              const empActivity = stats?.employeeActivity?.find(e => e.employeeId === emp.id);
              const online = onlineEmployees.has(emp.id);

              return (
                <div key={emp.id} style={styles.employeeCard(online, empActivity?.isIdle)}>
                  <div style={styles.employeeHeader}>
                    <span style={styles.statusIndicator(online)} />
                    <span style={styles.employeeName}>{emp.name}</span>
                    {empActivity?.suspiciousActivityCount ? (
                      <span style={styles.suspiciousBadge}>
                        {empActivity.suspiciousActivityCount} ⚠️
                      </span>
                    ) : online ? (
                      <span style={styles.onlineBadge}>ONLINE</span>
                    ) : null}
                  </div>

                  {empActivity ? (
                    <>
                      <div style={styles.currentActivity}>
                        {getProductivityIcon(empActivity.currentCategory === 'break_idle' ? 'idle' : 'productive')}
                        {' '}
                        {empActivity.currentActivity || 'Unknown activity'}
                      </div>
                      <div style={styles.categoryTag(empActivity.currentCategory)}>
                        {empActivity.currentCategory || 'Unknown'}
                      </div>
                      <div style={styles.productivityBar}>
                        <div
                          style={styles.productivityFill(empActivity.productivityScore)}
                        />
                        <span style={styles.productivityText}>
                          {empActivity.productivityScore}% productive
                        </span>
                      </div>
                      <div style={styles.employeeMeta}>
                        {empActivity.hoursToday}h today • {emp.department}
                      </div>
                    </>
                  ) : (
                    <div style={styles.noActivity}>No activity today</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Time Breakdown */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>⏱️ Time Breakdown (Today)</h2>
          <div style={styles.breakdownGrid}>
            <BreakdownItem
              label="Core Work"
              minutes={stats?.productivityBreakdown?.coreWork || 0}
              color="#27ae60"
            />
            <BreakdownItem
              label="Communication"
              minutes={stats?.productivityBreakdown?.communication || 0}
              color="#3498db"
            />
            <BreakdownItem
              label="Research & Learning"
              minutes={stats?.productivityBreakdown?.researchLearning || 0}
              color="#9b59b6"
            />
            <BreakdownItem
              label="Planning & Docs"
              minutes={stats?.productivityBreakdown?.planningDocs || 0}
              color="#1abc9c"
            />
            <BreakdownItem
              label="Break/Idle"
              minutes={stats?.productivityBreakdown?.breakIdle || 0}
              color="#95a5a6"
            />
            <BreakdownItem
              label="Entertainment"
              minutes={stats?.productivityBreakdown?.entertainment || 0}
              color="#e74c3c"
            />
            <BreakdownItem
              label="Social Media"
              minutes={stats?.productivityBreakdown?.socialMedia || 0}
              color="#e67e22"
            />
            <BreakdownItem
              label="Shopping/Personal"
              minutes={stats?.productivityBreakdown?.shoppingPersonal || 0}
              color="#f39c12"
            />
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📡 Live Activity Feed</h2>
          <div style={styles.activityList}>
            {stats?.recentActivities?.length === 0 ? (
              <p style={styles.emptyText}>No recent activity. Employees need to start the desktop tracker.</p>
            ) : (
              stats?.recentActivities?.slice(0, 20).map((activity) => (
                <div
                  key={activity.id}
                  style={styles.activityItem(activity.isSuspicious, activity.isIdle)}
                >
                  <div style={styles.activityHeader}>
                    <span style={styles.activityIcon}>
                      {getProductivityIcon(activity.productivityLevel)}
                    </span>
                    <span style={styles.activityApp}>{activity.appName}</span>
                    <span style={styles.activityCategory(activity.category)}>
                      {activity.categoryName}
                    </span>
                    <span style={styles.activityTime}>
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={styles.activityTitle}>{activity.windowTitle}</div>
                  {activity.isSuspicious && activity.suspiciousReason && (
                    <div style={styles.suspiciousReason}>
                      ⚠️ {activity.suspiciousReason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Suspicious Activity Log */}
        {stats?.recentActivities?.some(a => a.isSuspicious) && (
          <div style={{ ...styles.section, border: '2px solid #e74c3c' }}>
            <h2 style={{ ...styles.sectionTitle, color: '#e74c3c' }}>
              🚨 Suspicious Activity Log
            </h2>
            <div style={styles.suspiciousList}>
              {stats.recentActivities
                .filter(a => a.isSuspicious)
                .slice(0, 10)
                .map((activity) => (
                  <div key={activity.id} style={styles.suspiciousItem}>
                    <div style={styles.suspiciousHeader}>
                      <span style={styles.suspiciousApp}>{activity.appName}</span>
                      <span style={styles.suspiciousTime}>
                        {new Date(activity.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={styles.suspiciousTitle}>{activity.windowTitle}</div>
                    <div style={styles.suspiciousReasonText}>
                      {activity.suspiciousReason}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => (
  <div style={{ ...styles.statCard, borderLeftColor: color }}>
    <div style={styles.statIcon(color)}>{icon}</div>
    <div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      <div style={styles.statTitle}>{title}</div>
    </div>
  </div>
);

interface BreakdownItemProps {
  label: string;
  minutes: number;
  color: string;
}

const BreakdownItem: React.FC<BreakdownItemProps> = ({ label, minutes, color }) => {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return (
    <div style={styles.breakdownItem}>
      <div style={styles.breakdownLabel}>
        <span style={{ ...styles.breakdownDot, backgroundColor: color }} />
        {label}
      </div>
      <div style={styles.breakdownValue}>{hours}h</div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties | any } = {
  container: {
    padding: '32px'
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#666'
  },
  header: {
    marginBottom: '24px'
  },
  title: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: 0
  },
  subtitle: {
    fontSize: '16px',
    color: '#7f8c8d',
    marginTop: '4px'
  },
  alertBanner: {
    backgroundColor: '#fdf2f2',
    border: '1px solid #fee2e2',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
    fontWeight: 500
  },
  grid: {
    display: 'grid',
    gap: '24px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px'
  },
  statCard: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    borderLeft: '4px solid'
  },
  statIcon: (color: string) => ({
    fontSize: '32px',
    backgroundColor: `${color}20`,
    padding: '12px',
    borderRadius: '12px'
  }),
  statValue: {
    fontSize: '28px',
    fontWeight: 700
  },
  statTitle: {
    fontSize: '14px',
    color: '#7f8c8d'
  },
  section: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#2c3e50'
  },
  employeeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px'
  },
  employeeCard: (online: boolean, isIdle?: boolean) => ({
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: isIdle ? '#fff5f5' : online ? '#f0fff4' : '#f8f9fa',
    border: `2px solid ${isIdle ? '#e74c3c' : online ? '#27ae60' : '#e0e0e0'}`,
    transition: 'all 0.2s'
  }),
  employeeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  },
  statusIndicator: (online: boolean) => ({
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: online ? '#27ae60' : '#95a5a6'
  }),
  employeeName: {
    fontWeight: 600,
    fontSize: '16px',
    color: '#2c3e50',
    flex: 1
  },
  onlineBadge: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#27ae60',
    backgroundColor: '#d4edda',
    padding: '2px 8px',
    borderRadius: '4px'
  },
  suspiciousBadge: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#e74c3c',
    padding: '2px 8px',
    borderRadius: '4px'
  },
  currentActivity: {
    fontSize: '14px',
    color: '#2c3e50',
    marginBottom: '4px'
  },
  categoryTag: (category?: string) => ({
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    color: category === 'break_idle' ? '#e74c3c' :
          category === 'entertainment' ? '#e74c3c' :
          category === 'core_work' ? '#27ae60' :
          category === 'communication' ? '#3498db' : '#7f8c8d',
    backgroundColor: category === 'break_idle' ? '#fdf2f2' :
                     category === 'entertainment' ? '#fdf2f2' :
                     category === 'core_work' ? '#f0fff4' :
                     category === 'communication' ? '#ebf5fb' : '#f8f9fa',
    padding: '2px 8px',
    borderRadius: '4px',
    marginBottom: '8px'
  }),
  productivityBar: {
    position: 'relative',
    height: '20px',
    backgroundColor: '#ecf0f1',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '8px'
  },
  productivityFill: (score: number) => ({
    height: '100%',
    width: `${score}%`,
    backgroundColor: score >= 80 ? '#27ae60' : score >= 60 ? '#f39c12' : '#e74c3c',
    borderRadius: '10px',
    transition: 'width 0.3s'
  }),
  productivityText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '11px',
    fontWeight: 600,
    color: '#2c3e50'
  },
  employeeMeta: {
    fontSize: '12px',
    color: '#7f8c8d'
  },
  noActivity: {
    fontSize: '14px',
    color: '#95a5a6',
    fontStyle: 'italic'
  },
  breakdownGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px'
  },
  breakdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px'
  },
  breakdownLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#2c3e50'
  },
  breakdownDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%'
  },
  breakdownValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#2c3e50'
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  activityItem: (isSuspicious: boolean, isIdle: boolean) => ({
    padding: '12px',
    backgroundColor: isSuspicious ? '#fdf2f2' : isIdle ? '#f8f9fa' : '#fff',
    border: `1px solid ${isSuspicious ? '#fee2e2' : isIdle ? '#e0e0e0' : '#ecf0f1'}`,
    borderRadius: '8px',
    borderLeft: isSuspicious ? '4px solid #e74c3c' : isIdle ? '4px solid #95a5a6' : '4px solid #27ae60'
  }),
  activityHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px'
  },
  activityIcon: {
    fontSize: '14px'
  },
  activityApp: {
    fontWeight: 600,
    fontSize: '14px',
    color: '#2c3e50'
  },
  activityCategory: (category: string) => ({
    fontSize: '11px',
    fontWeight: 500,
    color: category === 'break_idle' ? '#e74c3c' :
          category === 'entertainment' ? '#e74c3c' :
          category === 'core_work' ? '#27ae60' :
          category === 'communication' ? '#3498db' : '#7f8c8d',
    backgroundColor: category === 'break_idle' ? '#fdf2f2' :
                     category === 'entertainment' ? '#fdf2f2' :
                     category === 'core_work' ? '#f0fff4' :
                     category === 'communication' ? '#ebf5fb' : '#f8f9fa',
    padding: '2px 6px',
    borderRadius: '4px'
  }),
  activityTime: {
    marginLeft: 'auto',
    fontSize: '12px',
    color: '#95a5a6'
  },
  activityTitle: {
    fontSize: '13px',
    color: '#555',
    marginLeft: '22px'
  },
  suspiciousReason: {
    fontSize: '12px',
    color: '#e74c3c',
    marginLeft: '22px',
    marginTop: '4px',
    fontWeight: 500
  },
  suspiciousList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  suspiciousItem: {
    padding: '12px',
    backgroundColor: '#fdf2f2',
    border: '1px solid #fee2e2',
    borderRadius: '8px'
  },
  suspiciousHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px'
  },
  suspiciousApp: {
    fontWeight: 600,
    color: '#2c3e50'
  },
  suspiciousTime: {
    fontSize: '12px',
    color: '#95a5a6'
  },
  suspiciousTitle: {
    fontSize: '13px',
    color: '#555',
    marginBottom: '4px'
  },
  suspiciousReasonText: {
    fontSize: '12px',
    color: '#e74c3c',
    fontWeight: 500
  },
  emptyText: {
    color: '#95a5a6',
    textAlign: 'center',
    padding: '20px'
  }
};
