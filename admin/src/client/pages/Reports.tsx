import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Employee, Activity } from '../../../shared-types';
import {
  formatDurationSeconds,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_COLORS,
  CANONICAL_CATEGORY_ORDER
} from '../../../shared-types';

function getBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

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
      const data = await api.get('/api/employees');
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
      const tz = encodeURIComponent(getBrowserTz());
      const data = await api.get(
        `/api/reports/productivity?employeeId=${selectedEmployee}&startDate=${startDate}&endDate=${endDate}&tz=${tz}`
      );
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: '#555' }}>From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: '#555' }}>To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.input}
          />
        </div>

        <button
          onClick={generateReport}
          disabled={!selectedEmployee || loading}
          style={styles.button}
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {!report && !loading && (
        <div style={{
          textAlign: 'center' as const,
          padding: '48px 20px',
          backgroundColor: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📈</div>
          <p style={{ fontSize: '15px', color: '#7f8c8d', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.6' }}>
            Select an employee and date range, then click <strong>Generate Report</strong> to see productivity data.
          </p>
        </div>
      )}

      {report && (() => {
        const s = report.summary || {};
        // Prefer the new *_Seconds fields, fall back to *_Hours * 3600 for
        // backwards compatibility with older API responses.
        const totalSeconds       = s.totalSeconds        ?? Math.round((s.totalHours || 0) * 3600);
        const productiveSeconds  = s.productiveSeconds   ?? Math.round((s.productiveHours || 0) * 3600);
        const unproductiveSeconds = s.unproductiveSeconds ?? Math.round((s.unproductiveHours || 0) * 3600);
        const neutralSeconds     = s.neutralSeconds      ?? Math.round((s.neutralHours || 0) * 3600);
        const idleSeconds        = s.idleSeconds         ?? Math.round((s.idleHours || 0) * 3600);
        const outsideHoursSeconds = s.outsideHoursSeconds ?? 0;
        const score              = s.averageProductivityScore ?? 0;

        // Canonical category order, but only show categories with > 0 seconds.
        const rawBreakdown: Record<string, number> =
          report.categoryBreakdownSeconds ||
          Object.fromEntries(
            // legacy: minutes keyed by display name or canonical id
            Object.entries(report.categoryBreakdown || {}).map(([k, v]) => [
              k,
              Math.round(((v as number) || 0) * 60)
            ])
          );
        const orderedCategories = CANONICAL_CATEGORY_ORDER
          .filter(id => (rawBreakdown[id] || 0) > 0)
          .concat(
            // include any categories from the server we don't know about
            Object.keys(rawBreakdown).filter(k => !CANONICAL_CATEGORY_ORDER.includes(k) && (rawBreakdown[k] || 0) > 0)
          );

        return (
        <div style={styles.reportContainer}>
          <div style={styles.summaryCards}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Total Hours</h3>
              <p style={styles.cardValue}>{formatDurationSeconds(totalSeconds)}</p>
              <p style={{ fontSize: '11px', color: '#95a5a6', margin: '4px 0 0' }}>
                productive + idle + other
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Productive Hours</h3>
              <p style={{...styles.cardValue, color: '#27ae60'}}>
                {formatDurationSeconds(productiveSeconds)}
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Unproductive Hours</h3>
              <p style={{...styles.cardValue, color: '#e74c3c'}}>
                {formatDurationSeconds(unproductiveSeconds)}
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Productivity Score</h3>
              <p style={{...styles.cardValue, color: '#3498db'}}>{score}%</p>
              <p style={{ fontSize: '11px', color: '#95a5a6', margin: '4px 0 0' }}>
                productive ÷ (productive + unproductive)
              </p>
            </div>
          </div>

          {/* Reconciliation card — breaks down how the total was built so the
              admin can always see the math. */}
          <div style={{
            ...styles.section,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px'
          }}>
            <ReconcileCell label="Productive" seconds={productiveSeconds} color="#27ae60" />
            <ReconcileCell label="Unproductive" seconds={unproductiveSeconds} color="#e74c3c" />
            <ReconcileCell label="Other (neutral)" seconds={neutralSeconds} color="#bdc3c7" />
            <ReconcileCell label="Idle / Break" seconds={idleSeconds} color="#95a5a6" />
            <ReconcileCell label="Total" seconds={totalSeconds} color="#2c3e50" bold />
          </div>

          {/* Outside-business-hours card — only when BH are set for this employee. */}
          {report.hasBusinessHours && outsideHoursSeconds > 0 && (
            <div style={{
              ...styles.section,
              border: '1px dashed #f39c12',
              backgroundColor: '#fffaf0'
            }}>
              <h3 style={styles.sectionTitle}>🕘 Outside Business Hours</h3>
              <p style={{ fontSize: '14px', color: '#7f8c8d', margin: '0 0 8px' }}>
                {formatDurationSeconds(outsideHoursSeconds)} was tracked outside of this employee's
                configured working hours and is <strong>not</strong> counted in their total, productive,
                or productivity-score numbers above.
              </p>
            </div>
          )}

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
              {orderedCategories.length === 0 && (
                <div style={{ ...styles.categoryItem, justifyContent: 'center', color: '#95a5a6' }}>
                  No categorized activity in this range.
                </div>
              )}
              {orderedCategories.map((id) => {
                const seconds = rawBreakdown[id] || 0;
                const pct = totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0;
                const color = CATEGORY_COLORS[id] || '#bdc3c7';
                const label = CATEGORY_DISPLAY_NAMES[id] || id;
                return (
                  <div key={id} style={styles.categoryItem}>
                    <span style={{
                      ...styles.categoryName,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: color
                      }} />
                      {label}
                    </span>
                    <span style={styles.categoryValue}>
                      {formatDurationSeconds(seconds)}{' '}
                      <span style={{ color: '#95a5a6', fontWeight: 400, marginLeft: '6px' }}>
                        {pct}%
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

// Small cell used in the reconciliation grid.
const ReconcileCell: React.FC<{ label: string; seconds: number; color: string; bold?: boolean }> = ({ label, seconds, color, bold }) => (
  <div style={{
    padding: '10px 12px',
    backgroundColor: '#f8f9fa',
    borderLeft: `3px solid ${color}`,
    borderRadius: '6px'
  }}>
    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#7f8c8d', letterSpacing: '0.5px' }}>
      {label}
    </div>
    <div style={{ fontSize: '18px', fontWeight: bold ? 700 : 600, color: '#2c3e50', marginTop: '2px' }}>
      {formatDurationSeconds(seconds)}
    </div>
  </div>
);

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
