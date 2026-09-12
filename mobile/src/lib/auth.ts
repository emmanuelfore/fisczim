import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = ''; // Will be set from env

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

class AuthClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private user: AuthUser | null = null;
  private listeners: Set<(user: AuthUser | null) => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private async loadFromStorage() {
    try {
      const accessToken = await SecureStore.getItemAsync('access_token');
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      const userStr = await AsyncStorage.getItem('auth_user');

      if (accessToken) this.accessToken = accessToken;
      if (refreshToken) this.refreshToken = refreshToken;
      if (userStr) this.user = JSON.parse(userStr);
    } catch (error) {
      console.error('[Auth] Failed to load from storage:', error);
    }
  }

  private async saveToStorage() {
    try {
      if (this.accessToken) {
        await SecureStore.setItemAsync('access_token', this.accessToken);
      } else {
        await SecureStore.deleteItemAsync('access_token');
      }

      if (this.refreshToken) {
        await SecureStore.setItemAsync('refresh_token', this.refreshToken);
      } else {
        await SecureStore.deleteItemAsync('refresh_token');
      }

      if (this.user) {
        await AsyncStorage.setItem('auth_user', JSON.stringify(this.user));
      } else {
        await AsyncStorage.removeItem('auth_user');
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

  async register(email: string, password: string, name: string): Promise<AuthTokens> {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data: AuthTokens = await response.json();
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.user = data.user;
    await this.saveToStorage();
    this.notifyListeners();

    return data;
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data: AuthTokens = await response.json();
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.user = data.user;
    await this.saveToStorage();
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
    await this.saveToStorage();
    this.notifyListeners();
  }

  async refreshTokens(): Promise<AuthTokens | null> {
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
        await this.logout();
        return null;
      }

      const data: AuthTokens = await response.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.user = data.user;
      await this.saveToStorage();
      this.notifyListeners();

      return data;
    } catch (error) {
      console.error('[Auth] Token refresh error:', error);
      await this.logout();
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
      await this.saveToStorage();
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
