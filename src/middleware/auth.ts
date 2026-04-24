import http from 'http';
import crypto from 'crypto';
import type { GatewayConfig } from '../providers/types.js';
import { sendError } from '../utils/http.js';
import { logger } from '../logger.js';

// ─── Per-IP Rate Limiter ───

export class PerIpRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private cleanupTimer: NodeJS.Timeout;
  constructor(private rpm: number, private windowMs = 60000) {
    this.cleanupTimer = setInterval(() => this.cleanup(Date.now()), 60000);
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
  private readonly maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
  private readonly cleanupIntervalMs = 60 * 60 * 1000; // 1 hour

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

function timingSafeCompare(a: string, b: string): boolean {
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

export function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
}
