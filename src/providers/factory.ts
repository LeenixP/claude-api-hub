import type { Provider, ProviderConfig } from './types.js';
import { ClaudeProvider } from './claude.js';
import { GenericOpenAIProvider } from './generic.js';
import { KiroProvider } from './kiro.js';

type ProviderFactory = (config: ProviderConfig) => Provider;

const registry = new Map<string, ProviderFactory>();

registry.set('passthrough', (config) => new ClaudeProvider(config));
registry.set('openai', (config) => new GenericOpenAIProvider(config));
registry.set('kiro', (config) => new KiroProvider(config));

export function registerProviderType(type: string, factory: ProviderFactory): void {
  registry.set(type, factory);
}

export function createProvider(config: ProviderConfig): Provider | null {
  // Check for explicit provider type first
  const explicitType = config.providerType as string | undefined;
  if (explicitType && registry.has(explicitType)) {
    try {
      return registry.get(explicitType)!(config);
    } catch (err) {
      console.error(`[warn] Skipping provider "${config.name}": ${(err as Error).message}`);
      return null;
    }
  }
  const isAnthropicMode = config.passthrough || config.authMode === 'anthropic';
  const type = isAnthropicMode ? 'passthrough' : 'openai';
  const factory = registry.get(type);
  if (!factory) throw new Error(`Unknown provider type: ${type}`);
  return factory(config);
}

/** Check if a provider config uses the Kiro backend (non-JSON upstream response). */
export function isKiroProvider(config: ProviderConfig): boolean {
  return (config.providerType as string) === 'kiro';
}
