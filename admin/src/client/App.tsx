import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Employees } from './pages/Employees';
import { Projects } from './pages/Projects';
import { Tasks } from './pages/Tasks';
import { Reports } from './pages/Reports';
import { DailySummary } from './pages/DailySummary';
import { Screenshots } from './pages/Screenshots';
import { Overrides } from './pages/Overrides';
import { Team } from './pages/Team';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Download } from './pages/Download';
import { GenesisAI } from './components/GenesisAI';
import { OrgSettingsModal } from './components/OrgSettingsModal';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';

type ConnectionStatus = 'loading' | 'connected' | 'disconnected';
type Page = 'dashboard' | 'employees' | 'projects' | 'tasks' | 'reports' | 'summary' | 'screenshots' | 'overrides' | 'team';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f2f5',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: '#666', fontSize: '14px' }}>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showOrgSettings, setShowOrgSettings] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, org, user } = useAuth();

  // Get current page from URL
  const getCurrentPage = (): Page => {
    const path = location.pathname.slice(1) || 'dashboard';
    return (path as Page) || 'dashboard';
  };

  const currentPage = getCurrentPage();

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check API health with retry
  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch {
      setConnectionStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const handleNavClick = (page: Page) => {
    navigate(`/${page === 'dashboard' ? '' : page}`);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="app-container">
      {/* Mobile Header */}
      {isMobile && (
        <header className="mobile-header">
          <div
            className="mobile-logo"
            onClick={() => setShowOrgSettings(true)}
            role="button"
            tabIndex={0}
            aria-label="Open organization settings"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') setShowOrgSettings(true);
            }}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            {org?.logoUrl ? (
              <>
                <img
                  src={org.logoUrl}
                  alt={org.name || 'Organization logo'}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    objectFit: 'contain',
                    backgroundColor: 'rgba(255,255,255,0.08)'
                  }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={{ lineHeight: 1.1 }}>
                  <h1 style={{ margin: 0, fontSize: '16px' }}>{org.name || 'ArchTrack'}</h1>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>Admin</span>
                </div>
              </>
            ) : (
              <>
                <h1>ArchTrack</h1>
                <span>Admin</span>
              </>
            )}
          </div>
          <button
            className="mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </header>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isMobile ? 'mobile' : ''} ${isMobileMenuOpen ? 'open' : ''}`}>
        {!isMobile && (
          <div
            className="logo"
            onClick={() => setShowOrgSettings(true)}
            role="button"
            tabIndex={0}
            aria-label="Open organization settings"
            title="Click to edit organization settings"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') setShowOrgSettings(true);
            }}
            style={{ cursor: 'pointer' }}
          >
            {org?.logoUrl ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <img
                  src={org.logoUrl}
                  alt={org.name || 'Organization logo'}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    objectFit: 'contain',
                    backgroundColor: 'rgba(255,255,255,0.08)'
                  }}
                  onError={e => {
                    // If the image 404s (e.g. file was manually deleted on the
                    // server), fall back to the text logo gracefully.
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div>
                  <h1 style={{ margin: 0 }}>{org.name || 'ArchTrack'}</h1>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Admin</span>
                </div>
              </div>
            ) : (
              <>
                <h1>ArchTrack</h1>
                <span>Admin</span>
                {org?.name && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 400 }}>
                    {org.name}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <nav className="nav">
          <NavItem
            label="Dashboard"
            icon="📊"
            active={currentPage === 'dashboard'}
            onClick={() => handleNavClick('dashboard')}
          />
          <NavItem
            label="Employees"
            icon="👥"
            active={currentPage === 'employees'}
            onClick={() => handleNavClick('employees')}
          />
          <NavItem
            label="Projects"
            icon="📁"
            active={currentPage === 'projects'}
            onClick={() => handleNavClick('projects')}
          />
          <NavItem
            label="Tasks"
            icon="✓"
            active={currentPage === 'tasks'}
            onClick={() => handleNavClick('tasks')}
          />
          <NavItem
            label="Reports"
            icon="📈"
            active={currentPage === 'reports'}
            onClick={() => handleNavClick('reports')}
          />
          <NavItem
            label="Daily Summary"
            icon="📧"
            active={currentPage === 'summary'}
            onClick={() => handleNavClick('summary')}
          />
          <NavItem
            label="Screenshots"
            icon="📷"
            active={currentPage === 'screenshots'}
            onClick={() => handleNavClick('screenshots')}
          />
          <NavItem
            label="Overrides"
            icon="🏷️"
            active={currentPage === 'overrides'}
            onClick={() => handleNavClick('overrides')}
          />
          <NavItem
            label="Team"
            icon="🛡️"
            active={currentPage === 'team'}
            onClick={() => handleNavClick('team')}
          />
          {isMobile && (
            <NavItem
              label="Settings"
              icon="⚙️"
              active={false}
              onClick={() => {
                setShowOrgSettings(true);
                setIsMobileMenuOpen(false);
              }}
            />
          )}
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px' }}>
          <a
            href="https://github.com/maximizeGPT/Archtrack"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              width: '100%',
              padding: '10px',
              backgroundColor: 'rgba(52,152,219,0.08)',
              color: '#3498db',
              border: '1px solid rgba(52,152,219,0.2)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              textAlign: 'center' as const,
              textDecoration: 'none',
              marginBottom: '8px',
              boxSizing: 'border-box' as const,
            }}
          >
            Help
          </a>
          {user?.name && (
            <div style={{
              fontSize: '12px',
              color: '#94a3b8',
              textAlign: 'center' as const,
              marginBottom: '8px',
            }}>
              {user.name}
            </div>
          )}
          <button
            onClick={logout}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'rgba(231,76,60,0.1)',
              color: '#e74c3c',
              border: '1px solid rgba(231,76,60,0.2)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Sign Out
          </button>
        </div>

        <div className="connection-status">
          <span className={`status-dot ${connectionStatus}`} />
          {connectionStatus === 'loading' && 'Connecting...'}
          {connectionStatus === 'connected' && 'Connected'}
          {connectionStatus === 'disconnected' && 'Disconnected'}
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/summary" element={<DailySummary />} />
          <Route path="/screenshots" element={<Screenshots />} />
          <Route path="/overrides" element={<Overrides />} />
          <Route path="/team" element={<Team />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>

      {showOrgSettings && (
        <OrgSettingsModal onClose={() => setShowOrgSettings(false)} />
      )}
    </div>
  );
};

interface NavItemProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, icon, active, onClick }) => (
  <button
    onClick={onClick}
    className={`nav-item ${active ? 'active' : ''}`}
  >
    <span className="nav-icon">{icon}</span>
    <span className="nav-label">{label}</span>
  </button>
);

const App: React.FC = () => (
  <AuthProvider>
    <WebSocketProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPassword />
              </PublicRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PublicRoute>
                <ResetPassword />
              </PublicRoute>
            }
          />
          <Route
            path="/download"
            element={<Download />}
          />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppContent />
                <GenesisAI />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </WebSocketProvider>
  </AuthProvider>
);

export default App;
