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

export class MiniMaxProvider implements Provider {
  name = 'minimax';
  config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  matchModel(model: string): boolean {
    return /^(minimax|MiniMax)-/i.test(model);
  }

  resolveModel(model: string): string {
    // Already a MiniMax-* canonical name — return as-is
    if (model.startsWith('MiniMax-')) {
      return model;
    }
    // Map hub alias minimax-* → MiniMax-* (capitalize and adjust casing)
    // e.g. minimax-m2.7 → MiniMax-M2.7
    const suffix = model.replace(/^minimax-/i, '');
    // Capitalize first letter of suffix segments
    const canonical = suffix
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('.');
    return `MiniMax-${canonical}`;
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
