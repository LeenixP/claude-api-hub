import { Provider, RouteResult } from './providers/types.js';

export class ModelRouter {
  private providers: Map<string, Provider> = new Map();
  private defaultProviderName: string;
  private aliases: Record<string, string>;
  private fallbackChain: Record<string, string>;

  constructor(defaultProviderName: string, aliases: Record<string, string> = {}, fallbackChain: Record<string, string> = {}) {
    this.defaultProviderName = defaultProviderName;
    this.aliases = aliases;
    this.fallbackChain = fallbackChain;
  }

  register(provider: Provider): void {
    this.providers.set(provider.name, provider);
  }

  clear(): void {
    this.providers.clear();
  }

  replaceAll(providers: Provider[]): void {
    const newMap = new Map<string, Provider>();
    for (const p of providers) newMap.set(p.name, p);
    this.providers = newMap;
  }

  route(model: string): RouteResult {
    const originalModel = model;

    // Exact alias match first
    if (this.aliases[model]) {
      model = this.aliases[model];
    } else {
      // Tier pattern matching — only for claude-* model names
      const lc = model.toLowerCase();
      if (lc.startsWith('claude')) {
        for (const [tier, target] of Object.entries(this.aliases)) {
          if (lc.includes(tier)) {
            model = target;
            break;
          }
        }
      }
    }

    for (const provider of this.providers.values()) {
      if (provider.config.enabled && provider.matchModel(model)) {
        if (provider.isHealthy && !provider.isHealthy()) {
          const fallback = this.tryFallback(provider.name, model);
          if (fallback) return { ...fallback, originalModel };
        }
        return { provider, resolvedModel: provider.resolveModel(model), originalModel };
      }
    }

    const defaultProvider = this.providers.get(this.defaultProviderName);
    if (!defaultProvider) {
      throw new Error(`Default provider "${this.defaultProviderName}" not registered`);
    }
    if (defaultProvider.isHealthy && !defaultProvider.isHealthy()) {
      const fallback = this.tryFallback(defaultProvider.name, model);
      if (fallback) return { ...fallback, originalModel };
    }
    return { provider: defaultProvider, resolvedModel: defaultProvider.resolveModel(model), originalModel };
  }

  getProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  setAliases(aliases: Record<string, string>): void {
    this.aliases = aliases;
  }

  setFallbackChain(chain: Record<string, string>): void {
    this.fallbackChain = chain;
  }

  private tryFallback(providerName: string, model: string): { provider: Provider; resolvedModel: string } | null {
    const visited = new Set<string>();
    let current = providerName;
    while (this.fallbackChain[current]) {
      const next = this.fallbackChain[current];
      if (visited.has(next)) break;
      visited.add(next);
      const fallback = this.providers.get(next);
      if (fallback && fallback.config.enabled && (!fallback.isHealthy || fallback.isHealthy())) {
        return { provider: fallback, resolvedModel: fallback.resolveModel(model) };
      }
      current = next;
    }
    return null;
  }
}

export function createRouter(providers: Provider[], defaultProviderName: string, aliases: Record<string, string> = {}, fallbackChain: Record<string, string> = {}): ModelRouter {
  const router = new ModelRouter(defaultProviderName, aliases, fallbackChain);
  for (const provider of providers) {
    router.register(provider);
  }
  return router;
}
