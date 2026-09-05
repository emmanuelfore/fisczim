import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { generateTokens, verifyAccessToken, verifyRefreshToken, TokenPayload } from '../lib/jwt.js';

const router = Router();

// Store refresh tokens (in production, use Redis or database)
const refreshTokens = new Map<string, { userId: string; expiresAt: number }>();

// Supabase uses PBKDF2-SHA256 for password hashing
// Format: $pbkdf2-sha256$i=4096$<salt>$<hash>
function verifySupabasePassword(password: string, hash: string): boolean {
  try {
    if (!hash.startsWith('$pbkdf2-sha256$')) {
      return false;
    }

    const parts = hash.split('$');
    if (parts.length !== 5) return false;

    const iterations = parseInt(parts[2].split('=')[1], 10);
    const salt = parts[3];
    const storedHash = parts[4];

    const derivedKey = crypto.pbkdf2Sync(
      password,
      Buffer.from(salt, 'base64'),
      iterations,
      32,
      'sha256'
    );

    const derivedHash = derivedKey.toString('base64');
    return derivedHash === storedHash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

// Hybrid password verification - supports bcrypt, Supabase PBKDF2, plaintext, MD5, SHA256
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash || !password) return false;

  // 1. Plaintext match (legacy seeded test accounts e.g. "password123")
  if (hash === password) {
    return true;
  }

  // 2. Standard Bcrypt ($2a$, $2b$, $2y$)
  if (hash.startsWith('$2b$') || hash.startsWith('$2a$') || hash.startsWith('$2y$')) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
  
  // 3. Supabase PBKDF2 ($pbkdf2-sha256$)
  if (hash.startsWith('$pbkdf2-sha256$')) {
    return verifySupabasePassword(password, hash);
  }

  // 4. MD5 (32-character hex hash)
  if (hash.length === 32 && /^[0-9a-fA-F]{32}$/.test(hash)) {
    const md5Hash = crypto.createHash('md5').update(password).digest('hex');
    if (md5Hash.toLowerCase() === hash.toLowerCase()) {
      return true;
    }
  }

  // 5. SHA256 (64-character hex hash)
  if (hash.length === 64 && /^[0-9a-fA-F]{64}$/.test(hash)) {
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    if (sha256Hash.toLowerCase() === hash.toLowerCase()) {
      return true;
    }
  }

  // Fallback to bcrypt
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// Upgrade password to bcrypt
async function upgradePassword(userId: string, password: string): Promise<void> {
  const bcryptHash = await bcrypt.hash(password, 10);
  await storage.updateUser(userId, {
    password: bcryptHash,
    passwordChanged: false,
  });
  console.log(`[Auth] Upgraded password hash for user ${userId} to bcrypt`);
}

// Clean up expired refresh tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of refreshTokens.entries()) {
    if (data.expiresAt < now) {
      refreshTokens.delete(token);
    }
  }
}, 60 * 60 * 1000); // Clean up every hour

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate username from email
    const baseUsername = email.split('@')[0];
    let username = baseUsername;
    let counter = 1;

    while (true) {
      try {
        const existingByUsername = await storage.getUserByUsername(username);
        if (!existingByUsername) break;
        username = `${baseUsername}_${counter}`;
        counter++;
      } catch {
        break;
      }
    }

    // Create user
    const user = await storage.createUser({
      id: crypto.randomUUID(),
      email: email.trim(),
      password: hashedPassword,
      name,
      username,
      passwordChanged: true,
    });

    // Generate tokens
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
    };

    const tokens = generateTokens(payload);

    // Store refresh token
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    refreshTokens.set(tokens.refreshToken, { userId: user.id, expiresAt });

    // Return user data and tokens (exclude password)
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({
      user: userWithoutPassword,
      ...tokens,
    });
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    res.status(500).json({ message: 'Registration failed', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Get user by email (case-insensitive)
    let user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // If user's password in public.users is missing, attempt to sync from auth.users on-the-fly
    if (!user.password) {
      try {
        const [authUser] = await storage.getUserByEmail(user.email) ? await db.execute(sql`SELECT encrypted_password FROM auth.users WHERE id = ${user.id}`) : [];
        if (authUser && (authUser as any).encrypted_password) {
          const syncedPassword = (authUser as any).encrypted_password as string;
          await storage.updateUser(user.id, { password: syncedPassword });
          user.password = syncedPassword;
        }
      } catch (syncErr) {
        console.error('[Auth] On-the-fly password sync error:', syncErr);
      }
    }

    if (!user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password using hybrid verification (bcrypt, PBKDF2, plaintext, MD5, SHA256)
    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // If user password is not bcrypt (e.g. PBKDF2, plaintext, MD5), upgrade to bcrypt
    if (!user.password.startsWith('$2b$') && !user.password.startsWith('$2a$') && !user.password.startsWith('$2y$')) {
      try {
        await upgradePassword(user.id, password);
        const updatedUser = await storage.getUser(user.id);
        if (updatedUser && updatedUser.password) {
          user.password = updatedUser.password;
        }
      } catch (upgradeError) {
        console.error('[Auth] Failed to upgrade password hash:', upgradeError);
      }
    }

    // Generate tokens
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
    };

    const tokens = generateTokens(payload);

    // Store refresh token
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    refreshTokens.set(tokens.refreshToken, { userId: user.id, expiresAt });

    // Return user data and tokens (exclude password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      ...tokens,
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Check if refresh token exists in storage
    const storedToken = refreshTokens.get(refreshToken);
    if (!storedToken || storedToken.userId !== payload.userId) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Get user
    const user = await storage.getUser(payload.userId);
    if (!user) {
      refreshTokens.delete(refreshToken);
      return res.status(401).json({ message: 'User not found' });
    }

    // Generate new tokens
    const newPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
    };

    const tokens = generateTokens(newPayload);

    // Remove old refresh token and store new one
    refreshTokens.delete(refreshToken);
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    refreshTokens.set(tokens.refreshToken, { userId: user.id, expiresAt });

    // Return user data and tokens (exclude password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      ...tokens,
    });
  } catch (error) {
    console.error('[Auth] Token refresh error:', error);
    res.status(500).json({ message: 'Token refresh failed', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      refreshTokens.delete(refreshToken);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ message: 'Logout failed', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token required' });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const user = await storage.getUser(payload.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({ message: 'Failed to get user', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token required' });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await storage.getUser(payload.userId);
    if (!user || !user.password) {
      return res.status(404).json({ message: 'User or password not found' });
    }

    // Verify current password using hybrid verification
    const isValidPassword = await verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await storage.updateUser(user.id, {
      password: hashedPassword,
      passwordChanged: true,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ message: 'Password change failed', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
