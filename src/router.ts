import { Provider, RouteResult } from './providers/types.js';

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
    // Use each provider's matchModel to find the right provider
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
