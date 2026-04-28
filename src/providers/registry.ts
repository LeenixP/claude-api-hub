import type { Provider, ProviderConfig } from './types.js';
import { logger } from '../logger.js';

export type ProviderConstructor = new (config: ProviderConfig) => Provider;

/**
 * Runtime registry for provider types.
 * Replaces the previously hardcoded 3-branch factory with a register/retrieve pattern.
 */
export class ProviderRegistry {
  private registry = new Map<string, ProviderConstructor>();

  /** Register a provider type by its identifier. */
  register(type: string, ctor: ProviderConstructor): void {
    this.registry.set(type, ctor);
  }

  /** Unregister a provider type. Returns true if it was registered. */
  unregister(type: string): boolean {
    return this.registry.delete(type);
  }

  /** Create a provider instance for the given config. Returns null if type not found. */
  create(config: ProviderConfig): Provider | null {
    const type = this.resolveType(config);
    const ctor = this.registry.get(type);
    if (!ctor) return null;
    return new ctor(config);
  }

  /** List all registered provider type names. */
  listTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /** Check if a provider type is registered. */
  has(type: string): boolean {
    return this.registry.has(type);
  }

  private resolveType(config: ProviderConfig): string {
    if (config.providerType && this.registry.has(config.providerType)) {
      return config.providerType;
    }
    if (config.authMode === 'anthropic' || config.passthrough) {
      return 'anthropic';
    }
    return 'openai';
  }
}

export const providerRegistry = new ProviderRegistry();
