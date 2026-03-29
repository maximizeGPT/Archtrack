import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Employees } from './pages/Employees';
import { Projects } from './pages/Projects';
import { Tasks } from './pages/Tasks';
import { Reports } from './pages/Reports';
import { GenesisAI } from './components/GenesisAI';
import { WebSocketProvider } from './contexts/WebSocketContext';
import './App.css';

type ConnectionStatus = 'loading' | 'connected' | 'disconnected';
type Page = 'dashboard' | 'employees' | 'projects' | 'tasks' | 'reports';

const AppContent: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('loading');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const location = useLocation();
  const navigate = useNavigate();

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
          <div className="mobile-logo">
            <h1>ArchTrack</h1>
            <span>Admin</span>
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
          <div className="logo">
            <h1>ArchTrack</h1>
            <span>Admin</span>
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
        </nav>
        
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
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
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
  <WebSocketProvider>
    <BrowserRouter>
      <AppContent />
      <GenesisAI />
    </BrowserRouter>
  </WebSocketProvider>
);

export default App;
