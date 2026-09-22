import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from './env';
import {
  saveOfflineCredentials,
  verifyOfflineCredentials,
  verifyOfflinePin,
  getOfflineUsers as getCachedOfflineUsers,
} from './offlineAuth';

const API_URL = ''; // Will be set from env

function apiBase(): string {
  return (ENV?.apiBaseUrl || API_URL || '').replace(/\/+$/, '');
}

function isNetworkError(e: any): boolean {
  const msg = String(e?.message || e || '');
  return (
    msg.includes('Network request failed') ||
    msg.includes('Unable to reach server') ||
    msg.includes('Connection error') ||
    msg.includes('timed out') ||
    msg.includes('Aborted') ||
    e?.name === 'AbortError' ||
    e?.name === 'TypeError'
  );
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

class AuthClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private user: AuthUser | null = null;
  private offlineSession = false;
  private listeners: Set<(user: AuthUser | null) => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private async loadFromStorage() {
    try {
      const accessToken = await SecureStore.getItemAsync('access_token');
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      const userStr = await AsyncStorage.getItem('auth_user');
      const offlineFlag = await AsyncStorage.getItem('auth_offline_session');

      if (accessToken) this.accessToken = accessToken;
      if (refreshToken) this.refreshToken = refreshToken;
      if (userStr) this.user = JSON.parse(userStr);
      if (offlineFlag === '1' && this.user) this.offlineSession = true;
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
    return !!this.user && (!!this.accessToken || this.offlineSession);
  }

  isOfflineSession(): boolean {
    return this.offlineSession && !!this.user;
  }

  getOfflineUsers() {
    return getCachedOfflineUsers();
  }

  async register(email: string, password: string, name: string): Promise<AuthTokens> {
    const response = await fetch(`${apiBase()}/api/auth/register`, {
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
    this.offlineSession = false;
    try {
      await AsyncStorage.removeItem('auth_offline_session');
    } catch {}
    await this.saveToStorage();
    this.notifyListeners();
    saveOfflineCredentials(email, password, data.user).catch(() => {});

    return data;
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    // Online first with a bounded timeout; ALWAYS fall back to the offline vault
    // so terminals keep working during internet blips.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        response = await fetch(`${apiBase()}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        const data: AuthTokens = await response.json();
        this.accessToken = data.accessToken;
        this.refreshToken = data.refreshToken;
        this.user = data.user;
        this.offlineSession = false;
        await this.saveToStorage();
        this.notifyListeners();
        // Cache for future offline logins (non-blocking)
        saveOfflineCredentials(email, password, data.user).catch(() => {});
        return data;
      }

      // Online rejected (wrong password etc.) — still try offline before giving up,
      // the device may be on a captive portal / stale network.
      const offline = await verifyOfflineCredentials(email, password).catch(() => null);
      if (offline) return this.startOfflineSession(offline);
      const error = await response.json().catch(() => ({} as any));
      throw new Error((error as any)?.message || 'Login failed');
    } catch (e: any) {
      const offline = await verifyOfflineCredentials(email, password).catch(() => null);
      if (offline) return this.startOfflineSession(offline);
      if (isNetworkError(e)) {
        throw new Error('No connection. No offline profile found for this email — connect once to enable offline login.');
      }
      throw e;
    }
  }

  /** PIN is terminal-local — verify against the offline vault (works online or offline). */
  async loginWithPin(email: string, pin: string): Promise<AuthTokens> {
    const offline = await verifyOfflinePin(email, pin).catch(() => null);
    if (!offline) throw new Error('Invalid PIN or no offline profile cached');
    return this.startOfflineSession(offline);
  }

  private async startOfflineSession(user: any): Promise<AuthTokens> {
    this.user = {
      id: String(user.id),
      email: user.email,
      name: user.name || user.email?.split('@')[0] || 'Cashier',
      username: user.username || user.email,
      isSuperAdmin: user.isSuperAdmin,
    };
    this.offlineSession = true;
    try {
      await AsyncStorage.setItem('auth_user', JSON.stringify(this.user));
      await AsyncStorage.setItem('auth_offline_session', '1');
    } catch {}
    this.notifyListeners();
    return { accessToken: '', refreshToken: '', user: this.user };
  }

  async logout(): Promise<void> {
    try {
      if (this.refreshToken) {
        await fetch(`${apiBase()}/api/auth/logout`, {
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
    this.offlineSession = false;
    try {
      await AsyncStorage.removeItem('auth_offline_session');
    } catch {}
    await this.saveToStorage();
    this.notifyListeners();
  }

  async refreshTokens(): Promise<AuthTokens | null> {
    // Offline sessions have no refresh token — keep the cached user, don't log out.
    if (this.offlineSession && this.user) return null;
    if (!this.refreshToken) {
      console.warn('[Auth] No refresh token available');
      return null;
    }

    try {
      const response = await fetch(`${apiBase()}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        // Transient server error — keep session, retry later. Only logout on 401.
        if (response.status === 401) {
          console.error('[Auth] Token refresh rejected (401)');
          await this.logout();
        } else {
          console.warn(`[Auth] Token refresh returned ${response.status} — keeping session`);
        }
        return null;
      }

      const data: AuthTokens = await response.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.user = data.user;
      this.offlineSession = false;
      try {
        await AsyncStorage.removeItem('auth_offline_session');
      } catch {}
      await this.saveToStorage();
      this.notifyListeners();

      return data;
    } catch (error) {
      // Network failure — NOT a logout. Offline session keeps working.
      console.warn('[Auth] Token refresh network error — keeping session');
      return null;
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    // Offline sessions return the cached user without hitting the network.
    if (this.offlineSession && this.user) return this.user;
    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await fetch(`${apiBase()}/api/auth/me`, {
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

    const response = await fetch(`${apiBase()}/api/auth/change-password`, {
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
