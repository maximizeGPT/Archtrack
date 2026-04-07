import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Employee } from '../../../shared-types';

interface ScreenshotRow {
  id: string;
  employeeId: string;
  timestamp: string;
  fileUrl: string;
  fileSizeBytes: number;
  width?: number;
  height?: number;
  appName?: string;
  windowTitle?: string;
  createdAt: string;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const Screenshots: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [date, setDate] = useState<string>(todayLocal());
  const [shots, setShots] = useState<ScreenshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<ScreenshotRow | null>(null);

  useEffect(() => {
    api.get('/api/employees').then(res => {
      if (res?.success) setEmployees(res.data);
    }).catch(() => { /* silent */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (employeeId) params.set('employeeId', employeeId);
      if (date) params.set('date', date);
      params.set('limit', '500');
      const res = await api.get(`/api/screenshots?${params.toString()}`);
      if (!res?.success) throw new Error(res?.error || 'Failed to load');
      setShots(res.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [employeeId, date]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (s: ScreenshotRow) => {
    if (!confirm('Delete this screenshot? This cannot be undone.')) return;
    try {
      const res = await api.delete(`/api/screenshots/${s.id}`);
      if (!res?.success) throw new Error(res?.error || 'Delete failed');
      setShots(shots.filter(x => x.id !== s.id));
      if (zoomed?.id === s.id) setZoomed(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const fmtTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString(); } catch { return ts; }
  };
  const fmtSize = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Screenshots</h1>
          <p style={styles.subtitle}>
            Periodic screenshots captured by the desktop tracker. Auto-deleted after the org's retention window.
            Enable / configure in Organization Settings.
          </p>
        </div>
      </header>

      <div style={styles.controls}>
        <select
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value)}
          style={styles.select}
        >
          <option value="">All employees</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555' }}>
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
      </div>

      {error && (
        <div style={styles.errorBanner}>⚠️ {error}</div>
      )}

      {!loading && shots.length === 0 && (
        <div style={styles.empty}>
          <div style={{ fontSize: '40px' }}>📷</div>
          <h3 style={{ margin: '12px 0 4px', color: '#2c3e50' }}>No screenshots yet</h3>
          <p style={{ color: '#7f8c8d', fontSize: '14px', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
            Turn on <strong>Periodic Screenshots</strong> in Organization Settings, then make sure your employees
            are running the latest desktop tracker. Captures appear here every few minutes.
          </p>
        </div>
      )}

      <div style={styles.grid}>
        {shots.map(s => {
          const emp = employees.find(e => e.id === s.employeeId);
          return (
            <div key={s.id} style={styles.card}>
              <button
                onClick={() => setZoomed(s)}
                style={styles.thumbBtn}
                aria-label="View full size"
              >
                <img src={s.fileUrl} alt="" style={styles.thumb} loading="lazy" />
              </button>
              <div style={styles.cardBody}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#2c3e50' }}>
                  {emp?.name || s.employeeId.slice(0, 8)}
                </div>
                <div style={{ fontSize: '11px', color: '#7f8c8d' }}>
                  {fmtTime(s.timestamp)} · {fmtSize(s.fileSizeBytes)}
                </div>
                {s.appName && (
                  <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '2px' }}>
                    {s.appName}
                  </div>
                )}
                <button
                  onClick={() => handleDelete(s)}
                  style={styles.deleteBtn}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {zoomed && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomed(null)}
          style={styles.lightbox}
        >
          <img
            src={zoomed.fileUrl}
            alt="Screenshot full size"
            style={styles.lightboxImg}
            onClick={e => e.stopPropagation()}
          />
          <div style={styles.lightboxMeta}>
            {fmtTime(zoomed.timestamp)} · {zoomed.appName || ''} · {zoomed.windowTitle || ''}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '32px' },
  header: { marginBottom: '20px' },
  title: { fontSize: '28px', fontWeight: 600, color: '#2c3e50', margin: 0 },
  subtitle: { fontSize: '14px', color: '#7f8c8d', margin: '4px 0 0 0' },
  controls: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' as const },
  select: { padding: '9px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', minWidth: '200px' },
  dateInput: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' },
  btnPrimary: { padding: '9px 18px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 },
  errorBanner: { backgroundColor: '#fdf2f2', border: '1px solid #fee2e2', color: '#e74c3c', padding: '10px 12px', borderRadius: '6px', marginBottom: '12px' },
  empty: { textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' },
  card: { backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  thumbBtn: { padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block' },
  thumb: { width: '100%', height: '140px', objectFit: 'cover', display: 'block', backgroundColor: '#f8f9fa' },
  cardBody: { padding: '10px 12px', borderTop: '1px solid #f1f3f5' },
  deleteBtn: { marginTop: '8px', padding: '6px 10px', fontSize: '11px', backgroundColor: '#fdf2f2', color: '#e74c3c', border: '1px solid #fee2e2', borderRadius: '4px', cursor: 'pointer', width: '100%' },
  lightbox: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px' },
  lightboxImg: { maxWidth: '95%', maxHeight: '85%', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' },
  lightboxMeta: { color: '#fff', fontSize: '12px', marginTop: '12px', opacity: 0.8 }
};
