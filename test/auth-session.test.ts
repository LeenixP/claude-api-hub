import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSessionToken,
  isValidSession,
} from '../src/middleware/auth.js';

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
});
