const API_URL = import.meta.env.VITE_API_URL || '';

// Helper: must check both the bridge and UA fallback (preload may not have injected yet)
function shouldClearElectronSession(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).electronAPI?.clearSessionOnLaunch) return true;
  // Fallback UA check for the narrow window before preload bridges
  try {
    return window.navigator.userAgent.toLowerCase().includes('electron/');
  } catch {
    return false;
  }
}

// In Electron, always start unauthenticated so the POS login page is shown on every launch.
// The offline IndexedDB cache (PIN credentials, products, customers) is preserved — ONLY user_cache is cleared.
function clearElectronSessionSync() {
  try {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_user');
    // Marker checked by use-auth.ts to skip the IndexedDB user_cache on first query
    sessionStorage.setItem('__electron_forced_logout', '1');
  } catch (_e) {
    // Ignore — storage may be unavailable in some edge cases
  }
  // Async: clear IndexedDB user_cache (preserves offline_credentials, companies_list, products, etc.)
  // Fire-and-forget — use-auth.ts will also await the marker before returning cached user
  import('./offline-db').then(({ clearCachedUser }) => clearCachedUser().catch(() => {})).catch(() => {});
}

if (shouldClearElectronSession()) {
  clearElectronSessionSync();
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  username: string;
  isSuperAdmin?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

class AuthClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private user: AuthUser | null = null;
  private listeners: Set<(user: AuthUser | null) => void> = new Set();

  constructor() {
    // If we detected a forced Electron logout but the bridge wasn't ready at module eval,
    // re-run the sync clear now that the constructor runs after preload
    if (shouldClearElectronSession()) {
      clearElectronSessionSync();
    }
    this.loadFromStorage();
    // Notify listeners asynchronously so subscribers registered after construction still get the event
    if (this.user) {
      Promise.resolve().then(() => this.notifyListeners());
    }
  }

  private loadFromStorage() {
    try {
      // Re-clear if this is an Electron launch — prevents stale tokens loaded after a race
      if (shouldClearElectronSession()) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('auth_user');
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;
        return;
      }
      const accessToken = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');
      const userStr = localStorage.getItem('auth_user');

      if (accessToken) this.accessToken = accessToken;
      if (refreshToken) this.refreshToken = refreshToken;
      if (userStr) this.user = JSON.parse(userStr);
    } catch (error) {
      console.error('[Auth] Failed to load from storage:', error);
    }
  }

  private saveToStorage() {
    try {
      if (this.accessToken) {
        localStorage.setItem('access_token', this.accessToken);
      } else {
        localStorage.removeItem('access_token');
      }

      if (this.refreshToken) {
        localStorage.setItem('refresh_token', this.refreshToken);
      } else {
        localStorage.removeItem('refresh_token');
      }

      if (this.user) {
        localStorage.setItem('auth_user', JSON.stringify(this.user));
      } else {
        localStorage.removeItem('auth_user');
      }
    } catch (error) {
      console.error('[Auth] Failed to save to storage:', error);
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.user));
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getUser(): AuthUser | null {
    return this.user;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && !!this.user;
  }

  async register(email: string, password: string, name: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data: AuthResponse = await response.json();
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.user = data.user;
    this.saveToStorage();
    try { sessionStorage.removeItem('__electron_forced_logout'); } catch {}
    this.notifyListeners();

    return data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data: AuthResponse = await response.json();
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.user = data.user;
    this.saveToStorage();
    try { sessionStorage.removeItem('__electron_forced_logout'); } catch {}
    this.notifyListeners();

    return data;
  }

  async logout(): Promise<void> {
    try {
      if (this.refreshToken) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      }
    } catch (error) {
      console.error('[Auth] Logout request failed:', error);
    }

    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.saveToStorage();
    this.notifyListeners();
  }

  async refreshTokens(): Promise<AuthResponse | null> {
    if (!this.refreshToken) {
      console.warn('[Auth] No refresh token available');
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        console.error('[Auth] Token refresh failed');
        this.logout();
        return null;
      }

      const data: AuthResponse = await response.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.user = data.user;
      this.saveToStorage();
      this.notifyListeners();

      return data;
    } catch (error) {
      console.error('[Auth] Token refresh error:', error);
      this.logout();
      return null;
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        // Try to refresh token
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          return this.user;
        }
        return null;
      }

      const data = await response.json();
      this.user = data.user;
      this.saveToStorage();
      this.notifyListeners();

      return this.user;
    } catch (error) {
      console.error('[Auth] Get current user error:', error);
      return null;
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Password change failed');
    }
  }
}

// Singleton instance
export const auth = new AuthClient();
