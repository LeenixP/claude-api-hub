import http from 'http';
import crypto from 'crypto';
import type { GatewayConfig } from '../providers/types.js';
import { sendError } from '../utils/http.js';

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

// ─── Session Token Store ───

const sessionTokens = new Set<string>();

export function createSessionToken(): string {
  const token = crypto.randomUUID();
  sessionTokens.add(token);
  return token;
}

export function isValidSession(token: string): boolean {
  return sessionTokens.has(token);
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
