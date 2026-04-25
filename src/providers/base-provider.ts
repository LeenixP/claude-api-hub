import type {
  Provider,
  ProviderConfig,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  OpenAIResponse,
  OpenAIStreamChunk,
  StreamContext,
} from './types.js';
import { KeyPool } from '../services/pool-manager.js';

export abstract class BaseProvider implements Provider {
  name: string;
  config: ProviderConfig;
  protected prefix: string | string[] | undefined;
  protected matchStrategy: 'exact' | 'prefix' = 'exact';
  pool: KeyPool | null = null;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
    this.prefix = config.prefix;
    if (config.apiKeys && config.apiKeys.length > 0) {
      this.pool = new KeyPool(config.apiKeys);
    }
  }

  matchModel(model: string): boolean {
    if (this.prefix !== undefined) {
      const prefixes = Array.isArray(this.prefix) ? this.prefix : [this.prefix];
      return prefixes.some((p) => model.startsWith(p));
    }
    if (this.matchStrategy === 'prefix') {
      return this.config.models.some((m) => model.startsWith(m));
    }
    return this.config.models.some((m) => model === m || model.startsWith(m + '-'));
  }

  resolveModel(model: string): string {
    return model;
  }

  abstract buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string; usedKey: string };

  reportSuccess(key?: string): void {
    if (this.pool && key) this.pool.reportSuccess(key);
  }

  reportError(key?: string): void {
    if (this.pool && key) this.pool.reportError(key);
  }

  abstract parseResponse(raw: OpenAIResponse, originalModel: string): AnthropicResponse;

  abstract createStreamContext(originalModel: string): StreamContext;

  abstract parseStreamChunk(chunk: OpenAIStreamChunk, originalModel: string, ctx: StreamContext): AnthropicStreamEvent[];
}
