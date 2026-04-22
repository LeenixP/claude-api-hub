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
    const clean: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.max_tokens,
    };
    if (req.system !== undefined) clean.system = req.system;
    if (req.temperature !== undefined) clean.temperature = req.temperature;
    if (req.top_p !== undefined) clean.top_p = req.top_p;
    if (req.top_k !== undefined) clean.top_k = req.top_k;
    if (req.stream !== undefined) clean.stream = req.stream;
    if (req.stop_sequences) clean.stop_sequences = req.stop_sequences;
    if (req.tools && req.tools.length > 0) clean.tools = req.tools;
    if (req.tool_choice) clean.tool_choice = req.tool_choice;
    if (req.metadata) clean.metadata = req.metadata;
    const rawReq = req as unknown as Record<string, unknown>;
    if (rawReq.thinking) clean.thinking = rawReq.thinking;

    return {
      url: `${this.config.baseUrl}/v1/messages`,
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(clean),
    };
  }

  parseResponse(raw: OpenAIResponse, _originalModel: string): AnthropicResponse {
    return raw as unknown as AnthropicResponse;
  }

  parseStreamChunk(chunk: OpenAIStreamChunk, _originalModel: string): AnthropicStreamEvent[] {
    return [chunk as unknown as AnthropicStreamEvent];
  }
}
