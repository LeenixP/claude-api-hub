import type {
  Provider,
  ProviderConfig,
  StreamContext,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  OpenAIResponse,
  OpenAIStreamChunk,
} from './types.js';
import { KeyPool } from '../services/pool-manager.js';

export class ClaudeProvider implements Provider {
  name: string;
  config: ProviderConfig;
  private prefix: string | string[] | undefined;
  pool: KeyPool | null = null;
  private lastUsedKey: string | null = null;

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
    return this.config.models.some((m) => model === m || model.startsWith(m + '-'));
  }

  resolveModel(model: string): string {
    return model;
  }

  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string } {
    const apiKey = this.pool?.getKey() ?? this.config.apiKey;
    this.lastUsedKey = apiKey;

    return {
      url: `${this.config.baseUrl}/v1/messages`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req),
    };
  }

  reportSuccess(): void {
    if (this.pool && this.lastUsedKey) this.pool.reportSuccess(this.lastUsedKey);
  }

  reportError(): void {
    if (this.pool && this.lastUsedKey) this.pool.reportError(this.lastUsedKey);
  }

  parseResponse(raw: OpenAIResponse, _originalModel: string): AnthropicResponse {
    return raw as unknown as AnthropicResponse;
  }

  createStreamContext(_originalModel: string): StreamContext {
    return { initialized: true };
  }

  parseStreamChunk(chunk: OpenAIStreamChunk, _originalModel: string, _ctx: StreamContext): AnthropicStreamEvent[] {
    return [chunk as unknown as AnthropicStreamEvent];
  }
}
