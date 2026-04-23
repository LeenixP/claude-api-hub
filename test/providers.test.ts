import { describe, it, expect } from 'vitest';
import { ClaudeProvider } from '../src/providers/claude.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import type { ProviderConfig, AnthropicRequest } from '../src/providers/types.js';

const claudeConfig: ProviderConfig = {
  name: 'test-claude',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test',
  models: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
  defaultModel: 'claude-sonnet-4-6',
  enabled: true,
  prefix: 'claude-',
  passthrough: true,
};

const openaiConfig: ProviderConfig = {
  name: 'test-openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  models: ['gpt-4', 'gpt-3.5-turbo'],
  defaultModel: 'gpt-4',
  enabled: true,
  prefix: 'gpt-',
};

const sampleRequest: AnthropicRequest = {
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 1024,
};

describe('ClaudeProvider', () => {
  const provider = new ClaudeProvider(claudeConfig);

  it('matches models by prefix', () => {
    expect(provider.matchModel('claude-sonnet-4-6')).toBe(true);
    expect(provider.matchModel('claude-haiku-4-5')).toBe(true);
    expect(provider.matchModel('gpt-4')).toBe(false);
  });

  it('resolveModel returns model as-is', () => {
    expect(provider.resolveModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('buildRequest creates Anthropic-format request', () => {
    const built = provider.buildRequest(sampleRequest);
    expect(built.url).toBe('https://api.anthropic.com/v1/messages');
    expect(built.headers['x-api-key']).toBe('sk-ant-test');
    expect(built.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(built.body);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.messages).toHaveLength(1);
    expect(body.max_tokens).toBe(1024);
  });

  it('buildRequest includes thinking field', () => {
    const req: AnthropicRequest = {
      ...sampleRequest,
      thinking: { type: 'enabled', budget_tokens: 5000 },
    };
    const built = provider.buildRequest(req);
    const body = JSON.parse(built.body);
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
  });

  it('buildRequest includes optional fields', () => {
    const req: AnthropicRequest = {
      ...sampleRequest,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      stream: true,
      stop_sequences: ['END'],
    };
    const built = provider.buildRequest(req);
    const body = JSON.parse(built.body);
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.top_k).toBe(40);
    expect(body.stream).toBe(true);
    expect(body.stop_sequences).toEqual(['END']);
  });

  it('parseResponse passes through as-is', () => {
    const raw = { id: 'msg_1', type: 'message', role: 'assistant', content: [] } as any;
    const result = provider.parseResponse(raw, 'claude-sonnet-4-6');
    expect(result).toBe(raw);
  });

  it('createStreamContext returns initialized context', () => {
    const ctx = provider.createStreamContext('claude-sonnet-4-6');
    expect(ctx.initialized).toBe(true);
  });
});

describe('GenericOpenAIProvider', () => {
  const provider = new GenericOpenAIProvider(openaiConfig);

  it('matches models by prefix', () => {
    expect(provider.matchModel('gpt-4')).toBe(true);
    expect(provider.matchModel('gpt-3.5-turbo')).toBe(true);
    expect(provider.matchModel('claude-sonnet-4-6')).toBe(false);
  });

  it('matches models by array prefix', () => {
    const multiPrefix = new GenericOpenAIProvider({
      ...openaiConfig,
      prefix: ['gpt-', 'ft:gpt-'],
    });
    expect(multiPrefix.matchModel('gpt-4')).toBe(true);
    expect(multiPrefix.matchModel('ft:gpt-4')).toBe(true);
    expect(multiPrefix.matchModel('llama-3')).toBe(false);
  });

  it('buildRequest creates OpenAI-format request', () => {
    const req: AnthropicRequest = { ...sampleRequest, model: 'gpt-4' };
    const built = provider.buildRequest(req);
    expect(built.url).toBe('https://api.example.com/v1/chat/completions');
    expect(built.headers['Authorization']).toBe('Bearer sk-test');
    const body = JSON.parse(built.body);
    expect(body.model).toBe('gpt-4');
    expect(body.messages).toBeDefined();
  });

  it('parseResponse translates OpenAI to Anthropic format', () => {
    const openaiResp = {
      id: 'chatcmpl-1',
      object: 'chat.completion' as const,
      created: 1234567890,
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: { role: 'assistant' as const, content: 'Hello!' },
        finish_reason: 'stop' as const,
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const result = provider.parseResponse(openaiResp, 'gpt-4');
    expect(result.type).toBe('message');
    expect(result.role).toBe('assistant');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello!' });
    expect(result.stop_reason).toBe('end_turn');
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(5);
  });

  it('createStreamContext returns context with state', () => {
    const ctx = provider.createStreamContext('gpt-4');
    expect(ctx.initialized).toBe(true);
    expect(ctx.state).toBeDefined();
  });

  it('parseStreamChunk uses persistent state across calls', () => {
    const ctx = provider.createStreamContext('gpt-4');
    const chunk1 = {
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk' as const,
      created: 123,
      model: 'gpt-4',
      choices: [{ index: 0, delta: { role: 'assistant' as const, content: 'Hi' }, finish_reason: null }],
    };
    const events1 = provider.parseStreamChunk(chunk1, 'gpt-4', ctx);
    expect(events1.some(e => e.type === 'message_start')).toBe(true);

    const chunk2 = {
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk' as const,
      created: 123,
      model: 'gpt-4',
      choices: [{ index: 0, delta: { content: ' there' }, finish_reason: null }],
    };
    const events2 = provider.parseStreamChunk(chunk2, 'gpt-4', ctx);
    // Should NOT emit message_start again
    expect(events2.some(e => e.type === 'message_start')).toBe(false);
    expect(events2.some(e => e.type === 'content_block_delta')).toBe(true);
  });
});
