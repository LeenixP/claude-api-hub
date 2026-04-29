import { writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { readFile, access, constants as fsConstants } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import crypto from 'crypto';
import { KEY_POOL_ERROR_THRESHOLD, KEY_POOL_RECOVERY_MS, KEY_POOL_RECOVERY_CHECK_MS } from '../constants.js';

function keyId(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

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
  private keyMap = new Map<string, KeyState>();

  private constructor(keys: KeyState[], index: number, persist: boolean) {
    this.keys = keys;
    this.index = index;
    this.persist = persist;
    for (const k of this.keys) this.keyMap.set(k.key, k);
    this.timer = setInterval(() => this.recover(), KEY_POOL_RECOVERY_CHECK_MS);
  }

  static async loadState(apiKeys: string[]): Promise<PersistedState> {
    try {
      await access(STATE_FILE, fsConstants.F_OK);
    } catch {
      return { keys: apiKeys.map(key => ({ key, healthy: true, errorCount: 0, unhealthySince: 0 })), index: 0 };
    }
    try {
      const raw = await readFile(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      const persistedMap = new Map(parsed.keys.map(k => [k.key, k]));
      const reconciled = apiKeys.map(key => {
        const id = keyId(key);
        const persisted = persistedMap.get(id);
        if (persisted) {
          return { key, healthy: persisted.healthy, errorCount: persisted.errorCount, unhealthySince: persisted.unhealthySince };
        }
        return { key, healthy: true, errorCount: 0, unhealthySince: 0 };
      });
      return { keys: reconciled, index: parsed.index ?? 0 };
    } catch {
      return { keys: apiKeys.map(key => ({ key, healthy: true, errorCount: 0, unhealthySince: 0 })), index: 0 };
    }
  }

  static async create(apiKeys: string[], opts?: { persist?: boolean }): Promise<KeyPool> {
    const persist = opts?.persist ?? true;
    if (persist) {
      const loaded = await KeyPool.loadState(apiKeys);
      return new KeyPool(loaded.keys, loaded.index, true);
    }
    const keys = apiKeys.map(key => ({ key, healthy: true, errorCount: 0, unhealthySince: 0 }));
    return new KeyPool(keys, 0, false);
  }

  saveState(): void {
    try {
      if (!existsSync(STATE_DIR)) {
        mkdirSync(STATE_DIR, { recursive: true });
      }
      const state: PersistedState = {
        keys: this.keys.map(k => ({ ...k, key: keyId(k.key) })),
        index: this.index,
      };
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      chmodSync(STATE_FILE, 0o600);
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
    const state = this.keyMap.get(key);
    if (!state) return;
    state.errorCount++;
    if (state.errorCount >= KEY_POOL_ERROR_THRESHOLD) {
      state.healthy = false;
      state.unhealthySince = Date.now();
    }
  }

  reportSuccess(key: string): void {
    const state = this.keyMap.get(key);
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

  isKnownBadKey(key: string): boolean {
    const state = this.keyMap.get(key);
    return state ? !state.healthy : false;
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
