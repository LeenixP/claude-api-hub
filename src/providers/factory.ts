import type { Provider, ProviderConfig } from './types.js';
import { providerRegistry } from './registry.js';
import { ClaudeProvider } from './claude.js';
import { GenericOpenAIProvider } from './generic.js';
import { KiroProvider } from './kiro.js';
import { logger } from '../logger.js';
import { getErrorMessage } from '../utils/error.js';

// Register built-in provider types at module level
providerRegistry.register('anthropic', ClaudeProvider);
providerRegistry.register('openai', GenericOpenAIProvider);
providerRegistry.register('kiro', KiroProvider);

export async function createProvider(config: ProviderConfig): Promise<Provider | null> {
  try {
    const provider = providerRegistry.create(config);
    if (!provider) {
      logger.warn(`No registered provider type for "${config.name}"`);
      return null;
    }
    if ('ensureReady' in provider && typeof (provider as Record<string, unknown>).ensureReady === 'function') {
      await (provider as { ensureReady(): Promise<void> }).ensureReady();
    }
    return provider;
  } catch (err) {
    logger.warn(`Skipping provider "${config.name}": ${getErrorMessage(err)}`);
    return null;
  }
}
