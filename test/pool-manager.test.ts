import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeyPool } from '../src/services/pool-manager.js';

describe('KeyPool', () => {
  let pool: KeyPool;

  afterEach(() => {
    pool?.destroy();
  });

  describe('Round-Robin rotation', () => {
    beforeEach(() => {
      pool = new KeyPool(['a', 'b', 'c'], { persist: false });
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
      pool = new KeyPool(['a', 'b'], { persist: false });
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
      pool = new KeyPool(['a'], { persist: false });
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
      pool = new KeyPool(['a', 'b'], { persist: false });
    });

    it('returns only healthy keys', () => {
      for (let i = 0; i < 5; i++) pool.reportError('a');
      expect(pool.getKey()).toBe('b');
      expect(pool.getKey()).toBe('b');
    });
  });

  describe('getStatus', () => {
    it('returns correct status for all keys', () => {
      pool = new KeyPool(['x', 'y'], { persist: false });
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
      pool = new KeyPool(['a', 'b'], { persist: false });
      for (let i = 0; i < 5; i++) {
        pool.reportError('a');
        pool.reportError('b');
      }
      expect(pool.getKey()).toBeNull();
      expect(pool.allUnhealthy()).toBe(true);
    });
  });

  describe('loadState static method', () => {
    it('returns default state when no state file exists', () => {
      const { unlinkSync, existsSync } = require('fs');
      const { join } = require('path');
      const { homedir } = require('os');
      const statePath = join(homedir(), '.claude-api-hub', 'keypool-state.json');
      if (existsSync(statePath)) unlinkSync(statePath);

      const state = KeyPool.loadState(['key1', 'key2']);
      expect(state.keys).toHaveLength(2);
      expect(state.keys[0].key).toBe('key1');
      expect(state.keys[0].healthy).toBe(true);
      expect(state.keys[0].errorCount).toBe(0);
      expect(state.index).toBe(0);
    });

    it('loads and reconciles state from existing file', () => {
      const { mkdirSync, writeFileSync, existsSync, unlinkSync } = require('fs');
      const { join } = require('path');
      const { homedir } = require('os');
      const hubDir = join(homedir(), '.claude-api-hub');
      const statePath = join(hubDir, 'keypool-state.json');
      if (!existsSync(hubDir)) mkdirSync(hubDir, { recursive: true });
      writeFileSync(statePath, JSON.stringify({
        keys: [
          { key: 'old-key', healthy: false, errorCount: 5, unhealthySince: 1000 },
          { key: 'keep-key', healthy: true, errorCount: 0, unhealthySince: 0 },
        ],
        index: 1,
      }), 'utf-8');

      // 'old-key' is dropped, 'keep-key' is kept, 'new-key' is added
      const state = KeyPool.loadState(['keep-key', 'new-key']);
      expect(state.keys).toHaveLength(2);
      const keepKey = state.keys.find(k => k.key === 'keep-key')!;
      expect(keepKey.healthy).toBe(true);
      const newKey = state.keys.find(k => k.key === 'new-key')!;
      expect(newKey.healthy).toBe(true);
      expect(newKey.errorCount).toBe(0);
      expect(state.index).toBe(1);

      // Cleanup
      if (existsSync(statePath)) unlinkSync(statePath);
    });

    it('returns default state when state file JSON is corrupt', () => {
      const { mkdirSync, writeFileSync, existsSync, unlinkSync } = require('fs');
      const { join } = require('path');
      const { homedir } = require('os');
      const hubDir = join(homedir(), '.claude-api-hub');
      const statePath = join(hubDir, 'keypool-state.json');
      if (!existsSync(hubDir)) mkdirSync(hubDir, { recursive: true });
      writeFileSync(statePath, 'corrupt json {{{', 'utf-8');

      const state = KeyPool.loadState(['key1']);
      expect(state.keys).toHaveLength(1);
      expect(state.keys[0].key).toBe('key1');
      expect(state.keys[0].healthy).toBe(true);
      expect(state.index).toBe(0);

      if (existsSync(statePath)) unlinkSync(statePath);
    });
  });

  describe('saveState', () => {
    it('persists keys and index to state file', () => {
      const { readFileSync, existsSync, unlinkSync } = require('fs');
      const { join } = require('path');
      const { homedir } = require('os');
      const statePath = join(homedir(), '.claude-api-hub', 'keypool-state.json');
      if (existsSync(statePath)) unlinkSync(statePath);

      pool = new KeyPool(['a', 'b'], { persist: false });
      pool.reportError('a'); // bump error count
      pool.saveState();

      expect(existsSync(statePath)).toBe(true);
      const saved = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(saved.keys).toHaveLength(2);
      expect(saved.keys[0].key).toBe('a');
      expect(saved.keys[0].errorCount).toBe(1);
    });
  });

  describe('reportError with unknown key', () => {
    it('is a no-op for keys not in the pool', () => {
      pool = new KeyPool(['a'], { persist: false });
      pool.reportError('non-existent-key');
      const status = pool.getStatus();
      expect(status).toHaveLength(1);
      expect(status[0].key).toBe('a');
      expect(status[0].healthy).toBe(true);
    });
  });

  describe('reportSuccess with unknown key', () => {
    it('is a no-op for keys not in the pool', () => {
      pool = new KeyPool(['a'], { persist: false });
      for (let i = 0; i < 5; i++) pool.reportError('a');
      pool.reportSuccess('non-existent-key');
      const status = pool.getStatus();
      expect(status[0].healthy).toBe(false); // 'a' still unhealthy
    });
  });

  describe('getKey with single key', () => {
    it('returns the only key repeatedly', () => {
      pool = new KeyPool(['only'], { persist: false });
      expect(pool.getKey()).toBe('only');
      expect(pool.getKey()).toBe('only');
      expect(pool.getKey()).toBe('only');
    });

    it('returns null when the only key is unhealthy', () => {
      pool = new KeyPool(['only'], { persist: false });
      for (let i = 0; i < 5; i++) pool.reportError('only');
      expect(pool.getKey()).toBeNull();
    });
  });

  describe('getKey with empty pool', () => {
    it('returns null', () => {
      pool = new KeyPool([], { persist: false });
      expect(pool.getKey()).toBeNull();
    });
  });

  describe('allUnhealthy with mixed health', () => {
    it('returns false when some keys are healthy', () => {
      pool = new KeyPool(['a', 'b'], { persist: false });
      for (let i = 0; i < 5; i++) pool.reportError('a');
      expect(pool.allUnhealthy()).toBe(false);
    });
  });

  describe('destroy with persist', () => {
    it('saves state on destroy when persist is true', () => {
      const { existsSync, unlinkSync, readFileSync } = require('fs');
      const { join } = require('path');
      const { homedir } = require('os');
      const statePath = join(homedir(), '.claude-api-hub', 'keypool-state.json');
      if (existsSync(statePath)) unlinkSync(statePath);

      pool = new KeyPool(['key1', 'key2'], { persist: true });
      pool.getKey(); // advance index
      pool.destroy();

      expect(existsSync(statePath)).toBe(true);
      const saved = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(saved.keys).toHaveLength(2);
      expect(saved.index).toBe(1); // getKey advanced index
    });

    it('does not save state on destroy when persist is false', () => {
      const { existsSync, unlinkSync } = require('fs');
      const { join } = require('path');
      const { homedir } = require('os');
      const statePath = join(homedir(), '.claude-api-hub', 'keypool-state.json');
      if (existsSync(statePath)) unlinkSync(statePath);

      pool = new KeyPool(['key1'], { persist: false });
      pool.destroy();

      // State file should not exist (was deleted before, persist=false skipped saveState)
      expect(existsSync(statePath)).toBe(false);
    });
  });

  describe('recovery timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('recovers unhealthy keys after KEY_POOL_RECOVERY_MS', () => {
      pool = new KeyPool(['a'], { persist: false });
      for (let i = 0; i < 5; i++) pool.reportError('a');
      expect(pool.getStatus()[0].healthy).toBe(false);

      // Advance past recovery window
      vi.advanceTimersByTime(65_000);
      expect(pool.getStatus()[0].healthy).toBe(true);
      expect(pool.getStatus()[0].errorCount).toBe(0);
    });

    it('does not recover before KEY_POOL_RECOVERY_MS', () => {
      pool = new KeyPool(['a'], { persist: false });
      for (let i = 0; i < 5; i++) pool.reportError('a');
      expect(pool.getStatus()[0].healthy).toBe(false);

      // Advance just past the 50s check, but not to 60s
      vi.advanceTimersByTime(55_000);
      expect(pool.getStatus()[0].healthy).toBe(false);
    });

    it('makes recovered keys available via getKey', () => {
      pool = new KeyPool(['a'], { persist: false });
      for (let i = 0; i < 5; i++) pool.reportError('a');
      expect(pool.getKey()).toBeNull();

      vi.advanceTimersByTime(65_000);
      expect(pool.getKey()).toBe('a');
    });
  });
});
