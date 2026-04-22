import { Provider, RouteResult } from './providers/types.js';

export class ModelRouter {
  private providers: Map<string, Provider> = new Map();
  private defaultProviderName: string;
  private aliases: Record<string, string>;

  constructor(defaultProviderName: string, aliases: Record<string, string> = {}) {
    this.defaultProviderName = defaultProviderName;
    this.aliases = aliases;
  }

  register(provider: Provider): void {
    this.providers.set(provider.name, provider);
  }

  route(model: string): RouteResult {
    const originalModel = model;
    // Resolve alias by tier pattern matching (case-insensitive)
    const lc = model.toLowerCase();
    if (lc.includes('haiku') && this.aliases['haiku']) {
      model = this.aliases['haiku'];
    } else if (lc.includes('sonnet') && this.aliases['sonnet']) {
      model = this.aliases['sonnet'];
    } else if (lc.includes('opus') && this.aliases['opus']) {
      model = this.aliases['opus'];
    }

    // Use each provider's matchModel to find the right provider
    for (const provider of this.providers.values()) {
      if (provider.config.enabled && provider.matchModel(model)) {
        return { provider, resolvedModel: provider.resolveModel(model), originalModel };
      }
    }

    // Fallback to default provider
    const defaultProvider = this.providers.get(this.defaultProviderName);
    if (!defaultProvider) {
      throw new Error(`Default provider "${this.defaultProviderName}" not registered`);
    }
    return { provider: defaultProvider, resolvedModel: defaultProvider.resolveModel(model), originalModel };
  }

  getProviders(): Provider[] {
    return Array.from(this.providers.values());
  }
}

export function createRouter(providers: Provider[], defaultProviderName: string, aliases: Record<string, string> = {}): ModelRouter {
  const router = new ModelRouter(defaultProviderName, aliases);
  for (const provider of providers) {
    router.register(provider);
  }
  return router;
}
