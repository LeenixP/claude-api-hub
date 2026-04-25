import type {
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
import { BaseProvider } from './base-provider.js';

export class GenericOpenAIProvider extends BaseProvider {
  constructor(config: ProviderConfig, prefix?: string | string[]) {
    super(config);
    this.prefix = prefix ?? config.prefix;
    this.matchStrategy = 'prefix';
  }

  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string; usedKey: string } {
    const resolvedModel = this.resolveModel(req.model);
    const openaiReq = translateRequest(req, resolvedModel);
    const apiKey = this.pool?.getKey() ?? this.config.apiKey;
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

  parseStreamChunk(chunk: OpenAIStreamChunk, originalModel: string, ctx: StreamContext): AnthropicStreamEvent[] {
    return translateStreamChunk(chunk, originalModel, ctx.state as StreamState);
  }
}
