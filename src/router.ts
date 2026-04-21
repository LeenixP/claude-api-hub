import { Provider, RouteResult } from './providers/types.js';

const MODEL_PREFIX_MAP: Array<{ prefix: string; providerName: string }> = [
  { prefix: 'claude-', providerName: 'claude' },
  { prefix: 'kimi-', providerName: 'kimi' },
  { prefix: 'minimax-', providerName: 'minimax' },
  { prefix: 'MiniMax-', providerName: 'minimax' },
  { prefix: 'glm-', providerName: 'glm' },
];

export class ModelRouter {
  private providers: Map<string, Provider> = new Map();
  private defaultProviderName: string;

  constructor(defaultProviderName: string) {
    this.defaultProviderName = defaultProviderName;
  }

  register(provider: Provider): void {
    this.providers.set(provider.name, provider);
  }

  route(model: string): RouteResult {
    // Try prefix-based routing first
    for (const { prefix, providerName } of MODEL_PREFIX_MAP) {
      if (model.startsWith(prefix)) {
        const provider = this.providers.get(providerName);
        if (provider && provider.config.enabled) {
          return { provider, resolvedModel: provider.resolveModel(model) };
        }
      }
    }

    // Try each provider's matchModel
    for (const provider of this.providers.values()) {
      if (provider.config.enabled && provider.matchModel(model)) {
        return { provider, resolvedModel: provider.resolveModel(model) };
      }
    }

    // Fallback to default provider
    const defaultProvider = this.providers.get(this.defaultProviderName);
    if (!defaultProvider) {
      throw new Error(`Default provider "${this.defaultProviderName}" not registered`);
    }
    return { provider: defaultProvider, resolvedModel: defaultProvider.resolveModel(model) };
  }

  getProviders(): Provider[] {
    return Array.from(this.providers.values());
  }
}

export function createRouter(providers: Provider[], defaultProviderName: string): ModelRouter {
  const router = new ModelRouter(defaultProviderName);
  for (const provider of providers) {
    router.register(provider);
  }
  return router;
}
