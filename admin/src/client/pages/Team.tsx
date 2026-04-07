import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// Multi-admin team management page.
//
// Backend: GET/POST/DELETE /api/auth/team — see admin/server/routes/auth-routes.ts.
//
// MVP: the owner picks an email + name + temporary password and shares
// those credentials with the new admin out-of-band. We don't send invite
// emails yet (no transactional email config beyond Resend, and Resend's
// onboarding sender doesn't accept arbitrary recipients on the free tier).

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin';
  created_at: string;
}

export const Team: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'owner'>('admin');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const res = await api.get('/api/auth/team');
      if (res.success) setUsers(res.data || []);
      else setError(res.error || 'Failed to load team');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName || invitePassword.length < 6) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/team', {
        email: inviteEmail,
        name: inviteName,
        password: invitePassword,
        role: inviteRole,
      });
      if (res.success) {
        setFlash(`Invited ${inviteEmail} as ${inviteRole}. Share the password securely — we don't email it for you yet.`);
        setTimeout(() => setFlash(null), 8000);
        setShowInvite(false);
        setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteRole('admin');
        load();
      } else {
        setError(res.error || 'Failed to invite');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to invite');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (u: TeamUser) => {
    if (u.id === user?.id) {
      alert("You can't remove yourself. Ask another admin to do it.");
      return;
    }
    if (!confirm(`Remove ${u.name} (${u.email}) from the organization? They will lose dashboard access immediately.`)) return;
    try {
      const res = await api.delete(`/api/auth/team/${u.id}`);
      if (res.success) load();
      else setError(res.error || 'Failed to remove user');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove user');
    }
  };

  if (loading) return <div style={styles.container}><p>Loading team…</p></div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={styles.title}>Team</h1>
            <p style={styles.subtitle}>Manage owner + admin dashboard access for your organization.</p>
          </div>
          <button onClick={() => setShowInvite(!showInvite)} style={styles.primaryBtn}>
            {showInvite ? 'Cancel' : '+ Invite admin'}
          </button>
        </div>
      </header>

      {flash && <div style={styles.flash}>✅ {flash}</div>}
      {error && <div style={styles.error}>⚠️ {error}</div>}

      {showInvite && (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Invite a new admin</h2>
          <form onSubmit={submit} style={styles.form}>
            <div style={styles.row}>
              <label style={styles.label}>
                Name
                <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} required style={styles.input} />
              </label>
              <label style={styles.label}>
                Email
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required style={styles.input} />
              </label>
            </div>
            <div style={styles.row}>
              <label style={styles.label}>
                Temporary password (≥ 6 chars — share securely)
                <input type="text" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} required minLength={6} style={styles.input} />
              </label>
              <label style={{ ...styles.label, width: '160px' }}>
                Role
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} style={styles.input}>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={submitting} style={styles.primaryBtn}>
              {submitting ? 'Inviting…' : 'Invite'}
            </button>
          </form>
        </section>
      )}

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>Active dashboard users ({users.length})</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Joined</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={styles.td}>
                  {u.name}
                  {u.id === user?.id && <span style={styles.youTag}>you</span>}
                </td>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}><span style={styles.roleTag(u.role)}>{u.role}</span></td>
                <td style={styles.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={styles.td}>
                  {u.id !== user?.id && (
                    <button onClick={() => remove(u)} style={styles.deleteBtn}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

const styles: { [key: string]: any } = {
  container: { padding: '32px' },
  header: { marginBottom: '24px' },
  title: { fontSize: '28px', fontWeight: 600, color: '#2c3e50', margin: 0 },
  subtitle: { fontSize: '14px', color: '#7f8c8d', marginTop: '8px' },
  primaryBtn: { padding: '10px 20px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  card: { backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '24px' },
  cardTitle: { fontSize: '18px', fontWeight: 600, color: '#2c3e50', marginTop: 0, marginBottom: '16px' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  row: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  label: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#2c3e50', flex: 1, minWidth: '200px' },
  input: { padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: '6px', fontSize: '14px', fontWeight: 400 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e0e6ed', fontSize: '12px', textTransform: 'uppercase', color: '#7f8c8d', fontWeight: 600 },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', color: '#2c3e50' },
  deleteBtn: { padding: '6px 12px', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  youTag: { marginLeft: '8px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 },
  roleTag: (role: string) => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    backgroundColor: role === 'owner' ? '#fef3c7' : '#e0e7ff',
    color: role === 'owner' ? '#92400e' : '#3730a3'
  }),
  flash: { backgroundColor: '#d4edda', color: '#155724', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
  error: { backgroundColor: '#fdf2f2', color: '#e74c3c', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' },
};
