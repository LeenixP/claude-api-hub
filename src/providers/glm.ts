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

export class GLMProvider implements Provider {
  name = 'glm';
  config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  matchModel(model: string): boolean {
    return model.startsWith('glm-');
  }

  resolveModel(model: string): string {
    // Actual GLM model IDs already use glm- prefix (e.g. glm-4-plus, glm-4-flash)
    // Return as-is — no stripping needed
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
