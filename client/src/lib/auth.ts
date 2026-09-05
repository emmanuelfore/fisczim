const API_URL = import.meta.env.VITE_API_URL || '';

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
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
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
