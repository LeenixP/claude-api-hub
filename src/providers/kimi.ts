import type {
  Provider,
  ProviderConfig,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  OpenAIResponse,
  OpenAIStreamChunk,
} from './types.js';
import { translateRequest } from '../translator/anthropic-to-openai.js';
import { translateResponse, translateStreamChunk, createStreamState } from '../translator/openai-to-anthropic.js';

export class KimiProvider implements Provider {
  name = 'kimi';
  config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  matchModel(model: string): boolean {
    return model.startsWith('kimi-');
  }

  resolveModel(model: string): string {
    // kimi-k2.6 is an actual Kimi model ID — don't strip the prefix
    // Only strip `kimi-` when it's a hub alias wrapping a non-kimi-prefixed model
    const stripped = model.replace(/^kimi-/, '');
    // If the stripped name looks like a real Kimi model ID (contains dots or known names), keep original
    // Heuristic: if original starts with 'kimi-' and stripped still looks like a model name, return original
    // Per spec: don't strip if it's already a valid Kimi model name like kimi-k2.6
    return model;
  }

  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string } {
    const resolvedModel = this.resolveModel(req.model);
    const openaiReq = translateRequest(req, resolvedModel);
    return {
      url: `${this.config.baseUrl}/chat/completions`,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiReq),
    };
  }

  parseResponse(raw: OpenAIResponse, originalModel: string): AnthropicResponse {
    return translateResponse(raw, originalModel);
  }

  parseStreamChunk(chunk: OpenAIStreamChunk, originalModel: string): AnthropicStreamEvent[] {
    const state = createStreamState(originalModel);
    return translateStreamChunk(chunk, originalModel, state);
  }
}
