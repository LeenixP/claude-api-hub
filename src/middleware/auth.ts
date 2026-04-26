import http from 'http';
import crypto from 'crypto';
import type { GatewayConfig } from '../providers/types.js';
import { sendError } from '../utils/http.js';
import { logger } from '../logger.js';
import { SESSION_MAX_AGE_MS, SESSION_CLEANUP_MS, RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_RPM, LOGIN_LOCKOUT_ATTEMPTS, LOGIN_LOCKOUT_MS } from '../constants.js';

// ─── Per-IP Rate Limiter ───

export class PerIpRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private cleanupTimer: NodeJS.Timeout;
  constructor(public readonly rpm: number, private windowMs = 60000) {
    this.cleanupTimer = setInterval(() => this.cleanup(Date.now()), RATE_LIMIT_WINDOW_MS);
    this.cleanupTimer.unref();
  }

  tryConsume(ip: string): { allowed: boolean; remaining: number; retryAfter: number } {
    const now = Date.now();
    let entry = this.windows.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(ip, entry);
    }
    entry.count++;
    return {
      allowed: entry.count <= this.rpm,
      remaining: Math.max(0, this.rpm - entry.count),
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.windows.clear();
  }

  private cleanup(now: number): void {
    for (const [key, entry] of this.windows) {
      if (now >= entry.resetAt) this.windows.delete(key);
    }
  }
}

// ─── Session Manager ───

interface SessionEntry {
  token: string;
  createdAt: number;
}

class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly maxAgeMs = SESSION_MAX_AGE_MS;
  private readonly cleanupIntervalMs = SESSION_CLEANUP_MS;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    this.cleanupInterval.unref();
  }

  create(): string {
    const token = crypto.randomUUID();
    this.sessions.set(token, { token, createdAt: Date.now() });
    return token;
  }

  isValid(token: string): boolean {
    const entry = this.sessions.get(token);
    if (!entry) return false;
    if (Date.now() - entry.createdAt > this.maxAgeMs) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [token, entry] of this.sessions) {
      if (now - entry.createdAt > this.maxAgeMs) {
        this.sessions.delete(token);
      }
    }
  }

  revoke(token: string): boolean {
    return this.sessions.delete(token);
  }

  revokeAll(): void {
    this.sessions.clear();
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}

const sessionManager = new SessionManager();

export function createSessionToken(): string {
  return sessionManager.create();
}

export function isValidSession(token: string): boolean {
  return sessionManager.isValid(token);
}

// ─── Admin Auth ───

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${hash}:${salt}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [hash, salt] = stored.split(':');
  if (!hash || !salt) return false;
  const computed = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  const bufHash = Buffer.from(hash, 'hex');
  const bufComputed = Buffer.from(computed, 'hex');
  if (bufHash.length !== bufComputed.length) return false;
  return crypto.timingSafeEqual(bufHash, bufComputed);
}

export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufA.length);
    bufB.copy(padded);
    crypto.timingSafeEqual(bufA, padded);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function requireAdmin(req: http.IncomingMessage, res: http.ServerResponse, config: GatewayConfig): boolean {
  const password = config.password;
  const adminToken = config.adminToken || process.env.ADMIN_TOKEN;
  if (!password && !adminToken) return true;
  const token = req.headers['authorization']?.replace('Bearer ', '')
    || req.headers['x-admin-token'] as string;
  if (token && isValidSession(token)) return true;
  if (token && adminToken && timingSafeCompare(token, adminToken)) return true;
  sendError(res, 401, 'authentication_error', 'Invalid or missing admin token', config, req.headers['origin'] as string);
  return false;
}

// ─── Security Headers ───

export class LoginRateLimiter {
  private attempts = new Map<string, { count: number; lockedUntil: number; resetAt: number }>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private maxRpm: number = LOGIN_RATE_LIMIT_RPM,
    private lockoutAttempts: number = LOGIN_LOCKOUT_ATTEMPTS,
    private lockoutMs: number = LOGIN_LOCKOUT_MS,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), RATE_LIMIT_WINDOW_MS).unref();
  }

  tryConsume(ip: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    let entry = this.attempts.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, lockedUntil: 0, resetAt: now + 60_000 };
      this.attempts.set(ip, entry);
    }
    if (now < entry.lockedUntil) {
      return { allowed: false, reason: `Account locked. Try again in ${Math.ceil((entry.lockedUntil - now) / 1000)}s` };
    }
    if (entry.count >= this.maxRpm) {
      return { allowed: false, reason: 'Too many login attempts. Try again later.' };
    }
    entry.count++;
    return { allowed: true };
  }

  recordFailure(ip: string): void {
    const entry = this.attempts.get(ip);
    if (entry && entry.count >= this.lockoutAttempts) {
      entry.lockedUntil = Date.now() + this.lockoutMs;
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [ip, entry] of this.attempts) {
      if (now >= entry.resetAt && now >= entry.lockedUntil) this.attempts.delete(ip);
    }
  }
}

export const loginRateLimiter = new LoginRateLimiter();

export function revokeSession(token: string): boolean {
  return sessionManager.revoke(token);
}

export function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http: https:; frame-ancestors 'none'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
}
