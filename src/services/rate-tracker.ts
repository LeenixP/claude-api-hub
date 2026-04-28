export class RateTracker {
  private buckets: Array<{ requests: number; tokens: number }>;
  private readonly windowSize = 10;
  private currentIndex = 0;
  private lastTick: number;
  private timer: ReturnType<typeof setInterval>;
  private maxQps = 0;
  private maxRpm = 0;
  private maxTps = 0;
  private totalRequests = 0;
  private totalTokens = 0;

  constructor() {
    this.buckets = Array.from({ length: this.windowSize }, () => ({ requests: 0, tokens: 0 }));
    this.lastTick = Math.floor(Date.now() / 1000);
    this.timer = setInterval(() => this.advance(), 1000);
    this.timer.unref();
  }

  private advance(): void {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - this.lastTick;
    if (elapsed <= 0) return;
    for (let i = 0; i < Math.min(elapsed, this.windowSize); i++) {
      this.currentIndex = (this.currentIndex + 1) % this.windowSize;
      this.buckets[this.currentIndex] = { requests: 0, tokens: 0 };
    }
    this.lastTick = now;
  }

  record(tokens?: number): void {
    this.advance();
    this.buckets[this.currentIndex].requests++;
    this.totalRequests++;
    if (tokens) {
      this.buckets[this.currentIndex].tokens += tokens;
      this.totalTokens += tokens;
    }
    const qps = this.getQPS();
    const rpm = qps * 60;
    const tps = this.getTPS();
    if (qps > this.maxQps) this.maxQps = qps;
    if (rpm > this.maxRpm) this.maxRpm = rpm;
    if (tps > this.maxTps) this.maxTps = tps;
  }

  getQPS(): number {
    this.advance();
    const total = this.buckets.reduce((s, b) => s + b.requests, 0);
    return Math.round((total / this.windowSize) * 10) / 10;
  }

  getRPM(): number {
    return Math.round(this.getQPS() * 60 * 10) / 10;
  }

  getTPS(): number {
    this.advance();
    const total = this.buckets.reduce((s, b) => s + b.tokens, 0);
    return Math.round((total / this.windowSize) * 10) / 10;
  }

  getMaxQPS(): number {
    return this.maxQps;
  }

  getMaxRPM(): number {
    return this.maxRpm;
  }

  getMaxTPS(): number {
    return this.maxTps;
  }

  getStats(): { qps: number; rpm: number; tps: number; maxQps: number; maxRpm: number; maxTps: number; totalRequests: number; totalTokens: number } {
    return {
      qps: this.getQPS(),
      rpm: this.getRPM(),
      tps: this.getTPS(),
      maxQps: this.maxQps,
      maxRpm: this.maxRpm,
      maxTps: this.maxTps,
      totalRequests: this.totalRequests,
      totalTokens: this.totalTokens,
    };
  }

  setCumulativeTotals(totals: { totalTokens: number; totalRequests: number; maxQps: number; maxRpm: number; maxTps: number }): void {
    this.totalTokens = totals.totalTokens;
    this.totalRequests = totals.totalRequests;
    if (totals.maxQps > this.maxQps) this.maxQps = totals.maxQps;
    if (totals.maxRpm > this.maxRpm) this.maxRpm = totals.maxRpm;
    if (totals.maxTps > this.maxTps) this.maxTps = totals.maxTps;
  }

  getCumulativeState(): { totalTokens: number; totalRequests: number; maxQps: number; maxRpm: number; maxTps: number } {
    return {
      totalTokens: this.totalTokens,
      totalRequests: this.totalRequests,
      maxQps: this.maxQps,
      maxRpm: this.maxRpm,
      maxTps: this.maxTps,
    };
  }

  destroy(): void {
    clearInterval(this.timer);
  }
}
