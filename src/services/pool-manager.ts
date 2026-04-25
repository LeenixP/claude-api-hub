import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { KEY_POOL_ERROR_THRESHOLD, KEY_POOL_RECOVERY_MS, KEY_POOL_RECOVERY_CHECK_MS } from '../constants.js';

interface KeyState {
  key: string;
  healthy: boolean;
  errorCount: number;
  unhealthySince: number;
}

interface PersistedState {
  keys: KeyState[];
  index: number;
}

const STATE_DIR = join(homedir(), '.claude-api-hub');
const STATE_FILE = join(STATE_DIR, 'keypool-state.json');

export class KeyPool {
  private keys: KeyState[];
  private index = 0;
  private timer: ReturnType<typeof setInterval>;
  private persist: boolean;

  constructor(apiKeys: string[], opts?: { persist?: boolean }) {
    this.persist = opts?.persist ?? true;
    if (this.persist) {
      const loaded = KeyPool.loadState(apiKeys);
      this.keys = loaded.keys;
      this.index = loaded.index;
    } else {
      this.keys = apiKeys.map(key => ({ key, healthy: true, errorCount: 0, unhealthySince: 0 }));
      this.index = 0;
    }
    this.timer = setInterval(() => this.recover(), KEY_POOL_RECOVERY_CHECK_MS);
  }

  static loadState(apiKeys: string[]): PersistedState {
    if (!existsSync(STATE_FILE)) {
      return { keys: apiKeys.map(key => ({ key, healthy: true, errorCount: 0, unhealthySince: 0 })), index: 0 };
    }
    try {
      const raw = readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      // Reconcile with current apiKeys: keep known keys, add new ones, drop removed ones
      const keySet = new Set(apiKeys);
      const filtered = parsed.keys.filter(k => keySet.has(k.key));
      const existingKeys = new Set(filtered.map(k => k.key));
      for (const key of apiKeys) {
        if (!existingKeys.has(key)) {
          filtered.push({ key, healthy: true, errorCount: 0, unhealthySince: 0 });
        }
      }
      return { keys: filtered, index: parsed.index ?? 0 };
    } catch {
      return { keys: apiKeys.map(key => ({ key, healthy: true, errorCount: 0, unhealthySince: 0 })), index: 0 };
    }
  }

  saveState(): void {
    try {
      if (!existsSync(STATE_DIR)) {
        mkdirSync(STATE_DIR, { recursive: true });
      }
      const state: PersistedState = { keys: this.keys, index: this.index };
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch { /* silently ignore persistence errors */ }
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
    if (state.errorCount >= KEY_POOL_ERROR_THRESHOLD) {
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
      if (!state.healthy && now - state.unhealthySince >= KEY_POOL_RECOVERY_MS) {
        state.healthy = true;
        state.errorCount = 0;
        state.unhealthySince = 0;
      }
    }
  }

  destroy(): void {
    clearInterval(this.timer);
    if (this.persist) this.saveState();
  }
}
