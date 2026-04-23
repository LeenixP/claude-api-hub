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

export class GenericOpenAIProvider implements Provider {
  name: string;
  config: ProviderConfig;
  private prefix: string | string[] | undefined;
  pool: KeyPool | null = null;
  private lastUsedKey: string | null = null;

  constructor(config: ProviderConfig, prefix?: string | string[]) {
    this.name = config.name;
    this.config = config;
    this.prefix = prefix ?? config.prefix;
    if (config.apiKeys && config.apiKeys.length > 0) {
      this.pool = new KeyPool(config.apiKeys);
    }
  }

  matchModel(model: string): boolean {
    if (this.prefix !== undefined) {
      const prefixes = Array.isArray(this.prefix) ? this.prefix : [this.prefix];
      return prefixes.some((p) => model.startsWith(p));
    }
    return this.config.models.some((m) => model.startsWith(m));
  }

  resolveModel(model: string): string {
    return model;
  }

  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string } {
    const resolvedModel = this.resolveModel(req.model);
    const openaiReq = translateRequest(req, resolvedModel);
    const apiKey = this.pool?.getKey() ?? this.config.apiKey;
    this.lastUsedKey = apiKey;
    return {
      url: `${this.config.baseUrl}/chat/completions`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiReq),
    };
  }

  reportSuccess(): void {
    if (this.pool && this.lastUsedKey) this.pool.reportSuccess(this.lastUsedKey);
  }

  reportError(): void {
    if (this.pool && this.lastUsedKey) this.pool.reportError(this.lastUsedKey);
  }

  parseResponse(raw: OpenAIResponse, originalModel: string): AnthropicResponse {
    return translateResponse(raw, originalModel);
  }

  createStreamContext(originalModel: string): StreamContext {
    return { initialized: true, state: createStreamState(originalModel) };
  }

  parseStreamChunk(chunk: OpenAIStreamChunk, originalModel: string, ctx: StreamContext): AnthropicStreamEvent[] {
    return translateStreamChunk(chunk, originalModel, ctx.state as StreamState);
  }
}
