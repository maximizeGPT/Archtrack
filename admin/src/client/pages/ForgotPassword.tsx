import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setResetUrl('');
    setIsSubmitting(true);

    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      setMessage(res.message || 'Check your email for a reset link.');
      if (res.resetUrl) {
        setResetUrl(res.resetUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <h1 style={styles.logo}>ArchTrack</h1>
          <p style={styles.subtitle}>Admin Dashboard</p>
        </div>

        <div style={styles.form}>
          <h2 style={styles.heading}>Reset Password</h2>

          {!message ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <p style={styles.description}>
                Enter your email and we'll generate a password reset link.
              </p>

              {error && <div style={styles.error}>{error}</div>}

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  style={styles.input}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{ ...styles.button, opacity: isSubmitting ? 0.7 : 1 }}
              >
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={styles.success}>{message}</div>

              {resetUrl && (
                <div style={styles.tokenBox}>
                  <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '13px' }}>Your reset link:</p>
                  <Link to={resetUrl} style={styles.resetLink}>
                    Click here to reset your password
                  </Link>
                </div>
              )}
            </div>
          )}

          <p style={styles.footerText}>
            <Link to="/login" style={styles.link}>Back to Sign In</Link>
          </p>
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
  logo: {
    color: '#fff',
    fontSize: '28px',
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '14px',
    margin: '4px 0 0',
  },
  form: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  heading: {
    fontSize: '22px',
    fontWeight: 600,
    color: '#2c3e50',
    margin: 0,
  },
  description: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
    lineHeight: '1.5',
  },
  error: {
    backgroundColor: '#fdf2f2',
    border: '1px solid #fee2e2',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
  },
  success: {
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#16a34a',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
  },
  tokenBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
  },
  resetLink: {
    color: '#3498db',
    fontWeight: 600,
    fontSize: '14px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#555',
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
  },
  button: {
    padding: '14px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  footerText: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  link: {
    color: '#3498db',
    textDecoration: 'none',
    fontWeight: 500,
  },
};
