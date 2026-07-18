import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getSessionSecret } from '@/lib/session-secret';

// ═══════════════════════════════════════════════════════════════════════
// Session Lookup Cache — LRU with 60s TTL
// ═══════════════════════════════════════════════════════════════════════
// Every authenticated API call hits getUserFromToken(), which queries the DB.
// This in-memory cache reduces DB load for high-traffic scenarios.
// Cache is invalidated on session expiry (TTL) and on logout/password change.
// ═══════════════════════════════════════════════════════════════════════

interface CachedSession {
  user: NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>>;
  expiresAt: Date;
  cachedAt: number; // Unix ms
}

const SESSION_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const MAX_CACHE_SIZE = 500;
const sessionCache = new Map<string, CachedSession>();

/**
 * Get session duration in days from environment variable.
 * Defaults to 30 days. Set SESSION_DURATION_DAYS to change.
 */
export function getSessionDurationDays(): number {
  const envVal = process.env.SESSION_DURATION_DAYS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 365) {
      return parsed;
    }
  }
  return 30;
}

/**
 * Invalidate a cached session (call on logout, password change, etc.)
 */
export function invalidateSessionCache(token: string): void {
  sessionCache.delete(token);
}

/**
 * Invalidate all cached sessions (call on password change for a user)
 */
export function invalidateAllUserSessionsCache(userId: string): void {
  for (const [token, cached] of sessionCache.entries()) {
    if (cached.user.id === userId) {
      sessionCache.delete(token);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Password Hashing — bcrypt with auto-salt (12 rounds)
// ═══════════════════════════════════════════════════════════════════════
// Previously used SHA256 without salt — vulnerable to rainbow table attacks.
// Now uses bcrypt (cost factor 12) which is purpose-built for passwords.
// ═══════════════════════════════════════════════════════════════════════

const BCRYPT_ROUNDS = 12;

/**
 * Hash a password using bcrypt (async — generates unique salt automatically)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash (async)
 * Also supports legacy SHA256 hashes for backward compatibility during migration.
 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  // V.14: Guard against null hash (Google OAuth users have password: null)
  if (!hash) return false;
  // If the hash looks like a bcrypt hash ($2a$, $2b$, $2y$), use bcrypt
  if (hash.startsWith('$2')) {
    return bcrypt.compare(password, hash);
  }
  // Legacy SHA256 fallback — allows existing users to log in after migration
  // Their hash will be upgraded to bcrypt on next login via the login route
  const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
  return sha256Hash === hash;
}

/**
 * Check if a hash is a legacy SHA256 hash (needs upgrade to bcrypt)
 */
export function isLegacyHash(hash: string | null): boolean {
  // V.14: Guard against null hash
  if (!hash) return false;
  return !hash.startsWith('$2');
}

/**
 * Generate a random session token
 */
export function generateToken(): string {
  // Generate a HMAC-signed session token for tamper resistance
  // Priority: process.env.SESSION_SECRET → embedded fallback
  const secret = getSessionSecret();
  const payload = crypto.randomUUID();
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
  return `${payload}.${signature}`;
}

/**
 * Look up a session by token and return the associated user.
 * Returns null if session not found, expired, or user not active.
 */
export async function getUserFromToken(token: string | null) {
  if (!token) return null;

  // ── Check session cache first ──
  const cached = sessionCache.get(token);
  if (cached) {
    const now = Date.now();
    // Check cache TTL
    if (now - cached.cachedAt < SESSION_CACHE_TTL_MS) {
      // Check if session is still valid
      if (new Date() < cached.expiresAt && cached.user.isActive) {
        return cached.user;
      }
      // Session expired or user inactive — remove from cache
      sessionCache.delete(token);
    }
  }

  // ── Cache miss — query database ──
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    sessionCache.delete(token);
    return null;
  }

  // Check if user is active
  if (!session.user.isActive) return null;

  // ── Cache the session ──
  // Evict oldest entries if cache is full
  if (sessionCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = sessionCache.keys().next().value;
    if (oldestKey) sessionCache.delete(oldestKey);
  }
  sessionCache.set(token, {
    user: session.user,
    expiresAt: session.expiresAt,
    cachedAt: Date.now(),
  });

  return session.user;
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Rotate a session token — replace the old token with a new one.
 * This is a security measure that limits the damage if a token is compromised:
 * even if an attacker steals a token, it will be replaced within 24 hours.
 *
 * The old token is deleted and a new one is created with the same expiry.
 * The client must update its stored token from the `rotatedToken` field
 * returned by the /api/auth/me endpoint.
 */
export async function rotateSessionToken(oldToken: string, userId: string): Promise<string> {
  // Find the existing session
  const session = await db.session.findUnique({ where: { token: oldToken } });
  if (!session) {
    throw new Error('Session not found for rotation');
  }

  // Generate new token
  const newToken = generateToken();

  // Create new session with same expiry, then delete old one
  await db.session.create({
    data: {
      token: newToken,
      userId,
      expiresAt: session.expiresAt,
    },
  });

  await db.session.delete({ where: { id: session.id } });

  // Update caches
  invalidateSessionCache(oldToken);

  console.log(`[Auth] Rotated session token for user ${userId}`);
  return newToken;
}
