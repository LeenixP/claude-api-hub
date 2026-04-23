export class RateTracker {
  private buckets: Array<{ requests: number; tokens: number }>;
  private readonly windowSize = 10;
  private currentIndex = 0;
  private lastTick: number;
  private timer: ReturnType<typeof setInterval>;

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
    if (tokens) this.buckets[this.currentIndex].tokens += tokens;
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

  destroy(): void {
    clearInterval(this.timer);
  }
}
