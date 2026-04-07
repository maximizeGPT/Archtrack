import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Employee } from '../../../shared-types';

// Per-org / per-employee classification overrides admin page.
//
// The 2026-04-07 audit caught the need: "Overflow Plumbing" is the user's
// uncle's actual business name, and the user has been editing the Wix site
// all evening. The server-side fixer caught the Wix admin pages generically,
// but couldn't classify the bare "Home | Overflow Plumbing & Drain" page
// because it doesn't match any global SaaS pattern. A per-org override
// ("anything containing 'Overflow Plumbing' = core_work, score 95") solves
// this without bloating the global classifier list.
//
// Backend: GET/POST/DELETE /api/overrides — see admin/server/routes.ts.

interface Override {
  id: string;
  org_id: string;
  employee_id: string | null;
  role_type: string | null;
  app_pattern: string;
  category: string;
  productivity_score: number;
  created_at: string;
}

const CATEGORY_OPTIONS: Array<{ value: string; label: string; defaultScore: number }> = [
  { value: 'core_work', label: 'Core Work', defaultScore: 95 },
  { value: 'communication', label: 'Communication', defaultScore: 70 },
  { value: 'research_learning', label: 'Research & Learning', defaultScore: 80 },
  { value: 'planning_docs', label: 'Planning & Docs', defaultScore: 85 },
  { value: 'break_idle', label: 'Break / Idle', defaultScore: 0 },
  { value: 'entertainment', label: 'Entertainment', defaultScore: 5 },
  { value: 'social_media', label: 'Social Media', defaultScore: 10 },
  { value: 'shopping_personal', label: 'Shopping / Personal', defaultScore: 15 },
  { value: 'other', label: 'Other', defaultScore: 30 },
];

export const Overrides: React.FC = () => {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Form state
  const [pattern, setPattern] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('__org__');
  const [category, setCategory] = useState('core_work');
  const [score, setScore] = useState(95);

  const load = async () => {
    try {
      setError(null);
      const [overridesRes, empRes] = await Promise.all([
        api.get('/api/overrides'),
        api.get('/api/employees'),
      ]);
      if (overridesRes.success) setOverrides(overridesRes.data || []);
      if (empRes.success) setEmployees(empRes.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overrides');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    const opt = CATEGORY_OPTIONS.find(o => o.value === cat);
    if (opt) setScore(opt.defaultScore);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/api/overrides', {
        appPattern: pattern.trim(),
        employeeId: employeeId === '__org__' ? null : employeeId,
        category,
        productivityScore: score,
      });
      if (res.success) {
        setPattern('');
        setEmployeeId('__org__');
        setCategory('core_work');
        setScore(95);
        setFlash(`Override added — new activities matching "${pattern.trim()}" will be classified as ${CATEGORY_OPTIONS.find(c => c.value === category)?.label}.`);
        setTimeout(() => setFlash(null), 6000);
        load();
      } else {
        setError(res.error || 'Failed to create override');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create override');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this override? Activities matching the pattern will go back to the default classifier.')) return;
    try {
      await api.delete(`/api/overrides/${id}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete override');
    }
  };

  const getEmployeeName = (id: string | null) => {
    if (!id) return 'All employees (org-wide)';
    return employees.find(e => e.id === id)?.name || `Unknown (${id.slice(0, 8)})`;
  };

  const getCategoryLabel = (value: string) =>
    CATEGORY_OPTIONS.find(o => o.value === value)?.label || value;

  if (loading) {
    return <div style={styles.container}><p>Loading overrides…</p></div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Classification Overrides</h1>
        <p style={styles.subtitle}>
          Tell ArchTrack how to classify apps and window titles that the global
          classifier doesn't recognize. Pattern matches are case-insensitive
          substring matches against the app name OR window title. Example:
          <code style={styles.code}>Overflow Plumbing</code> matches any window
          containing that text.
        </p>
      </header>

      {flash && <div style={styles.flash}>✅ {flash}</div>}
      {error && <div style={styles.errorBanner}>⚠️ {error}</div>}

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>Add a new override</h2>
        <form onSubmit={submit} style={styles.form}>
          <div style={styles.row}>
            <label style={styles.label}>
              Pattern (app name or window title contains)
              <input
                type="text"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                placeholder='e.g. "Overflow Plumbing" or "AutoCAD"'
                required
                style={styles.input}
              />
            </label>
          </div>
          <div style={styles.row}>
            <label style={{ ...styles.label, flex: 1 }}>
              Scope
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={styles.input}>
                <option value="__org__">All employees (org-wide)</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </label>
            <label style={{ ...styles.label, flex: 1 }}>
              Category
              <select value={category} onChange={e => handleCategoryChange(e.target.value)} style={styles.input}>
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label style={{ ...styles.label, width: '120px' }}>
              Score (0–100)
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={e => setScore(Number(e.target.value))}
                style={styles.input}
              />
            </label>
          </div>
          <button type="submit" disabled={submitting || !pattern.trim()} style={styles.submitBtn}>
            {submitting ? 'Adding…' : 'Add override'}
          </button>
        </form>
      </section>

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>Active overrides ({overrides.length})</h2>
        {overrides.length === 0 ? (
          <p style={styles.empty}>No overrides yet. Add one above to start customizing classification for your org.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Pattern</th>
                <th style={styles.th}>Scope</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Score</th>
                <th style={styles.th}>Created</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {overrides.map(o => (
                <tr key={o.id}>
                  <td style={styles.td}><code style={styles.code}>{o.app_pattern}</code></td>
                  <td style={styles.td}>{getEmployeeName(o.employee_id)}</td>
                  <td style={styles.td}>{getCategoryLabel(o.category)}</td>
                  <td style={styles.td}>{o.productivity_score}</td>
                  <td style={styles.td}>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td style={styles.td}>
                    <button onClick={() => remove(o.id)} style={styles.deleteBtn}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={styles.note}>
          ℹ️ Overrides apply to <strong>new activities only</strong>. Existing activity records keep their original classification.
        </p>
      </section>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 'clamp(16px, 4vw, 32px)' },
  header: { marginBottom: '24px' },
  title: { fontSize: '28px', fontWeight: 600, color: '#2c3e50', margin: 0 },
  subtitle: { fontSize: '14px', color: '#7f8c8d', marginTop: '8px', maxWidth: '760px', lineHeight: 1.5 },
  code: { backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '12px' },
  card: { backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '24px' },
  cardTitle: { fontSize: '18px', fontWeight: 600, color: '#2c3e50', marginTop: 0, marginBottom: '16px' },
  form: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  row: { display: 'flex', gap: '16px', flexWrap: 'wrap' as const },
  label: { display: 'flex', flexDirection: 'column' as const, gap: '6px', fontSize: '13px', fontWeight: 600, color: '#2c3e50', flex: 1, minWidth: '200px' },
  input: { padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: '6px', fontSize: '14px', fontWeight: 400 },
  submitBtn: { alignSelf: 'flex-start', padding: '10px 20px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, padding: '10px 12px', borderBottom: '2px solid #e0e6ed', fontSize: '12px', textTransform: 'uppercase' as const, color: '#7f8c8d', fontWeight: 600 },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', color: '#2c3e50' },
  deleteBtn: { padding: '6px 12px', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  empty: { color: '#95a5a6', fontStyle: 'italic' as const, margin: 0 },
  note: { fontSize: '12px', color: '#7f8c8d', marginTop: '16px', marginBottom: 0 },
  flash: { backgroundColor: '#d4edda', color: '#155724', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
  errorBanner: { backgroundColor: '#fdf2f2', color: '#e74c3c', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
};
