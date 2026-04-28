import type {
  Provider,
  ProviderConfig,
  AnthropicRequest,
  AnthropicResponse,
  OpenAIResponse,
} from './types.js';
import { KeyPool } from '../services/pool-manager.js';
import { matchModel, resolveModel } from './model-utils.js';

export class ClaudeProvider implements Provider {
  readonly name: string;
  readonly config: ProviderConfig;
  private pool: KeyPool | null = null;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
    if (config.apiKeys && config.apiKeys.length > 0) {
      this.pool = new KeyPool(config.apiKeys);
    }
  }

  matchModel(model: string): boolean {
    return matchModel(model, this.config);
  }

  resolveModel(model: string): string {
    return resolveModel(model);
  }

  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string; usedKey: string } {
    const apiKey = this.pool?.getKey() ?? this.config.apiKey;
    if (this.pool?.isKnownBadKey(apiKey)) {
      throw new Error('All API keys in the pool are unhealthy');
    }

    return {
      url: `${this.config.baseUrl}/v1/messages`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req), // passthrough: serialize AnthropicRequest directly
      usedKey: apiKey,
    };
  }

  parseResponse(raw: OpenAIResponse, _originalModel: string): AnthropicResponse {
    return raw as unknown as AnthropicResponse; // passthrough
  }

  reportSuccess(key?: string): void {
    if (this.pool && key) this.pool.reportSuccess(key);
  }

  reportError(key?: string): void {
    if (this.pool && key) this.pool.reportError(key);
  }
}
