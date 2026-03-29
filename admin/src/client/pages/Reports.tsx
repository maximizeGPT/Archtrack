import React, { useState, useEffect } from 'react';
import type { Employee, Activity } from '../../../shared-types';

const SUSPICIOUS_ACTIVITIES_PER_PAGE = 10;

export const Reports: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [_activities] = useState<Activity[]>([]);
  const [suspiciousPage, setSuspiciousPage] = useState(1);

  useEffect(() => {
    loadEmployees();
    // Set default date range (last 7 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const generateReport = async () => {
    if (!selectedEmployee || !startDate || !endDate) return;
    
    setLoading(true);
    setSuspiciousPage(1); // Reset pagination on new report
    try {
      const res = await fetch(
        `/api/reports/productivity?employeeId=${selectedEmployee}&startDate=${startDate}&endDate=${endDate}`
      );
      const data = await res.json();
      if (data.success) {
        setReport(data.data);
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  // Pagination for suspicious activities
  const paginatedSuspiciousActivities = report?.suspiciousActivities?.slice(
    (suspiciousPage - 1) * SUSPICIOUS_ACTIVITIES_PER_PAGE,
    suspiciousPage * SUSPICIOUS_ACTIVITIES_PER_PAGE
  ) || [];
  const totalSuspiciousPages = Math.ceil(
    (report?.suspiciousActivities?.length || 0) / SUSPICIOUS_ACTIVITIES_PER_PAGE
  );

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Reports</h1>
        <p style={styles.subtitle}>Generate productivity and activity reports</p>
      </header>

      <div style={styles.filters}>
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
          style={styles.select}
        >
          <option value="">Select Employee</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={styles.input}
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={styles.input}
        />

        <button
          onClick={generateReport}
          disabled={!selectedEmployee || loading}
          style={styles.button}
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {report && (
        <div style={styles.reportContainer}>
          <div style={styles.summaryCards}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Total Hours</h3>
              <p style={styles.cardValue}>{report.summary.totalHours}</p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Productive Hours</h3>
              <p style={{...styles.cardValue, color: '#27ae60'}}>
                {report.summary.productiveHours}
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Unproductive Hours</h3>
              <p style={{...styles.cardValue, color: '#e74c3c'}}>
                {report.summary.unproductiveHours}
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Productivity Score</h3>
              <p style={{...styles.cardValue, color: '#3498db'}}>
                {report.summary.averageProductivityScore}%
              </p>
            </div>
          </div>

          {report.suspiciousActivities.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                ⚠️ Suspicious Activities ({report.suspiciousActivities.length})
              </h3>
              <div style={styles.activityList}>
                {paginatedSuspiciousActivities.map((activity: Activity) => (
                  <div key={activity.id} style={styles.suspiciousActivity}>
                    <p style={styles.activityApp}>{activity.appName}</p>
                    <p style={styles.activityTitle}>{activity.windowTitle}</p>
                    <p style={styles.activityReason}>{activity.suspiciousReason}</p>
                    <p style={styles.activityTime}>
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
              {totalSuspiciousPages > 1 && (
                <div style={styles.pagination}>
                  <button
                    onClick={() => setSuspiciousPage(p => Math.max(1, p - 1))}
                    disabled={suspiciousPage === 1}
                    style={styles.paginationButton}
                  >
                    ← Prev
                  </button>
                  <span style={styles.paginationInfo}>
                    Page {suspiciousPage} of {totalSuspiciousPages}
                  </span>
                  <button
                    onClick={() => setSuspiciousPage(p => Math.min(totalSuspiciousPages, p + 1))}
                    disabled={suspiciousPage === totalSuspiciousPages}
                    style={styles.paginationButton}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Category Breakdown</h3>
            <div style={styles.categoryList}>
              {Object.entries(report.categoryBreakdown).map(([category, minutes]) => (
                <div key={category} style={styles.categoryItem}>
                  <span style={styles.categoryName}>{category}</span>
                  <span style={styles.categoryValue}>
                    {Math.round((minutes as number) / 60 * 10) / 10} hrs
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    '@media (max-width: 768px)': {
      padding: '16px'
    }
  } as React.CSSProperties,
  header: {
    marginBottom: '24px'
  },
  title: {
    fontSize: '28px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: 0
  },
  subtitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    margin: '8px 0 0 0'
  },
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    flexWrap: 'wrap',
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      gap: '8px'
    }
  } as React.CSSProperties,
  select: {
    padding: '10px 16px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    minWidth: '200px',
    '@media (max-width: 768px)': {
      minWidth: '100%',
      fontSize: '16px' // Prevent zoom on iOS
    }
  } as React.CSSProperties,
  input: {
    padding: '10px 16px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    '@media (max-width: 768px)': {
      fontSize: '16px', // Prevent zoom on iOS
      width: '100%'
    }
  } as React.CSSProperties,
  button: {
    padding: '10px 24px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500
  },
  reportContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr 1fr',
      gap: '8px'
    }
  } as React.CSSProperties,
  card: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    '@media (max-width: 768px)': {
      padding: '12px'
    }
  } as React.CSSProperties,
  cardTitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    margin: '0 0 8px 0'
  },
  cardValue: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: 0,
    '@media (max-width: 768px)': {
      fontSize: '24px'
    }
  } as React.CSSProperties,
  section: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: '0 0 16px 0'
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  suspiciousActivity: {
    padding: '12px',
    backgroundColor: '#fdf2f2',
    border: '1px solid #fee2e2',
    borderRadius: '8px'
  },
  activityApp: {
    fontWeight: 600,
    color: '#2c3e50',
    margin: '0 0 4px 0'
  },
  activityTitle: {
    fontSize: '14px',
    color: '#555',
    margin: '0 0 4px 0'
  },
  activityReason: {
    fontSize: '12px',
    color: '#e74c3c',
    margin: '0 0 4px 0'
  },
  activityTime: {
    fontSize: '12px',
    color: '#999',
    margin: 0
  },
  categoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px'
  },
  categoryName: {
    fontSize: '14px',
    color: '#2c3e50'
  },
  categoryValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#3498db'
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #eee'
  },
  paginationButton: {
    padding: '8px 16px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500
  },
  paginationInfo: {
    fontSize: '14px',
    color: '#666',
    fontWeight: 500
  }
};
