import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from './env';

function getApiUrl(): string {
  // ENV.apiBaseUrl may not be populated yet at module load time (env reads are async
  // on some devices). We read it lazily inside methods instead.
  return ENV.apiBaseUrl || '';
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
  private listeners: Set<(user: AuthUser | null) => void> = new Set();
  private _refreshPromise: Promise<AuthTokens | null> | null = null;

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

  /**
   * Store credentials securely so we can silently re-login if both tokens expire.
   * Only stored when user explicitly logs in (not on token refresh).
   */
  private async saveCachedCredentials(email: string, password: string) {
    try {
      await SecureStore.setItemAsync('cached_email', email);
      await SecureStore.setItemAsync('cached_password', password);
    } catch (error) {
      console.error('[Auth] Failed to cache credentials:', error);
    }
  }

  private async loadCachedCredentials(): Promise<{ email: string; password: string } | null> {
    try {
      const email = await SecureStore.getItemAsync('cached_email');
      const password = await SecureStore.getItemAsync('cached_password');
      if (email && password) return { email, password };
      return null;
    } catch {
      return null;
    }
  }

  private async clearCachedCredentials() {
    try {
      await SecureStore.deleteItemAsync('cached_email');
      await SecureStore.deleteItemAsync('cached_password');
    } catch {}
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
    const response = await fetch(`${getApiUrl()}/api/auth/register`, {
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
    const response = await fetch(`${getApiUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Login failed');
    }

    const data: AuthTokens = await response.json();
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.user = data.user;

    // Persist tokens + user profile
    await this.saveToStorage();

    // Cache credentials securely for silent re-login after token expiry
    await this.saveCachedCredentials(email, password);

    this.notifyListeners();
    return data;
  }

  /**
   * Silent background re-login using cached credentials.
   * Called automatically when the refresh token is also expired.
   * The user never sees a login screen — they stay in the POS.
   */
  async silentReLogin(): Promise<AuthTokens | null> {
    const creds = await this.loadCachedCredentials();
    if (!creds) {
      console.warn('[Auth] No cached credentials for silent re-login');
      return null;
    }

    try {
      console.log('[Auth] Attempting silent re-login in background...');
      const data = await this.login(creds.email, creds.password);
      console.log('[Auth] Silent re-login successful');
      return data;
    } catch (error) {
      console.error('[Auth] Silent re-login failed:', error);
      // Only clear credentials if the password itself is wrong (401), not network errors
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.refreshToken) {
        await fetch(`${getApiUrl()}/api/auth/logout`, {
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

    // On explicit logout, clear cached credentials too
    await this.clearCachedCredentials();
    await this.saveToStorage();
    this.notifyListeners();
  }

  async refreshTokens(): Promise<AuthTokens | null> {
    // Deduplicate concurrent refresh calls
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = this._doRefresh().finally(() => {
      this._refreshPromise = null;
    });
    return this._refreshPromise;
  }

  private async _doRefresh(): Promise<AuthTokens | null> {
    if (!this.refreshToken) {
      console.warn('[Auth] No refresh token — attempting silent re-login...');
      return this.silentReLogin();
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        console.warn('[Auth] Token refresh returned non-OK — attempting silent re-login...');
        // Don't logout — try silent re-login instead
        return this.silentReLogin();
      }

      const data: AuthTokens = await response.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.user = data.user;
      await this.saveToStorage();
      this.notifyListeners();

      console.log('[Auth] Token refreshed successfully');
      return data;
    } catch (error) {
      console.error('[Auth] Token refresh network error:', error);
      // Network error: don't clear session — device might be offline
      // Just return null so the caller can decide what to do
      return null;
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/auth/me`, {
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

    const response = await fetch(`${getApiUrl()}/api/auth/change-password`, {
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

    // Update cached credentials with new password
    const cachedEmail = (await this.loadCachedCredentials())?.email;
    if (cachedEmail) {
      await this.saveCachedCredentials(cachedEmail, newPassword);
    }
  }
}

// Singleton instance
export const auth = new AuthClient();
