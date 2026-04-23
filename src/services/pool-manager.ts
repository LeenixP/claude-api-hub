interface KeyState {
  key: string;
  healthy: boolean;
  errorCount: number;
  unhealthySince: number;
}

export class KeyPool {
  private keys: KeyState[];
  private index = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(apiKeys: string[]) {
    this.keys = apiKeys.map(key => ({ key, healthy: true, errorCount: 0, unhealthySince: 0 }));
    this.timer = setInterval(() => this.recover(), 10_000);
  }

  getKey(): string | null {
    const len = this.keys.length;
    for (let i = 0; i < len; i++) {
      const state = this.keys[(this.index + i) % len];
      if (state.healthy) {
        this.index = ((this.index + i) % len) + 1;
        return state.key;
      }
    }
    return null;
  }

  reportError(key: string): void {
    const state = this.keys.find(k => k.key === key);
    if (!state) return;
    state.errorCount++;
    if (state.errorCount >= 5) {
      state.healthy = false;
      state.unhealthySince = Date.now();
    }
  }

  reportSuccess(key: string): void {
    const state = this.keys.find(k => k.key === key);
    if (!state) return;
    state.errorCount = 0;
    state.healthy = true;
    state.unhealthySince = 0;
  }

  getStatus(): { key: string; healthy: boolean; errorCount: number }[] {
    return this.keys.map(({ key, healthy, errorCount }) => ({ key, healthy, errorCount }));
  }

  allUnhealthy(): boolean {
    return this.keys.every(k => !k.healthy);
  }

  private recover(): void {
    const now = Date.now();
    for (const state of this.keys) {
      if (!state.healthy && now - state.unhealthySince >= 60_000) {
        state.healthy = true;
        state.errorCount = 0;
        state.unhealthySince = 0;
      }
    }
  }

  destroy(): void {
    clearInterval(this.timer);
  }
}
