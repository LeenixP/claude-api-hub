import type {
  StreamContext,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  OpenAIResponse,
  OpenAIStreamChunk,
} from './types.js';
import { BaseProvider } from './base-provider.js';

export class ClaudeProvider extends BaseProvider {
  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string; usedKey: string } {
    const apiKey = this.pool?.getKey() ?? this.config.apiKey;
    return {
      url: `${this.config.baseUrl}/v1/messages`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(req),
      usedKey: apiKey,
    };
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
