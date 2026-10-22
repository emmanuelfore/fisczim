import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Fail fast if secrets are missing — a missing or default secret causes ALL
// tokens to become unverifiable after a server restart, booting every user.
const INSECURE_DEFAULTS = ['your-secret-key-change-in-production', 'your-refresh-secret-key-change-in-production', ''];
if (INSECURE_DEFAULTS.includes(JWT_SECRET) || INSECURE_DEFAULTS.includes(JWT_REFRESH_SECRET)) {
  console.error('[JWT] FATAL: JWT_SECRET / JWT_REFRESH_SECRET env vars are missing or set to insecure defaults. Set them in .env and restart the server.');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

export interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN as any,
    issuer: 'fisczim',
    audience: 'fisczim-api'
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { 
    expiresIn: JWT_REFRESH_EXPIRES_IN as any,
    issuer: 'fisczim',
    audience: 'fisczim-refresh'
  });
}

export function generateTokens(payload: TokenPayload): AuthTokens {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'fisczim',
      audience: 'fisczim-api'
    }) as TokenPayload;
    return decoded;
  } catch (error) {
    console.error('[JWT] Access token verification failed:', error);
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'fisczim',
      audience: 'fisczim-refresh'
    }) as TokenPayload;
    return decoded;
  } catch (error) {
    console.error('[JWT] Refresh token verification failed:', error);
    return null;
  }
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload;
    return decoded;
  } catch (error) {
    console.error('[JWT] Token decode failed:', error);
    return null;
  }
}
