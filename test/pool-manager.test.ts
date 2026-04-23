import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyPool } from '../src/services/pool-manager.js';

describe('KeyPool', () => {
  let pool: KeyPool;

  afterEach(() => {
    pool?.destroy();
  });

  describe('Round-Robin rotation', () => {
    beforeEach(() => {
      pool = new KeyPool(['a', 'b', 'c']);
    });

    it('cycles through keys in order', () => {
      expect(pool.getKey()).toBe('a');
      expect(pool.getKey()).toBe('b');
      expect(pool.getKey()).toBe('c');
      expect(pool.getKey()).toBe('a');
    });
  });

  describe('reportError', () => {
    beforeEach(() => {
      pool = new KeyPool(['a', 'b']);
    });

    it('marks key unhealthy after 5 consecutive errors', () => {
      for (let i = 0; i < 5; i++) pool.reportError('a');
      const status = pool.getStatus();
      expect(status.find(k => k.key === 'a')!.healthy).toBe(false);
      expect(status.find(k => k.key === 'a')!.errorCount).toBe(5);
    });

    it('does not mark key unhealthy before 5 errors', () => {
      for (let i = 0; i < 4; i++) pool.reportError('a');
      expect(pool.getStatus().find(k => k.key === 'a')!.healthy).toBe(true);
    });
  });

  describe('reportSuccess', () => {
    beforeEach(() => {
      pool = new KeyPool(['a']);
    });

    it('resets error count and restores health', () => {
      for (let i = 0; i < 4; i++) pool.reportError('a');
      pool.reportSuccess('a');
      const s = pool.getStatus().find(k => k.key === 'a')!;
      expect(s.errorCount).toBe(0);
      expect(s.healthy).toBe(true);
    });
  });

  describe('getKey skips unhealthy keys', () => {
    beforeEach(() => {
      pool = new KeyPool(['a', 'b']);
    });

    it('returns only healthy keys', () => {
      for (let i = 0; i < 5; i++) pool.reportError('a');
      expect(pool.getKey()).toBe('b');
      expect(pool.getKey()).toBe('b');
    });
  });

  describe('getStatus', () => {
    it('returns correct status for all keys', () => {
      pool = new KeyPool(['x', 'y']);
      pool.reportError('x');
      const status = pool.getStatus();
      expect(status).toEqual([
        { key: 'x', healthy: true, errorCount: 1 },
        { key: 'y', healthy: true, errorCount: 0 },
      ]);
    });
  });

  describe('all keys unhealthy', () => {
    it('getKey returns null as fallback', () => {
      pool = new KeyPool(['a', 'b']);
      for (let i = 0; i < 5; i++) {
        pool.reportError('a');
        pool.reportError('b');
      }
      expect(pool.getKey()).toBeNull();
      expect(pool.allUnhealthy()).toBe(true);
    });
  });
});
