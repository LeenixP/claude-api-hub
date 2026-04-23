import type { Provider, ProviderConfig } from './types.js';
import { ClaudeProvider } from './claude.js';
import { GenericOpenAIProvider } from './generic.js';

type ProviderFactory = (config: ProviderConfig) => Provider;

const registry = new Map<string, ProviderFactory>();

registry.set('passthrough', (config) => new ClaudeProvider(config));
registry.set('openai', (config) => new GenericOpenAIProvider(config));

export function registerProviderType(type: string, factory: ProviderFactory): void {
  registry.set(type, factory);
}

export function createProvider(config: ProviderConfig): Provider {
  const type = config.passthrough ? 'passthrough' : 'openai';
  const factory = registry.get(type);
  if (!factory) throw new Error(`Unknown provider type: ${type}`);
  return factory(config);
}
