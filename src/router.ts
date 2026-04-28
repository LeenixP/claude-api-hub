import { Provider, RouteResult } from './providers/types.js';
import { logger } from './logger.js';

/** Routes Claude model names to configured providers via alias resolution and fallback chains. */
export class ModelRouter {
  private providers: Map<string, Provider> = new Map();
  private aliases: Record<string, string>;
  private fallbackChain: Record<string, string>;

  constructor(aliases: Record<string, string> = {}, fallbackChain: Record<string, string> = {}) {
    this.aliases = aliases;
    this.fallbackChain = fallbackChain;
  }

  register(provider: Provider): void {
    this.providers.set(provider.name, provider);
    this.detectConflicts();
  }

  clear(): void {
    this.providers.clear();
  }

  replaceAll(providers: Provider[]): void {
    const newMap = new Map<string, Provider>();
    for (const p of providers) newMap.set(p.name, p);
    this.providers = newMap;
    this.detectConflicts();
  }

  /** Resolve a model name through aliases, tier matching, provider lookup, and fallback chain.
   *  Supports explicit provider targeting via "providerKey/model" syntax in both model names and alias values. */
  route(model: string): RouteResult {
    const originalModel = model;

    // Explicit provider targeting: "providerKey/model"
    const targeted = this.tryTargetedRoute(model, originalModel);
    if (targeted) return targeted;

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

    // Check again after alias resolution (alias value may contain "providerKey/model")
    const aliasTargeted = this.tryTargetedRoute(model, originalModel);
    if (aliasTargeted) return aliasTargeted;

    for (const provider of this.providers.values()) {
      if (provider.config.enabled && provider.matchModel(model)) {
        return { provider, resolvedModel: provider.resolveModel(model), originalModel };
      }
    }

    throw new Error(`No route found for model "${originalModel}". Check provider configuration.`);
  }

  getProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  setAliases(aliases: Record<string, string>): void {
    this.aliases = aliases;
  }

  /**
   * Resolve a fallback provider for the given provider name.
   * Returns undefined if no fallback is configured.
   */
  resolveFallback(providerName: string): Provider | undefined {
    const target = this.fallbackChain[providerName];
    if (!target) return undefined;
    const fallback = this.providers.get(target);
    if (!fallback || !fallback.config.enabled) return undefined;
    return fallback;
  }

  getFallbackChain(): Record<string, string> {
    return { ...this.fallbackChain };
  }

  private getProviderKey(provider: Provider): string {
    return provider.config.key || provider.name;
  }

  private tryTargetedRoute(model: string, originalModel: string): RouteResult | null {
    const slashIdx = model.indexOf('/');
    if (slashIdx <= 0) return null;
    const providerKey = model.substring(0, slashIdx);
    const actualModel = model.substring(slashIdx + 1);
    for (const provider of this.providers.values()) {
      const configKey = this.getProviderKey(provider);
      if ((configKey === providerKey || provider.name === providerKey) && provider.config.enabled) {
        return { provider, resolvedModel: provider.resolveModel(actualModel), originalModel };
      }
    }
    return null;
  }

  private detectConflicts(): void {
    const modelOwners = new Map<string, string[]>();
    for (const provider of this.providers.values()) {
      if (!provider.config.enabled) continue;
      const key = this.getProviderKey(provider);
      for (const m of provider.config.models) {
        const owners = modelOwners.get(m) || [];
        owners.push(key);
        modelOwners.set(m, owners);
      }
    }
    for (const [model, owners] of modelOwners) {
      if (owners.length > 1) {
        logger.warn(`[warn] Model "${model}" exists in multiple providers: ${owners.join(', ')}. Use "providerKey/${model}" to disambiguate.`);
      }
    }
  }
}

export function createRouter(providers: Provider[], aliases: Record<string, string> = {}, fallbackChain: Record<string, string> = {}): ModelRouter {
  const router = new ModelRouter(aliases, fallbackChain);
  for (const provider of providers) {
    router.register(provider);
  }
  return router;
}
