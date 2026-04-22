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
  name: string;
  config: ProviderConfig;
  private prefix: string | string[] | undefined;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
    this.prefix = config.prefix;
  }

  matchModel(model: string): boolean {
    if (this.prefix !== undefined) {
      const prefixes = Array.isArray(this.prefix) ? this.prefix : [this.prefix];
      return prefixes.some((p) => model.startsWith(p));
    }
    return this.config.models.some((m) => model.startsWith(m) || m.startsWith(model));
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
    return raw as unknown as AnthropicResponse;
  }

  parseStreamChunk(chunk: OpenAIStreamChunk, _originalModel: string): AnthropicStreamEvent[] {
    return [chunk as unknown as AnthropicStreamEvent];
  }
}
