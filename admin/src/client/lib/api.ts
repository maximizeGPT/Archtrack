const TOKEN_KEY = 'archtrack_token';
const REFRESH_TOKEN_KEY = 'archtrack_refresh_token';

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return false;

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    if (data.data?.accessToken) {
      localStorage.setItem(TOKEN_KEY, data.data.accessToken);
      if (data.data.refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.data.refreshToken);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function tryRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = refreshToken().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

async function request<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401 && token) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = localStorage.getItem(TOKEN_KEY);
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || body.message || `Request failed: ${res.status}`);
    (error as any).status = res.status;
    (error as any).body = body;
    throw error;
  }

  return res.json();
}

export const api = {
  get<T = any>(url: string): Promise<T> {
    return request<T>(url, { method: 'GET' });
  },
  post<T = any>(url: string, body?: any): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },
  put<T = any>(url: string, body?: any): Promise<T> {
    return request<T>(url, {
      method: 'PUT',
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },
  delete<T = any>(url: string): Promise<T> {
    return request<T>(url, { method: 'DELETE' });
  },
};
