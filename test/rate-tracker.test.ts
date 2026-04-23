import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RateTracker } from '../src/services/rate-tracker.js';

describe('RateTracker', () => {
  let tracker: RateTracker;

  beforeEach(() => {
    tracker = new RateTracker();
  });

  afterEach(() => {
tracker.destroy();
  });

  it('record increments request count and getQPS reflects it', () => {
    tracker.record();
    tracker.record();
    tracker.record();
    const qps = tracker.getQPS();
    expect(qps).toBeGreaterThan(0);
  });

  it('getRPM is getQPS * 60', () => {
    tracker.record();
    const qps = tracker.getQPS();
    const rpm = tracker.getRPM();
    expect(rpm).toBeCloseTo(qps * 60, 0);
  });

  it('tracks tokens via getTPS', () => {
    tracker.record(100);
    tracker.record(200);
    const tps = tracker.getTPS();
    expect(tps).toBeGreaterThan(0);
  });
});
