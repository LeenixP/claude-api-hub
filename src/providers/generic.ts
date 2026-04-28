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
import { translateRequest } from '../translator/anthropic-to-openai.js';
import { translateResponse, translateStreamChunk, createStreamState, StreamState } from '../translator/openai-to-anthropic.js';
import { KeyPool } from '../services/pool-manager.js';
import { matchModel, resolveModel } from './model-utils.js';

export class GenericOpenAIProvider implements Provider {
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
    const resolvedModel = this.resolveModel(req.model);
    const openaiReq = translateRequest(req, resolvedModel);
    let apiKey = this.pool?.getKey() ?? this.config.apiKey;
    if (this.pool?.isKnownBadKey(apiKey)) {
      throw new Error('All API keys in the pool are unhealthy');
    }
    return {
      url: `${this.config.baseUrl}/chat/completions`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiReq),
      usedKey: apiKey,
    };
  }

  parseResponse(raw: OpenAIResponse, originalModel: string): AnthropicResponse {
    return translateResponse(raw, originalModel);
  }

  createStreamContext(originalModel: string): StreamContext {
    return { initialized: true, state: createStreamState(originalModel) };
  }

  parseStreamChunk(chunk: OpenAIStreamChunk | string, originalModel: string, ctx: StreamContext): AnthropicStreamEvent[] {
    return translateStreamChunk(chunk as OpenAIStreamChunk, originalModel, ctx.state as StreamState);
  }

  reportSuccess(key?: string): void {
    if (this.pool && key) this.pool.reportSuccess(key);
  }

  reportError(key?: string): void {
    if (this.pool && key) this.pool.reportError(key);
  }
}
