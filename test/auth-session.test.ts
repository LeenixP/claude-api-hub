import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import {
  createSessionToken,
  isValidSession,
  revokeSession,
  timingSafeCompare,
  requireAdmin,
  setSecurityHeaders,
  PerIpRateLimiter,
  LoginRateLimiter,
} from '../src/middleware/auth.js';
import type { GatewayConfig } from '../src/providers/types.js';

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a valid session token', () => {
    const token = createSessionToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('validates a freshly created token', () => {
    const token = createSessionToken();
    expect(isValidSession(token)).toBe(true);
  });

  it('rejects unknown token', () => {
    expect(isValidSession('nonexistent-token-12345')).toBe(false);
  });

  it('rejects expired token after 24 hours', () => {
    const token = createSessionToken();
    expect(isValidSession(token)).toBe(true);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(isValidSession(token)).toBe(false);
  });

  it('accepts token just before 24 hour expiry', () => {
    const token = createSessionToken();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1);
    expect(isValidSession(token)).toBe(true);
  });

  it('creates unique tokens each time', () => {
    const t1 = createSessionToken();
    const t2 = createSessionToken();
    expect(t1).not.toBe(t2);
  });

  it('revokeSession removes a valid token', () => {
    const token = createSessionToken();
    expect(isValidSession(token)).toBe(true);
    expect(revokeSession(token)).toBe(true);
    expect(isValidSession(token)).toBe(false);
  });

  it('revokeSession returns false for unknown token', () => {
    expect(revokeSession('no-such-token')).toBe(false);
  });

  it('cleanup removes expired sessions naturally', () => {
    const token = createSessionToken();
    expect(isValidSession(token)).toBe(true);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    // isValidSession also cleans up, so it returns false and deletes
    expect(isValidSession(token)).toBe(false);
    // After cleanup, token should be gone
    expect(isValidSession(token)).toBe(false);
  });
});

describe('timingSafeCompare', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeCompare('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(timingSafeCompare('abc123', 'xyz789')).toBe(false);
  });

  it('returns false for different length strings', () => {
    expect(timingSafeCompare('short', 'verylongstring')).toBe(false);
  });

  it('returns false for empty vs non-empty', () => {
    expect(timingSafeCompare('', 'something')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(timingSafeCompare('', '')).toBe(true);
  });
});

describe('requireAdmin', () => {
  function mockReqRes(token?: string, headerType?: 'authorization' | 'x-admin-token') {
    const req = {
      headers: {} as Record<string, string>,
    } as http.IncomingMessage;
    if (token && headerType === 'authorization') {
      req.headers['authorization'] = `Bearer ${token}`;
    } else if (token && headerType === 'x-admin-token') {
      req.headers['x-admin-token'] = token;
    }
    const res = new http.ServerResponse(req);
    return { req, res };
  }

  const baseConfig: GatewayConfig = {
    port: 0,
    host: '127.0.0.1',
    providers: {},
    logLevel: 'error',
  };

  it('returns true when no password or adminToken configured', () => {
    const { req, res } = mockReqRes();
    expect(requireAdmin(req, res, baseConfig)).toBe(true);
  });

  it('returns false with no token when adminToken is required', () => {
    const { req, res } = mockReqRes();
    const config = { ...baseConfig, adminToken: 'secret' };
    expect(requireAdmin(req, res, config)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('returns false with wrong token when adminToken is required', () => {
    const { req, res } = mockReqRes('wrong', 'x-admin-token');
    const config = { ...baseConfig, adminToken: 'secret' };
    expect(requireAdmin(req, res, config)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('returns true with correct x-admin-token', () => {
    const { req, res } = mockReqRes('secret', 'x-admin-token');
    const config = { ...baseConfig, adminToken: 'secret' };
    expect(requireAdmin(req, res, config)).toBe(true);
  });

  it('returns true with correct Bearer token', () => {
    const { req, res } = mockReqRes('secret', 'authorization');
    const config = { ...baseConfig, adminToken: 'secret' };
    expect(requireAdmin(req, res, config)).toBe(true);
  });

  it('returns true with valid session token via x-admin-token', () => {
    const sessionToken = createSessionToken();
    const { req, res } = mockReqRes(sessionToken, 'x-admin-token');
    const config = { ...baseConfig, adminToken: 'secret' };
    expect(requireAdmin(req, res, config)).toBe(true);
  });

  it('returns true with valid session token via Bearer', () => {
    const sessionToken = createSessionToken();
    const { req, res } = mockReqRes(sessionToken, 'authorization');
    const config = { ...baseConfig, adminToken: 'secret' };
    expect(requireAdmin(req, res, config)).toBe(true);
  });

  it('returns false with no token when password is required', () => {
    const { req, res } = mockReqRes();
    const config = { ...baseConfig, password: 'mypass' };
    expect(requireAdmin(req, res, config)).toBe(false);
  });

  it('returns false when password is set but no token provided (needs session from login)', () => {
    const { req, res } = mockReqRes();
    const config = { ...baseConfig, password: 'mypass' };
    // Password is set but no adminToken: must authenticate via login to get session token
    expect(requireAdmin(req, res, config)).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe('setSecurityHeaders', () => {
  it('sets all expected security headers on response', () => {
    const req = {} as http.IncomingMessage;
    const res = new http.ServerResponse(req);
    setSecurityHeaders(res);
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff');
    expect(res.getHeader('X-Frame-Options')).toBe('DENY');
    expect(res.getHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.getHeader('Content-Security-Policy')).toBeDefined();
  });
});

describe('PerIpRateLimiter', () => {
  it('allows requests up to RPM limit', () => {
    const limiter = new PerIpRateLimiter(3, 60000);
    for (let i = 0; i < 3; i++) {
      const result = limiter.tryConsume('127.0.0.1');
      expect(result.allowed).toBe(true);
    }
    limiter.destroy();
  });

  it('blocks requests exceeding RPM limit', () => {
    const limiter = new PerIpRateLimiter(2, 60000);
    limiter.tryConsume('127.0.0.1');
    limiter.tryConsume('127.0.0.1');
    const result = limiter.tryConsume('127.0.0.1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    limiter.destroy();
  });

  it('returns correct remaining count', () => {
    const limiter = new PerIpRateLimiter(5, 60000);
    const r1 = limiter.tryConsume('10.0.0.1');
    expect(r1.remaining).toBe(4);
    const r2 = limiter.tryConsume('10.0.0.1');
    expect(r2.remaining).toBe(3);
    limiter.destroy();
  });

  it('tracks different IPs independently', () => {
    const limiter = new PerIpRateLimiter(1, 60000);
    expect(limiter.tryConsume('1.1.1.1').allowed).toBe(true);
    expect(limiter.tryConsume('2.2.2.2').allowed).toBe(true);
    expect(limiter.tryConsume('1.1.1.1').allowed).toBe(false);
    limiter.destroy();
  });
});

describe('LoginRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first login attempt', () => {
    const limiter = new LoginRateLimiter(5, 5, 300_000);
    const result = limiter.tryConsume('10.0.0.1');
    expect(result.allowed).toBe(true);
  });

  it('blocks after exceeding RPM', () => {
    const limiter = new LoginRateLimiter(2, 5, 300_000);
    limiter.tryConsume('10.0.0.1');
    limiter.tryConsume('10.0.0.1');
    const result = limiter.tryConsume('10.0.0.1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Too many login attempts');
  });

  it('locks out after repeated failures', () => {
    const limiter = new LoginRateLimiter(5, 3, 300_000);
    for (let i = 0; i < 3; i++) {
      limiter.tryConsume('10.0.0.1');
    }
    limiter.recordFailure('10.0.0.1');
    // Now the IP should be locked
    const result = limiter.tryConsume('10.0.0.1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('locked');
  });

  it('resets after window expires', () => {
    const limiter = new LoginRateLimiter(2, 5, 300_000);
    limiter.tryConsume('10.0.0.1');
    limiter.tryConsume('10.0.0.1');
    expect(limiter.tryConsume('10.0.0.1').allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    // Window should reset
    expect(limiter.tryConsume('10.0.0.1').allowed).toBe(true);
  });

  it('unlocks after lockout duration', () => {
    const limiter = new LoginRateLimiter(5, 3, 300_000);
    for (let i = 0; i < 3; i++) {
      limiter.tryConsume('10.0.0.1');
    }
    limiter.recordFailure('10.0.0.1');
    expect(limiter.tryConsume('10.0.0.1').allowed).toBe(false);

    vi.advanceTimersByTime(300_001);
    // Lockout should expire, but also window resets
    vi.advanceTimersByTime(60_001);
    expect(limiter.tryConsume('10.0.0.1').allowed).toBe(true);
  });
});
