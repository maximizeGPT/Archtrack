import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDurationSeconds } from '../../../shared-types';

// Browser-tz-aware "today" so the date picker defaults match what the user
// sees on the Dashboard. The summary itself is computed in the org's
// timezone server-side; this is just a sensible default for the picker.
function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface EmployeeSummary {
  employeeId: string;
  employeeName: string;
  totalSeconds: number;
  productiveSeconds: number;
  unproductiveSeconds: number;
  neutralSeconds: number;
  idleSeconds: number;
  outsideHoursSeconds: number;
  productivityScore: number;
  topApps: Array<{ app: string; seconds: number; categoryName: string }>;
  suspiciousCount: number;
}

interface OrgSummary {
  orgId: string;
  orgName: string;
  date: string;
  timezone: string;
  generatedAt: string;
  employees: EmployeeSummary[];
  teamProductivityScore: number;
  teamTotalSeconds: number;
  teamProductiveSeconds: number;
}

const scoreColor = (n: number) =>
  n >= 80 ? '#27ae60' : n >= 60 ? '#f39c12' : '#e74c3c';

export const DailySummary: React.FC = () => {
  const { org } = useAuth();
  const [date, setDate] = useState<string>(todayLocal());
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/reports/daily-summary?date=${date}`);
      if (!res?.success) throw new Error(res?.error || 'Failed to load summary');
      setSummary(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const handleSendNow = async () => {
    setSendResult(null);
    setSending(true);
    try {
      const res = await api.post('/api/reports/daily-summary/send', { date });
      if (!res?.success) throw new Error(res?.error || 'Send failed');
      if (res.sent) {
        setSendResult(`✅ Sent to ${res.recipient}`);
      } else {
        setSendResult(`⚠️ Not sent: ${res.reason || 'unknown reason'}`);
      }
    } catch (e) {
      setSendResult(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Daily Summary</h1>
          <p style={styles.subtitle}>
            Per-employee productivity rollup for a single day. The same payload is sent as the daily email.
          </p>
        </div>
      </header>

      <div style={styles.controls}>
        <label style={{ fontSize: '13px', color: '#555', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Date:
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={styles.dateInput}
          />
        </label>
        <button onClick={load} disabled={loading} style={styles.btnPrimary}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button onClick={handleSendNow} disabled={sending} style={styles.btnGhost}>
          {sending ? 'Sending…' : 'Email this summary now'}
        </button>
        {sendResult && (
          <span style={{ fontSize: '12px', color: sendResult.startsWith('✅') ? '#27ae60' : '#e67e22' }}>
            {sendResult}
          </span>
        )}
      </div>

      {error && (
        <div style={styles.errorBanner}>⚠️ {error}</div>
      )}

      {summary && (
        <>
          <div style={styles.headerStats}>
            <Stat label="Team Productivity" value={`${summary.teamProductivityScore}%`} color={scoreColor(summary.teamProductivityScore)} />
            <Stat label="Total Tracked" value={formatDurationSeconds(summary.teamTotalSeconds)} color="#2c3e50" />
            <Stat label="Productive Time" value={formatDurationSeconds(summary.teamProductiveSeconds)} color="#27ae60" />
            <Stat label="Employees" value={`${summary.employees.length}`} color="#3498db" />
          </div>

          <div style={styles.tableWrap}>
            <div style={styles.tableHeader}>
              <div style={{ flex: 2 }}>Employee</div>
              <div style={{ width: '90px', textAlign: 'right' }}>Score</div>
              <div style={{ width: '110px', textAlign: 'right' }}>Total</div>
              <div style={{ width: '110px', textAlign: 'right' }}>Productive</div>
              <div style={{ width: '90px', textAlign: 'right' }}>Idle</div>
              <div style={{ flex: 3 }}>Top Apps</div>
            </div>
            {summary.employees.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#7f8c8d' }}>
                No employees yet. Add one from the Employees page.
              </div>
            )}
            {summary.employees.map(e => (
              <div key={e.employeeId} style={styles.tableRow}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontWeight: 600, color: '#2c3e50' }}>
                    {e.employeeName}
                    {e.suspiciousCount > 0 && (
                      <span style={styles.suspiciousBadge}>⚠️ {e.suspiciousCount}</span>
                    )}
                  </div>
                  {e.outsideHoursSeconds > 0 && (
                    <div style={{ fontSize: '11px', color: '#f39c12' }}>
                      {formatDurationSeconds(e.outsideHoursSeconds)} outside business hours (excluded)
                    </div>
                  )}
                </div>
                <div style={{ width: '90px', textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, fontSize: '20px', color: scoreColor(e.productivityScore) }}>
                    {e.productivityScore}%
                  </span>
                </div>
                <div style={{ width: '110px', textAlign: 'right', color: '#2c3e50' }}>
                  {formatDurationSeconds(e.totalSeconds)}
                </div>
                <div style={{ width: '110px', textAlign: 'right', color: '#27ae60' }}>
                  {formatDurationSeconds(e.productiveSeconds)}
                </div>
                <div style={{ width: '90px', textAlign: 'right', color: '#95a5a6' }}>
                  {formatDurationSeconds(e.idleSeconds)}
                </div>
                <div style={{ flex: 3, fontSize: '12px', color: '#555' }}>
                  {e.topApps.length === 0
                    ? <span style={{ color: '#bdc3c7' }}>No tracked apps</span>
                    : e.topApps.map(a => (
                        <div key={a.app}>
                          <strong>{a.app}</strong>{' '}
                          <span style={{ color: '#7f8c8d' }}>
                            ({a.categoryName} · {formatDurationSeconds(a.seconds)})
                          </span>
                        </div>
                      ))
                  }
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '12px', textAlign: 'center' as const }}>
            Generated for {summary.orgName} on {summary.date} ({summary.timezone}). Score formula: productive ÷ (productive + unproductive).
          </div>
        </>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={styles.statCard}>
    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#95a5a6', letterSpacing: '0.5px' }}>{label}</div>
    <div style={{ fontSize: '28px', fontWeight: 700, color, marginTop: '4px' }}>{value}</div>
  </div>
);

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '32px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '16px' },
  title: { fontSize: '28px', fontWeight: 600, color: '#2c3e50', margin: 0 },
  subtitle: { fontSize: '14px', color: '#7f8c8d', margin: '4px 0 0 0' },
  controls: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' as const },
  dateInput: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  btnPrimary: { padding: '9px 18px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  btnGhost: { padding: '9px 18px', backgroundColor: '#ecf0f1', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  errorBanner: { backgroundColor: '#fdf2f2', border: '1px solid #fee2e2', color: '#e74c3c', padding: '10px 12px', borderRadius: '6px', marginBottom: '12px' },
  headerStats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' },
  statCard: { backgroundColor: '#fff', padding: '18px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  tableHeader: { display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px', backgroundColor: '#fafbfc', fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#7f8c8d', borderBottom: '1px solid #eef' },
  tableRow: { display: 'flex', alignItems: 'flex-start', padding: '14px 16px', gap: '12px', borderBottom: '1px solid #f1f3f5', fontSize: '13px' },
  suspiciousBadge: { display: 'inline-block', marginLeft: '8px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#e74c3c', fontSize: '10px', fontWeight: 600 }
};
