import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const TOKEN_KEY = 'archtrack_token';
const REFRESH_TOKEN_KEY = 'archtrack_refresh_token';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Org {
  id: string;
  name: string;
  timezone?: string;
  logoUrl?: string | null;
  defaultCurrency?: string;
}

interface AuthContextValue {
  user: User | null;
  org: Org | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, orgName: string) => Promise<void>;
  logout: () => void;
  updateOrg: (patch: Partial<Org>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    setOrg(null);
  }, []);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.get('/api/auth/me');
      setUser(res.data.user);
      setOrg(res.data.org || null);
    } catch (err: any) {
      // api wrapper already attempted refresh on 401
      // If we still fail, log out
      logout();
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/auth/login', { email, password });
    const d = res.data;
    localStorage.setItem(TOKEN_KEY, d.accessToken);
    if (d.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, d.refreshToken);
    }
    setUser(d.user);
    setOrg(d.org || null);
  };

  const signup = async (email: string, password: string, name: string, orgName: string) => {
    // Include the browser's IANA timezone so the new org defaults to the
    // admin's actual timezone, not UTC.
    let timezone: string | undefined;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      timezone = undefined;
    }
    const res = await api.post('/api/auth/signup', { email, password, name, orgName, timezone });
    const d = res.data;
    localStorage.setItem(TOKEN_KEY, d.accessToken);
    if (d.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, d.refreshToken);
    }
    setUser(d.user);
    setOrg(d.org || null);
  };

  const updateOrg = useCallback((patch: Partial<Org>) => {
    setOrg(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        org,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        updateOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
