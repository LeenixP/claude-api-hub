import type {
  Provider,
  ProviderConfig,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  OpenAIResponse,
  OpenAIStreamChunk,
} from './types.js';

export class ClaudeProvider implements Provider {
  name = 'claude';
  config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  matchModel(model: string): boolean {
    return model.startsWith('claude-');
  }

  resolveModel(model: string): string {
    return model;
  }

  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string } {
    return {
      url: `${this.config.baseUrl}/v1/messages`,
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req),
    };
  }

  parseResponse(raw: OpenAIResponse, _originalModel: string): AnthropicResponse {
    // Passthrough: raw is already AnthropicResponse shape
    return raw as unknown as AnthropicResponse;
  }

  parseStreamChunk(chunk: OpenAIStreamChunk, _originalModel: string): AnthropicStreamEvent[] {
    // Passthrough: chunk is already an Anthropic SSE event
    return [chunk as unknown as AnthropicStreamEvent];
  }
}
