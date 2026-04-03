import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.post('/api/auth/reset-password', { token, password });
      setMessage(res.message || 'Password has been reset.');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired reset link');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.logoSection}>
            <h1 style={styles.logo}>ArchTrack</h1>
          </div>
          <div style={styles.form}>
            <div style={styles.error}>Invalid reset link. No token provided.</div>
            <Link to="/forgot-password" style={styles.link}>Request a new reset link</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <h1 style={styles.logo}>ArchTrack</h1>
          <p style={styles.subtitle}>Admin Dashboard</p>
        </div>

        <div style={styles.form}>
          <h2 style={styles.heading}>Set New Password</h2>

          {message ? (
            <div>
              <div style={styles.success}>{message}</div>
              <p style={{ ...styles.footerText, marginTop: '16px' }}>
                <Link to="/login" style={styles.link}>Sign in with your new password</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {error && <div style={styles.error}>{error}</div>}

              <div style={styles.fieldGroup}>
                <label style={styles.label}>New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type it again"
                  required
                  style={styles.input}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{ ...styles.button, opacity: isSubmitting ? 0.7 : 1 }}
              >
                {isSubmitting ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f2f5',
    padding: '20px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '400px',
    overflow: 'hidden',
  },
  logoSection: {
    backgroundColor: '#2c3e50',
    padding: '32px',
    textAlign: 'center',
  },
  logo: { color: '#fff', fontSize: '28px', fontWeight: 700, margin: 0 },
  subtitle: { color: '#94a3b8', fontSize: '14px', margin: '4px 0 0' },
  form: { padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  heading: { fontSize: '22px', fontWeight: 600, color: '#2c3e50', margin: 0 },
  error: {
    backgroundColor: '#fdf2f2', border: '1px solid #fee2e2', color: '#e74c3c',
    padding: '12px 16px', borderRadius: '8px', fontSize: '14px',
  },
  success: {
    backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a',
    padding: '12px 16px', borderRadius: '8px', fontSize: '14px',
  },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 500, color: '#555' },
  input: { padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' },
  button: {
    padding: '14px', backgroundColor: '#27ae60', color: '#fff', border: 'none',
    borderRadius: '8px', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
  },
  footerText: { textAlign: 'center', fontSize: '14px', color: '#666', margin: 0 },
  link: { color: '#3498db', textDecoration: 'none', fontWeight: 500 },
};
