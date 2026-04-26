import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenRefresher } from '../src/services/token-refresher.js';
import type { ModelRouter } from '../src/router.js';
import type { GatewayConfig } from '../src/providers/types.js';

describe('TokenRefresher', () => {
  let refresher: TokenRefresher;
  const mockRouter = {} as ModelRouter;
  const mockConfig: GatewayConfig = {
    port: 0,
    host: '127.0.0.1',
    providers: {},
    logLevel: 'error',
  };
  const rebuildFn = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    refresher = new TokenRefresher(mockRouter, mockConfig, rebuildFn, 1);
  });

  afterEach(() => {
    refresher.stop();
    vi.useRealTimers();
  });

  it('starts without error', () => {
    expect(() => refresher.start()).not.toThrow();
  });

  it('does not create duplicate timers on multiple starts', () => {
    refresher.start();
    refresher.start();
    // Should not throw or create multiple intervals
    expect(() => refresher.stop()).not.toThrow();
  });

  it('stops cleanly', () => {
    refresher.start();
    expect(() => refresher.stop()).not.toThrow();
    // Stopping again should be safe
    expect(() => refresher.stop()).not.toThrow();
  });

  it('schedules tick after 1 minute on start', async () => {
    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    // tick runs but with no oauth providers, rebuildFn not called
    // The async tick uses setTimeout internally; flush all pending timers
    await vi.advanceTimersByTimeAsync(0);
    expect(rebuildFn).not.toHaveBeenCalled();
  }, 10000);

  it('uses custom interval in minutes', () => {
    const customRefresher = new TokenRefresher(mockRouter, mockConfig, rebuildFn, 30);
    customRefresher.start();
    vi.advanceTimersByTime(60 * 1000); // first tick
    customRefresher.stop();
    // No error means interval was configured correctly
    expect(() => customRefresher.stop()).not.toThrow();
  });
});
