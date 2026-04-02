import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
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

        <form onSubmit={handleSubmit} style={styles.form}>
          <h2 style={styles.heading}>Sign In</h2>

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

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={styles.input}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              ...styles.button,
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

          <p style={styles.footerText}>
            Don't have an account?{' '}
            <Link to="/signup" style={styles.link}>
              Create one
            </Link>
          </p>
        </form>
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
  error: {
    backgroundColor: '#fdf2f2',
    border: '1px solid #fee2e2',
    color: '#e74c3c',
    padding: '12px 16px',
    borderRadius: '8px',
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
    transition: 'border-color 0.2s',
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
    marginTop: '4px',
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
