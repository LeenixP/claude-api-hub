import type { ProviderConfig } from './types.js';

/** Match a model name against a provider's configured prefix and model list. */
export function matchModel(model: string, config: ProviderConfig): boolean {
  if (config.prefix !== undefined) {
    const prefixes = Array.isArray(config.prefix) ? config.prefix : [config.prefix];
    return prefixes.some((p) => model.startsWith(p));
  }
  return config.models.some((m) => model === m || model.startsWith(m + '-'));
}

/** Resolve a requested model name to the upstream model ID. */
export function resolveModel(model: string): string {
  return model;
}
